import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { z } from "zod";

export const earningActionKindSchema = z.enum([
  "publish_offer",
  "contact_prospect",
  "purchase",
  "open_account",
  "move_money"
]);

export const earningActionProposalSchema = z.object({
  kind: earningActionKindSchema,
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(1_200),
  rationale: z.string().trim().min(1).max(600),
  successMetric: z.string().trim().min(1).max(400),
  estimatedCostCny: z.number().finite().min(0).max(10_000_000).default(0)
});

export const earningActionEvidenceSchema = z.object({
  kind: z.enum([
    "publication_url",
    "outreach_receipt",
    "purchase_receipt",
    "account_receipt",
    "payment_record"
  ]),
  reference: z.string().trim().min(1).max(2_000),
  recordedAt: z.string().datetime()
});

export const earningActionRecordSchema = earningActionProposalSchema.extend({
  id: z.string().min(1),
  sourceLogId: z.string().min(1),
  requiresApproval: z.literal(true),
  status: z.enum(["pending_approval", "approved", "rejected", "completed", "failed"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  decisionAt: z.string().datetime().optional(),
  evidence: z.array(earningActionEvidenceSchema).default([])
});

export type EarningActionProposal = z.infer<typeof earningActionProposalSchema>;
export type EarningActionEvidence = z.infer<typeof earningActionEvidenceSchema>;
export type EarningActionRecord = z.infer<typeof earningActionRecordSchema>;

export function parseEarningActionProposals(value: unknown): EarningActionProposal[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 5)
    .map((item) => earningActionProposalSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data)
    .filter((proposal) => !containsCredentialLikeText(Object.values(proposal).join(" ")));
}

export class FileSystemEarningActionStore {
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly path: string) {}

  async list(): Promise<EarningActionRecord[]> {
    return this.serialize(() => this.load());
  }

  private async load(): Promise<EarningActionRecord[]> {
    let content: string;
    try {
      content = await readFile(this.path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }

    const records = z.array(earningActionRecordSchema).parse(JSON.parse(content));
    return records.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async addProposals(
    proposals: EarningActionProposal[],
    sourceLogId: string,
    now = new Date()
  ): Promise<EarningActionRecord[]> {
    return this.serialize(() => this.addProposalsSerial(proposals, sourceLogId, now));
  }

  private async addProposalsSerial(
    proposals: EarningActionProposal[],
    sourceLogId: string,
    now: Date
  ): Promise<EarningActionRecord[]> {
    const normalized = parseEarningActionProposals(proposals);
    if (normalized.length === 0) return [];

    const records = await this.load();
    const timestamp = now.toISOString();
    const created = normalized.map<EarningActionRecord>((proposal) => ({
      ...proposal,
      id: crypto.randomUUID(),
      sourceLogId,
      requiresApproval: true,
      status: "pending_approval",
      createdAt: timestamp,
      updatedAt: timestamp,
      evidence: []
    }));
    await this.save([...records, ...created]);
    return created;
  }

  async decide(
    id: string,
    decision: "approved" | "rejected",
    now = new Date()
  ): Promise<EarningActionRecord> {
    return this.serialize(() => this.decideSerial(id, decision, now));
  }

  private async decideSerial(
    id: string,
    decision: "approved" | "rejected",
    now: Date
  ): Promise<EarningActionRecord> {
    const records = await this.load();
    const record = records.find((candidate) => candidate.id === id);
    if (!record) throw new Error(`Earning action not found: ${id}`);
    if (record.status !== "pending_approval") {
      throw new Error(`Earning action is not awaiting approval: ${id}`);
    }

    const timestamp = now.toISOString();
    record.status = decision;
    record.decisionAt = timestamp;
    record.updatedAt = timestamp;
    await this.save(records);
    return record;
  }

  async complete(
    id: string,
    evidence: EarningActionEvidence,
    now = new Date()
  ): Promise<EarningActionRecord> {
    return this.serialize(() => this.completeSerial(id, evidence, now));
  }

  private async completeSerial(
    id: string,
    evidence: EarningActionEvidence,
    now: Date
  ): Promise<EarningActionRecord> {
    const records = await this.load();
    const record = records.find((candidate) => candidate.id === id);
    if (!record) throw new Error(`Earning action not found: ${id}`);
    if (record.status !== "approved") {
      throw new Error(`Earning action must be approved before completion: ${id}`);
    }

    const parsedEvidence = earningActionEvidenceSchema.parse(evidence);
    if (!isCompletionEvidence(record.kind, parsedEvidence.kind)) {
      throw new Error(`Evidence kind ${parsedEvidence.kind} cannot complete ${record.kind}.`);
    }

    record.evidence.push(parsedEvidence);
    record.status = "completed";
    record.updatedAt = now.toISOString();
    await this.save(records);
    return record;
  }

  private async save(records: EarningActionRecord[]): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, JSON.stringify(records, null, 2), "utf8");
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

function isCompletionEvidence(
  actionKind: EarningActionRecord["kind"],
  evidenceKind: EarningActionEvidence["kind"]
): boolean {
  const expected: Record<EarningActionRecord["kind"], EarningActionEvidence["kind"]> = {
    publish_offer: "publication_url",
    contact_prospect: "outreach_receipt",
    purchase: "purchase_receipt",
    open_account: "account_receipt",
    move_money: "payment_record"
  };
  return evidenceKind === expected[actionKind];
}

function containsCredentialLikeText(value: string): boolean {
  return [
    /sk-[A-Za-z0-9_-]{16,}/,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
    /\b\d{12,19}\b/
  ].some((pattern) => pattern.test(value));
}
