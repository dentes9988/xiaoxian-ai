import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { z } from "zod";

import type {
  InternetSource,
  InternetToolExecutionResult,
  InternetToolExecutor
} from "./internet-tools.js";

const researchSourceSchema = z.object({
  title: z.string().trim().min(1).max(300),
  url: z.string().url().max(2_048),
  snippet: z.string().trim().max(1_500).optional(),
  publishedAt: z.string().trim().max(120).optional()
});

const pricingSignalSchema = z.object({
  currency: z.enum(["CNY", "USD"]),
  amount: z.number().finite().positive().max(1_000_000_000),
  sourceUrl: z.string().url(),
  context: z.string().trim().min(1).max(300)
});

export const earningResearchRecordSchema = z.object({
  id: z.string().min(1),
  experimentId: z.string().min(1),
  generatedAt: z.string().datetime(),
  status: z.enum(["completed", "partial", "failed"]),
  queries: z.array(
    z.object({
      query: z.string().trim().min(2).max(300),
      ok: z.boolean(),
      sourceCount: z.number().int().min(0).max(100),
      errorCode: z.string().trim().max(120).optional()
    })
  ),
  sources: z.array(researchSourceSchema).max(30),
  pricingSignals: z.array(pricingSignalSchema).max(100),
  recommendation: z.object({
    proposedUnitPriceCny: z.number().finite().positive().optional(),
    recommendedUnitPriceCny: z.number().finite().positive().optional(),
    positioning: z.enum(["early_access", "market_validation", "premium", "insufficient_evidence"]),
    rationale: z.array(z.string().trim().min(1).max(500)).min(1).max(8)
  }),
  publicDraft: z.object({
    headline: z.string().trim().min(1).max(200),
    summary: z.string().trim().min(1).max(1_500),
    priceText: z.string().trim().min(1).max(200),
    deliverables: z.array(z.string().trim().min(1).max(300)).min(1).max(12),
    exclusions: z.array(z.string().trim().min(1).max(300)).max(12),
    supportDays: z.number().int().min(0).max(365),
    capacity: z.number().int().min(1).max(1_000),
    validationTarget: z.string().trim().min(1).max(500),
    approvalRequired: z.literal(true)
  }),
  boundaries: z.object({
    publicResearchOnly: z.literal(true),
    containsPrivatePaymentData: z.literal(false),
    published: z.literal(false),
    contactedAnyone: z.literal(false),
    spentMoney: z.literal(false)
  })
});

export type EarningResearchRecord = z.infer<typeof earningResearchRecordSchema>;
export type EarningPricingSignal = z.infer<typeof pricingSignalSchema>;

export interface RunEarningResearchOptions {
  experimentId: string;
  offerName: string;
  publicOfferTopic: string;
  executor: InternetToolExecutor;
  proposedUnitPriceCny?: number;
  capacity?: number;
  supportDays?: number;
  windowDays?: number;
  targetQualifiedInquiries?: number;
  targetPaidCustomers?: number;
  now?: Date;
}

export async function runEarningResearch(
  options: RunEarningResearchOptions
): Promise<EarningResearchRecord> {
  const topic = sanitizePublicOfferTopic(options.publicOfferTopic);
  const offerName = sanitizePublicOfferTopic(options.offerName);
  const queries = [
    `${topic} pricing setup service`,
    "本地部署 AI 助手 安装服务 价格",
    `${topic} privacy local-first demand`
  ].map((query) => query.slice(0, 300));
  const results: InternetToolExecutionResult[] = [];
  for (const query of queries) {
    results.push(
      await options.executor.execute({
        kind: "web_search",
        query,
        maxResults: 5
      })
    );
  }

  const sources = deduplicateSources(results.flatMap((result) => result.sources)).slice(0, 30);
  const pricingSignals = extractPricingSignals(sources);
  const successfulQueries = results.filter((result) => result.ok).length;
  const status =
    sources.length === 0
      ? "failed"
      : successfulQueries === results.length
        ? "completed"
        : "partial";
  const recommendation = buildPriceRecommendation(
    options.proposedUnitPriceCny,
    pricingSignals
  );
  const capacity = clampInteger(options.capacity ?? 5, 1, 1_000);
  const supportDays = clampInteger(options.supportDays ?? 7, 0, 365);
  const windowDays = clampInteger(options.windowDays ?? 7, 1, 365);
  const inquiryTarget = clampInteger(options.targetQualifiedInquiries ?? 3, 0, 1_000_000);
  const paidTarget = clampInteger(options.targetPaidCustomers ?? 1, 0, 1_000_000);

  return earningResearchRecordSchema.parse({
    id: crypto.randomUUID(),
    experimentId: options.experimentId,
    generatedAt: (options.now ?? new Date()).toISOString(),
    status,
    queries: results.map((result) => ({
      query:
        result.request.kind === "web_search"
          ? result.request.query
          : result.request.url,
      ok: result.ok,
      sourceCount: result.sources.length,
      errorCode: result.errorCode
    })),
    sources,
    pricingSignals,
    recommendation,
    publicDraft: {
      headline: `${offerName}${/安装$/.test(offerName) ? "早鸟计划" : "早鸟安装计划"}`,
      summary:
        "在用户自己的设备上完成安装、基础模型配置、隐私检查和可用性验证；先以有限名额验证真实付费需求。",
      priceText: recommendation.recommendedUnitPriceCny
        ? `早鸟价 ¥${formatAmount(recommendation.recommendedUnitPriceCny)} / 台`
        : "价格在确认设备环境后报价",
      deliverables: [
        "安装前设备与系统环境检查",
        "xiaoxian AI 本地运行环境安装",
        "对话模型与本地回退模型配置",
        "互联网搜索、公开网页读取与来源展示检查",
        "本地记忆、持续学习和隐私边界检查",
        `${supportDays} 天安装后问题支持`
      ],
      exclusions: [
        "不包含硬件采购费用",
        "不包含第三方模型 API 使用费",
        "不承诺未经验证的收入结果",
        "发布、联系客户和收款仍需用户明确授权"
      ],
      supportDays,
      capacity,
      validationTarget: `${windowDays} 天内获得 ${inquiryTarget} 个有效咨询或 ${paidTarget} 个付费试单。`,
      approvalRequired: true
    },
    boundaries: {
      publicResearchOnly: true,
      containsPrivatePaymentData: false,
      published: false,
      contactedAnyone: false,
      spentMoney: false
    }
  });
}

export function extractPricingSignals(sources: InternetSource[]): EarningPricingSignal[] {
  const signals: EarningPricingSignal[] = [];
  const seen = new Set<string>();
  for (const source of sources) {
    const text = `${source.title} ${source.snippet ?? ""}`;
    collectPricingMatches(text, source.url, /(?:¥|￥|人民币\s*|RMB\s*|CNY\s*)(\d[\d,]*(?:\.\d+)?)/gi, "CNY", signals, seen);
    collectPricingMatches(text, source.url, /(\d[\d,]*(?:\.\d+)?)\s*元/gi, "CNY", signals, seen);
    collectPricingMatches(text, source.url, /\$(\d[\d,]*(?:\.\d+)?)/g, "USD", signals, seen);
  }
  return signals.slice(0, 100);
}

export class FileSystemEarningResearchStore {
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly path: string) {}

  async list(experimentId?: string): Promise<EarningResearchRecord[]> {
    return this.serialize(async () => {
      const records = await this.load();
      return experimentId
        ? records.filter((record) => record.experimentId === experimentId)
        : records;
    });
  }

  async append(record: EarningResearchRecord): Promise<EarningResearchRecord> {
    return this.serialize(async () => {
      const parsed = earningResearchRecordSchema.parse(record);
      const records = await this.load();
      const next = [...records.filter((item) => item.id !== parsed.id), parsed]
        .sort((left, right) => left.generatedAt.localeCompare(right.generatedAt))
        .slice(-365);
      await this.save(next);
      return parsed;
    });
  }

  private async load(): Promise<EarningResearchRecord[]> {
    try {
      const content = await readFile(this.path, "utf8");
      return z.array(earningResearchRecordSchema).parse(JSON.parse(content));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  private async save(records: EarningResearchRecord[]): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const validated = z.array(earningResearchRecordSchema).parse(records);
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

export const earningResearchSchedulerStateSchema = z.object({
  lastAttemptDate: z.string().optional(),
  lastAttemptAt: z.string().datetime().optional(),
  lastCompletedAt: z.string().datetime().optional(),
  lastStatus: z.enum(["running", "completed", "no_experiments", "failed"]).optional(),
  lastRecordIds: z.array(z.string()).default([]),
  lastError: z.string().max(1_000).optional()
});

export type EarningResearchSchedulerState = z.infer<
  typeof earningResearchSchedulerStateSchema
>;

export class DailyEarningResearchScheduler {
  private readonly intervalMs: number;
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly options: {
      statePath: string;
      enabled?: boolean;
      run: (now: Date) => Promise<EarningResearchRecord[]>;
      intervalMs?: number;
    }
  ) {
    this.intervalMs = options.intervalMs ?? 6 * 60 * 60 * 1_000;
  }

  start(): void {
    if (this.timer || this.options.enabled === false) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async getStatus(): Promise<{
    running: boolean;
    enabled: boolean;
    intervalMs: number;
    persisted: EarningResearchSchedulerState;
  }> {
    return {
      running: this.running,
      enabled: this.options.enabled !== false,
      intervalMs: this.intervalMs,
      persisted: await loadEarningResearchSchedulerState(this.options.statePath)
    };
  }

  async tick(now = new Date()): Promise<
    | { status: "disabled" | "already_running" | "already_attempted" }
    | { status: "completed" | "no_experiments"; records: EarningResearchRecord[] }
    | { status: "failed"; error: string }
  > {
    if (this.options.enabled === false) return { status: "disabled" };
    if (this.running) return { status: "already_running" };

    const dateKey = localDateKey(now);
    const previous = await loadEarningResearchSchedulerState(this.options.statePath);
    if (
      previous.lastAttemptDate === dateKey &&
      previous.lastStatus !== "failed" &&
      previous.lastStatus !== "running"
    ) {
      return { status: "already_attempted" };
    }

    this.running = true;
    await saveEarningResearchSchedulerState(this.options.statePath, {
      ...previous,
      lastAttemptDate: dateKey,
      lastAttemptAt: now.toISOString(),
      lastStatus: "running",
      lastError: undefined
    });

    try {
      const records = await this.options.run(now);
      const status = records.length > 0 ? "completed" : "no_experiments";
      await saveEarningResearchSchedulerState(this.options.statePath, {
        lastAttemptDate: dateKey,
        lastAttemptAt: now.toISOString(),
        lastCompletedAt: new Date().toISOString(),
        lastStatus: status,
        lastRecordIds: records.map((record) => record.id)
      });
      return { status, records };
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 1_000);
      await saveEarningResearchSchedulerState(this.options.statePath, {
        lastAttemptDate: dateKey,
        lastAttemptAt: now.toISOString(),
        lastCompletedAt: previous.lastCompletedAt,
        lastStatus: "failed",
        lastRecordIds: previous.lastRecordIds,
        lastError: message
      });
      return { status: "failed", error: message };
    } finally {
      this.running = false;
    }
  }
}

export async function loadEarningResearchSchedulerState(
  path: string
): Promise<EarningResearchSchedulerState> {
  try {
    return earningResearchSchedulerStateSchema.parse(
      JSON.parse(await readFile(path, "utf8"))
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return earningResearchSchedulerStateSchema.parse({});
    }
    throw error;
  }
}

async function saveEarningResearchSchedulerState(
  path: string,
  state: EarningResearchSchedulerState
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const validated = earningResearchSchedulerStateSchema.parse(state);
  await writeFile(path, JSON.stringify(validated, null, 2), "utf8");
}

function buildPriceRecommendation(
  proposedUnitPriceCny: number | undefined,
  signals: EarningPricingSignal[]
): EarningResearchRecord["recommendation"] {
  const cnyAmounts = signals
    .filter((signal) => signal.currency === "CNY")
    .map((signal) => signal.amount)
    .sort((left, right) => left - right);
  const evidenceMedian = median(cnyAmounts);
  const recommendedUnitPriceCny = proposedUnitPriceCny ?? evidenceMedian;
  const rationale: string[] = [];
  let positioning: EarningResearchRecord["recommendation"]["positioning"] =
    "insufficient_evidence";

  if (proposedUnitPriceCny && cnyAmounts.length > 0) {
    const minimum = cnyAmounts[0] ?? proposedUnitPriceCny;
    const maximum = cnyAmounts.at(-1) ?? proposedUnitPriceCny;
    positioning =
      proposedUnitPriceCny < minimum
        ? "early_access"
        : proposedUnitPriceCny > maximum
          ? "premium"
          : "market_validation";
    rationale.push(
      `保留当前 ¥${formatAmount(proposedUnitPriceCny)} 试单价；公开中文价格证据范围为 ¥${formatAmount(minimum)}–¥${formatAmount(maximum)}。`
    );
  } else if (evidenceMedian) {
    positioning = "market_validation";
    rationale.push(
      `没有现成试单价，公开中文价格证据的中位数为 ¥${formatAmount(evidenceMedian)}。`
    );
  } else {
    rationale.push("暂未获得可直接比较的人民币价格证据，不应凭空改价。")
  }

  const usdCount = signals.filter((signal) => signal.currency === "USD").length;
  if (usdCount > 0) {
    rationale.push(`另有 ${usdCount} 条美元报价信号，仅作服务形态参考，不进行未经验证的汇率换算。`);
  }
  rationale.push("研究只生成内部草稿；公开发布、联系客户和收款仍需用户明确授权。")

  return {
    ...(proposedUnitPriceCny ? { proposedUnitPriceCny } : {}),
    ...(recommendedUnitPriceCny ? { recommendedUnitPriceCny } : {}),
    positioning,
    rationale
  };
}

function collectPricingMatches(
  text: string,
  sourceUrl: string,
  pattern: RegExp,
  currency: "CNY" | "USD",
  signals: EarningPricingSignal[],
  seen: Set<string>
): void {
  for (const match of text.matchAll(pattern)) {
    const amount = Number((match[1] ?? "").replaceAll(",", ""));
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const index = match.index ?? 0;
    const context = text
      .slice(Math.max(0, index - 80), index + match[0].length + 120)
      .trim()
      .slice(0, 300);
    if (!isServicePricingContext(text, index, match[0].length)) continue;
    const key = `${currency}:${amount}:${sourceUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    signals.push({
      currency,
      amount,
      sourceUrl,
      context
    });
  }
}

function isServicePricingContext(text: string, index: number, matchLength: number): boolean {
  const prefix = text.slice(0, index);
  const sentenceStart = Math.max(
    prefix.lastIndexOf("。"),
    prefix.lastIndexOf("！"),
    prefix.lastIndexOf("？"),
    prefix.lastIndexOf(";"),
    prefix.lastIndexOf("\n")
  );
  const suffix = text.slice(index + matchLength);
  const sentenceEndOffset = suffix.search(/[。！？;\n]/);
  const sentenceEnd =
    sentenceEndOffset >= 0 ? index + matchLength + sentenceEndOffset : text.length;
  const local = text.slice(
    sentenceStart >= 0 ? sentenceStart + 1 : Math.max(0, index - 52),
    sentenceEndOffset >= 0 ? sentenceEnd : Math.min(text.length, index + matchLength + 64)
  );
  if (
    !/(?:安装|部署|上门|远程指导|调试|服务|咨询|setup|install(?:ation)?|deploy(?:ment)?|service|consult)/i.test(
      local
    )
  ) {
    return false;
  }
  if (
    /(?:每月|月费|月成本|\/月|硬件|硬體|Mac Mini|云主机|雲端主機|cloud server|monthly|per month)/i.test(
      local
    )
  ) {
    return false;
  }
  if (
    /(?:账户|帳戶|账号|account).{0,32}(?:费用|費用|成本|cost|fee)/i.test(local) ||
    /(?:费用|費用|成本|cost|fee).{0,32}(?:账户|帳戶|账号|account)/i.test(local)
  ) {
    return false;
  }
  return true;
}

function deduplicateSources(sources: InternetSource[]): InternetSource[] {
  const result = new Map<string, InternetSource>();
  for (const source of sources) {
    if (!result.has(source.url)) result.set(source.url, source);
  }
  return [...result.values()];
}

function sanitizePublicOfferTopic(topic: string): string {
  const normalized = topic.replace(/\s+/g, " ").trim().slice(0, 180);
  if (normalized.length < 2) throw new Error("A public offer topic is required");
  if (
    /\bsk-[A-Za-z0-9_-]{12,}\b/.test(normalized) ||
    /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/.test(normalized) ||
    /\b\d{11,}\b/.test(normalized) ||
    /(?:api[_ -]?key|password|secret|token|银行卡|身份证|密码|密钥)\s*[:=：]?\s*\S+/i.test(normalized)
  ) {
    throw new Error("Public offer topic contains private or credential-like material");
  }
  return normalized;
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const middle = Math.floor(values.length / 2);
  if (values.length % 2 === 1) return values[middle];
  return ((values[middle - 1] ?? 0) + (values[middle] ?? 0)) / 2;
}

function formatAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
