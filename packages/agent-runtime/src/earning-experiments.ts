import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { z } from "zod";

export const earningExperimentProposalSchema = z.object({
  id: z.string().trim().min(1).max(120).optional(),
  title: z.string().trim().min(1).max(160),
  hypothesis: z.string().trim().min(1).max(1_200),
  offerSummary: z.string().trim().min(1).max(1_200),
  windowDays: z.number().int().min(1).max(365),
  targetQualifiedInquiries: z.number().int().min(0).max(1_000_000),
  targetPaidCustomers: z.number().int().min(0).max(1_000_000),
  projectedRevenueCny: z.number().finite().min(0).max(1_000_000_000),
  cashCostLimitCny: z.number().finite().min(0).max(1_000_000_000)
});

export const earningRevenueEvidenceSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("payment_record"),
  amountCny: z.number().finite().positive().max(1_000_000_000),
  reference: z.string().trim().min(1).max(2_000),
  recordedAt: z.string().datetime(),
  actionId: z.string().min(1).optional()
});

export const earningExperimentMetricsSchema = z.object({
  qualifiedInquiries: z.number().int().min(0).max(1_000_000).default(0),
  paidCustomers: z.number().int().min(0).max(1_000_000).default(0),
  deliveredOrders: z.number().int().min(0).max(1_000_000).default(0),
  notes: z.string().trim().max(4_000).default("")
});

export const earningExperimentMetricsPatchSchema = earningExperimentMetricsSchema.partial();

export const earningExperimentRecordSchema = earningExperimentProposalSchema
  .extend({
    id: z.string().min(1),
    status: z.enum(["draft", "running", "paused", "completed", "stopped"]),
    actionIds: z.array(z.string().min(1)).default([]),
    metrics: earningExperimentMetricsSchema,
    revenueEvidence: z.array(earningRevenueEvidenceSchema).default([]),
    verifiedRevenueCny: z.number().finite().min(0).max(1_000_000_000),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    startedAt: z.string().datetime().optional(),
    endedAt: z.string().datetime().optional()
  })
  .superRefine((record, context) => {
    const evidenceTotal = sumRevenue(record.revenueEvidence);
    if (Math.abs(evidenceTotal - record.verifiedRevenueCny) > 0.001) {
      context.addIssue({
        code: "custom",
        path: ["verifiedRevenueCny"],
        message: "Verified revenue must equal the sum of payment evidence."
      });
    }
  });

export type EarningExperimentProposal = z.infer<typeof earningExperimentProposalSchema>;
export type EarningExperimentRecord = z.infer<typeof earningExperimentRecordSchema>;
export type EarningRevenueEvidence = z.infer<typeof earningRevenueEvidenceSchema>;

export class FileSystemEarningExperimentStore {
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly path: string) {}

  async list(): Promise<EarningExperimentRecord[]> {
    return this.serialize(() => this.load());
  }

  async create(
    proposal: EarningExperimentProposal,
    now = new Date()
  ): Promise<EarningExperimentRecord> {
    return this.serialize(async () => {
      const parsed = earningExperimentProposalSchema.parse(proposal);
      const records = await this.load();
      const id = parsed.id ?? crypto.randomUUID();
      if (records.some((record) => record.id === id)) {
        throw new Error(`Earning experiment already exists: ${id}`);
      }
      const timestamp = now.toISOString();
      const record = earningExperimentRecordSchema.parse({
        ...parsed,
        id,
        status: "draft",
        actionIds: [],
        metrics: {
          qualifiedInquiries: 0,
          paidCustomers: 0,
          deliveredOrders: 0,
          notes: ""
        },
        revenueEvidence: [],
        verifiedRevenueCny: 0,
        createdAt: timestamp,
        updatedAt: timestamp
      });
      await this.save([...records, record]);
      return record;
    });
  }

  async attachAction(
    experimentId: string,
    actionId: string,
    now = new Date()
  ): Promise<EarningExperimentRecord> {
    return this.serialize(async () => {
      const records = await this.load();
      const record = requireExperiment(records, experimentId);
      if (!record.actionIds.includes(actionId)) record.actionIds.push(actionId);
      record.updatedAt = now.toISOString();
      await this.save(records);
      return record;
    });
  }

  async start(experimentId: string, now = new Date()): Promise<EarningExperimentRecord> {
    return this.serialize(async () => {
      const records = await this.load();
      const record = requireExperiment(records, experimentId);
      if (record.status !== "draft" && record.status !== "paused") {
        throw new Error(`Earning experiment cannot start from ${record.status}: ${experimentId}`);
      }
      const timestamp = now.toISOString();
      record.status = "running";
      record.startedAt ??= timestamp;
      record.endedAt = undefined;
      record.updatedAt = timestamp;
      await this.save(records);
      return record;
    });
  }

  async startForAction(
    actionId: string,
    now = new Date()
  ): Promise<EarningExperimentRecord[]> {
    return this.serialize(async () => {
      const records = await this.load();
      const timestamp = now.toISOString();
      const started = records.filter(
        (record) => record.status === "draft" && record.actionIds.includes(actionId)
      );
      for (const record of started) {
        record.status = "running";
        record.startedAt = timestamp;
        record.updatedAt = timestamp;
      }
      if (started.length > 0) await this.save(records);
      return started;
    });
  }

  async recordMetrics(
    experimentId: string,
    metrics: z.input<typeof earningExperimentMetricsPatchSchema>,
    now = new Date()
  ): Promise<EarningExperimentRecord> {
    return this.serialize(async () => {
      const records = await this.load();
      const record = requireExperiment(records, experimentId);
      const patch = earningExperimentMetricsPatchSchema.parse(metrics);
      record.metrics = earningExperimentMetricsSchema.parse({ ...record.metrics, ...patch });
      record.updatedAt = now.toISOString();
      await this.save(records);
      return record;
    });
  }

  async recordRevenue(
    experimentId: string,
    evidence: Omit<EarningRevenueEvidence, "id"> & { id?: string },
    now = new Date()
  ): Promise<EarningExperimentRecord> {
    return this.serialize(async () => {
      const records = await this.load();
      const record = requireExperiment(records, experimentId);
      if (record.status !== "running" && record.status !== "completed") {
        throw new Error(`Revenue cannot be recorded for ${record.status} experiment: ${experimentId}`);
      }
      const parsedEvidence = earningRevenueEvidenceSchema.parse({
        ...evidence,
        id: evidence.id ?? crypto.randomUUID()
      });
      if (
        record.revenueEvidence.some(
          (item) => item.id === parsedEvidence.id || item.reference === parsedEvidence.reference
        )
      ) {
        throw new Error(`Payment evidence already exists: ${parsedEvidence.reference}`);
      }
      record.revenueEvidence.push(parsedEvidence);
      record.verifiedRevenueCny = sumRevenue(record.revenueEvidence);
      record.updatedAt = now.toISOString();
      await this.save(records);
      return record;
    });
  }

  private async load(): Promise<EarningExperimentRecord[]> {
    let content: string;
    try {
      content = await readFile(this.path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const records = z.array(earningExperimentRecordSchema).parse(JSON.parse(content));
    return records.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  private async save(records: EarningExperimentRecord[]): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const validated = z.array(earningExperimentRecordSchema).parse(records);
    await writeFile(this.path, JSON.stringify(validated, null, 2), "utf8");
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation);
    this.operationQueue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
}

function requireExperiment(
  records: EarningExperimentRecord[],
  id: string
): EarningExperimentRecord {
  const record = records.find((candidate) => candidate.id === id);
  if (!record) throw new Error(`Earning experiment not found: ${id}`);
  return record;
}

function sumRevenue(evidence: EarningRevenueEvidence[]): number {
  return Math.round(evidence.reduce((total, item) => total + item.amountCny, 0) * 100) / 100;
}
