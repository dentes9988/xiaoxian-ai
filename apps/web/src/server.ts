import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  FileSystemMemoryStore,
  buildCurrentProjection,
  type ChatHistoryMessage,
  type MemoryItem
} from "@98agent/memory-core";
import {
  AgentReachInternetToolExecutor,
  DailyEarningResearchScheduler,
  FallbackRuntimeProvider,
  FileSystemEarningActionStore,
  FileSystemEarningExperimentStore,
  FileSystemEarningResearchStore,
  OllamaRuntimeClient,
  OpenAICompatibleRuntimeClient,
  earningActionEvidenceSchema,
  runEarningComparison,
  runEarningResearch,
  runRuntimeTurn,
  type EarningResearchRecord,
  type RuntimeFallbackReason
} from "@98agent/agent-runtime";
import {
  loadPriorSkillOutputs,
  savePriorSkillOutputs
} from "@98agent/ingestion";
import {
  buildPriorHints,
  deriveAstrologyCoordinates,
  deriveDeterministicYijingNumber,
  deriveTimeIndex,
  type PriorProfileInput,
  type PriorSkillOutput
} from "@98agent/prior-engines";
import {
  buildSelfModelDigest,
  buildSelfModelExamples,
  buildPriorSkillExamples,
  buildProfileSeedExamples,
  buildTrainingExamples
} from "@98agent/training-data";
import {
  buildDefaultTrainingControlConfig,
  getTrainingModelCandidateStatuses,
  getTrainingModelPreparationStatus,
  loadTrainingControlConfig,
  NightlyTrainingScheduler,
  planFastFineTune,
  prepareTrainingModel,
  ResidentPersonalizationWorker,
  resolveDefaultTrainingPythonBin,
  runFastFineTune,
  saveTrainingControlConfig,
  writeMlxChatDataset,
  writeTrainingDataset
} from "@98agent/local-model-finetune";
import { FileSystemModelRegistry } from "@98agent/model-registry";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const dataRoot = join(repoRoot, "data");
const dataDir = join(dataRoot, "memory");
const profilePath = join(dataRoot, "profile.json");
const runtimeConfigPath = join(dataRoot, "runtime-config.json");
const priorSkillOutputsPath = join(dataRoot, "prior-skill-outputs.json");
const trainingConfigPath = join(dataRoot, "training-config.json");
const trainingSchedulerStatePath = join(dataRoot, "training-scheduler-state.json");
const desireStatePath = join(dataRoot, "desire-state.json");
const earningActionsPath = join(dataRoot, "earning-actions.json");
const earningExperimentsPath = join(dataRoot, "earning-experiments.json");
const earningResearchPath = join(dataRoot, "earning-research.json");
const earningResearchSchedulerStatePath = join(
  dataRoot,
  "earning-research-scheduler-state.json"
);
const publicDir = fileURLToPath(new URL("../public", import.meta.url));
const mingyuRoot = join(repoRoot, ".cache", "skills", "mingyu");
const runtimeModel = process.env.OLLAMA_RUNTIME_MODEL ?? "gemma3:1b-it-qat";
const personalModelBase = process.env.PERSONAL_MODEL_BASE ?? "NitrAI/VibeThinker-3B:latest";
const trainingEnabled = process.env.PERSONAL_MODEL_TRAINING_ENABLED !== "false";
const earningResearchEnabled = process.env.EARNING_RESEARCH_ENABLED !== "false";
const trainingPythonBin = resolveDefaultTrainingPythonBin(repoRoot);
const store = new FileSystemMemoryStore(dataDir, "default-user");
const modelRegistry = new FileSystemModelRegistry(join(dataRoot, "model-registry.json"));
const earningActionStore = new FileSystemEarningActionStore(earningActionsPath);
const earningExperimentStore = new FileSystemEarningExperimentStore(earningExperimentsPath);
const earningResearchStore = new FileSystemEarningResearchStore(earningResearchPath);
const internetToolExecutor = new AgentReachInternetToolExecutor();
const personalizationWorker = new ResidentPersonalizationWorker({
  rootDir: repoRoot,
  registry: modelRegistry,
  idleTimeoutMs: 10 * 60 * 1000
});
let trainingRunPromise: Promise<TrainingExecutionResult> | null = null;
let earningResearchRunPromise: Promise<EarningResearchRecord[]> | null = null;
const nightlyTrainingScheduler = new NightlyTrainingScheduler({
  statePath: trainingSchedulerStatePath,
  loadConfig: async () => {
    const config = await loadTrainingControlConfig(trainingConfigPath);
    return { ...config, enabled: trainingEnabled && config.enabled };
  },
  run: async (now) => (await executeTraining({ respectWindow: true, now })).trainingRun
});
const earningResearchScheduler = new DailyEarningResearchScheduler({
  statePath: earningResearchSchedulerStatePath,
  enabled: earningResearchEnabled,
  run: requestEarningResearchRun
});
let mingyuInstallPromise: Promise<void> | null = null;

interface RuntimeConfig {
  provider: "ollama" | "qyuanai";
  model: string;
  baseUrl?: string;
  apiKey?: string;
}

interface RuntimeExecutionInfo {
  configuredProvider: RuntimeConfig["provider"];
  configuredModel: string;
  usedProvider: RuntimeConfig["provider"];
  usedModel: string;
  fallbackUsed: boolean;
  fallbackReason?: RuntimeFallbackReason | "cloud_not_configured";
}

interface RuntimeProviderSelection {
  provider: FallbackRuntimeProvider | OpenAICompatibleRuntimeClient | OllamaRuntimeClient;
  execution: RuntimeExecutionInfo;
}

interface CloudModelConfig {
  model: string;
  baseUrl: string;
  apiKey: string;
}

interface PriorGeneratorContext {
  profile: PriorProfileInput;
  generatedAt: string;
  modelConfig?: CloudModelConfig;
}

interface TrainingExecutionResult {
  examples: number;
  priorSkillOutputs: number;
  mlxDataset: Awaited<ReturnType<typeof writeMlxChatDataset>>;
  plan: ReturnType<typeof planFastFineTune>;
  trainingRun: Awaited<ReturnType<typeof runFastFineTune>>;
  modelRegistry: Awaited<ReturnType<FileSystemModelRegistry["load"]>>;
}

function requestEarningResearchRun(now: Date): Promise<EarningResearchRecord[]> {
  if (earningResearchRunPromise) return earningResearchRunPromise;
  earningResearchRunPromise = executeEarningResearch(now).finally(() => {
    earningResearchRunPromise = null;
  });
  return earningResearchRunPromise;
}

async function executeEarningResearch(now: Date): Promise<EarningResearchRecord[]> {
  const [experiments, actions] = await Promise.all([
    earningExperimentStore.list(),
    earningActionStore.list()
  ]);
  const candidates = experiments.filter(
    (experiment) => experiment.status === "draft" || experiment.status === "running"
  );
  const records: EarningResearchRecord[] = [];

  for (const experiment of candidates) {
    const attachedPublishAction = actions.find(
      (action) =>
        experiment.actionIds.includes(action.id) &&
        action.kind === "publish_offer" &&
        action.status !== "rejected" &&
        action.status !== "failed"
    );
    if (!attachedPublishAction) continue;
    const proposedUnitPriceCny = extractProposedUnitPriceCny(
      attachedPublishAction.description
    );
    const capacity = proposedUnitPriceCny
      ? Math.max(1, Math.round(experiment.projectedRevenueCny / proposedUnitPriceCny))
      : 5;
    const record = await runEarningResearch({
      experimentId: experiment.id,
      offerName: "xiaoxian AI 本地安装",
      publicOfferTopic:
        "xiaoxian AI local-first personal assistant installation service macOS Windows",
      executor: internetToolExecutor,
      proposedUnitPriceCny,
      capacity,
      supportDays: 7,
      windowDays: experiment.windowDays,
      targetQualifiedInquiries: experiment.targetQualifiedInquiries,
      targetPaidCustomers: experiment.targetPaidCustomers,
      now
    });
    records.push(await earningResearchStore.append(record));
  }

  return records;
}

function extractProposedUnitPriceCny(text: string): number | undefined {
  const match = text.match(/(?:¥|￥|人民币\s*)?(\d[\d,]*(?:\.\d+)?)\s*(?:元|CNY|RMB)/i);
  if (!match?.[1]) return undefined;
  const amount = Number(match[1].replaceAll(",", ""));
  return Number.isFinite(amount) && amount > 0 ? amount : undefined;
}

function buildRuntimeUnavailableMessage(config: RuntimeConfig): string {
  if (config.provider === "qyuanai") {
    return "The configured cloud model and local Ollama fallback are unavailable. Check the cloud credentials, Ollama access, and local fallback model.";
  }

  return "The local runtime could not reach the configured model. Check Ollama access and runtime permissions.";
}

const DESIRE_BASELINE_UPDATE_INTERVAL = 10;

const DESIRE_AXES = [
  {
    key: "dignity",
    desireType: "自我价值欲",
    positiveName: "尊严",
    positiveLabels: "尊严、自信、担当",
    balance: "知道自己有价值，也承认别人有价值",
    shadow: "傲慢",
    positiveTokens: ["尊严", "自信", "担当", "价值", "尊重", "边界", "confidence", "worth", "respect", "responsibility"],
    shadowTokens: ["傲慢", "面子", "证明自己", "ego", "arrogance", "superior"]
  },
  {
    key: "security",
    desireType: "占有安全欲",
    positiveName: "保障",
    positiveLabels: "积累、保障、经营",
    balance: "合理拥有资源，不被资源奴役",
    shadow: "贪婪",
    positiveTokens: ["积累", "保障", "经营", "稳定", "安全", "资源", "stability", "security", "reserve", "steady"],
    shadowTokens: ["贪婪", "囤积", "匮乏", "greed", "hoard", "scarcity"]
  },
  {
    key: "intimacy",
    desireType: "亲密快感欲",
    positiveName: "爱欲",
    positiveLabels: "爱欲、亲密、生命力",
    balance: "欲望服务于关系，而不是吞噬关系",
    shadow: "色欲",
    positiveTokens: ["爱欲", "爱", "亲密", "生命力", "关系", "connection", "care", "closeness", "affection"],
    shadowTokens: ["色欲", "占有", "吞噬", "lust", "possessive", "consume relationship"]
  },
  {
    key: "ambition",
    desireType: "比较认可欲",
    positiveName: "进取",
    positiveLabels: "进取、欣赏、学习",
    balance: "看见差距，但不否定自己和他人",
    shadow: "嫉妒",
    positiveTokens: ["进取", "欣赏", "学习", "成长", "向上", "ambition", "admire", "learn", "improve"],
    shadowTokens: ["嫉妒", "攀比", "envy", "jealous", "comparison trap"]
  },
  {
    key: "enjoyment",
    desireType: "满足享受欲",
    positiveName: "享受",
    positiveLabels: "滋养、享受、丰盛",
    balance: "能享受，也能停止",
    shadow: "暴食",
    positiveTokens: ["滋养", "享受", "丰盛", "快乐", "美感", "pleasure", "joy", "abundance", "nourish"],
    shadowTokens: ["暴食", "沉迷", "过度", "binge", "excess", "overconsume"]
  },
  {
    key: "justice",
    desireType: "边界公平欲",
    positiveName: "正义",
    positiveLabels: "正义、勇气、守护",
    balance: "能表达愤怒，但不被愤怒控制",
    shadow: "暴怒",
    positiveTokens: ["正义", "勇气", "守护", "公平", "保护", "justice", "courage", "protect", "fairness"],
    shadowTokens: ["暴怒", "愤怒", "攻击", "rage", "resentment", "revenge"]
  },
  {
    key: "rest",
    desireType: "休息安逸欲",
    positiveName: "安息",
    positiveLabels: "安息、恢复、沉潜",
    balance: "会休息，也愿意承担责任",
    shadow: "懒惰",
    positiveTokens: ["安息", "恢复", "沉潜", "平静", "休息", "calm", "recover", "stillness", "depth"],
    shadowTokens: ["懒惰", "拖延", "回避", "lazy", "procrastinate", "avoidance", "freeze"]
  }
] as const;

type DesireAxisDefinition = (typeof DESIRE_AXES)[number];

interface DesireAxisState {
  key: DesireAxisDefinition["key"];
  desireType: string;
  positiveName: string;
  positiveLabels: string;
  balance: string;
  shadow: string;
  baselineScore: number;
  displayScore: number;
}

interface DesireState {
  axes: DesireAxisState[];
  totalEffectiveTurns: number;
  turnsSinceBaseline: number;
  effectiveTurnTexts: string[];
  initializedAt?: string;
  baselineUpdatedAt?: string;
}

async function loadProfile(): Promise<PriorProfileInput> {
  try {
    return JSON.parse(await readFile(profilePath, "utf8")) as PriorProfileInput;
  } catch {
    return {};
  }
}

async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  try {
    return JSON.parse(await readFile(runtimeConfigPath, "utf8")) as RuntimeConfig;
  } catch {
    return {
      provider: "ollama",
      model: runtimeModel
    };
  }
}

async function saveRuntimeConfig(config: RuntimeConfig): Promise<void> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(dataRoot, { recursive: true });
  await writeFile(runtimeConfigPath, JSON.stringify(config, null, 2), "utf8");
}

async function saveProfile(profile: PriorProfileInput): Promise<void> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(dataRoot, { recursive: true });
  await writeFile(profilePath, JSON.stringify(profile, null, 2), "utf8");
}

async function loadDesireState(): Promise<DesireState> {
  try {
    return JSON.parse(await readFile(desireStatePath, "utf8")) as DesireState;
  } catch {
    return buildDefaultDesireState();
  }
}

async function saveDesireState(state: DesireState): Promise<void> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(dataRoot, { recursive: true });
  await writeFile(desireStatePath, JSON.stringify(state, null, 2), "utf8");
}

function sendJson(res: import("node:http").ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
}

async function serveStatic(pathname: string, res: import("node:http").ServerResponse): Promise<void> {
  const filePath = pathname === "/" ? join(publicDir, "index.html") : join(publicDir, pathname);
  try {
    const body = await readFile(filePath);
    const type =
      extname(filePath) === ".js"
        ? "text/javascript; charset=utf-8"
        : "text/html; charset=utf-8";
    res.writeHead(200, { "Content-Type": type });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");

  if (req.method === "GET" && url.pathname === "/api/health") {
    const runtimeConfig = await loadRuntimeConfig();
    sendJson(res, 200, {
      ok: true,
      runtimeProvider: runtimeConfig.provider,
      runtimeModel: runtimeConfig.model,
      localRuntimeFallback: {
        enabled: true,
        provider: "ollama",
        model: runtimeModel
      },
      personalModelBase,
      trainingConfig: await loadTrainingControlConfig(trainingConfigPath),
      personalizationWorker: personalizationWorker.getStatus(),
      internetTools: await internetToolExecutor.healthCheck(),
      nightlyTraining: await nightlyTrainingScheduler.getStatus(),
      earningResearch: await earningResearchScheduler.getStatus()
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/local-personalization/health") {
    sendJson(res, 200, await personalizationWorker.healthCheck());
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/internet-tools/health") {
    sendJson(res, 200, await internetToolExecutor.healthCheck());
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/local-personalization/restart") {
    await personalizationWorker.sleep("manual_restart");
    sendJson(res, 200, { ok: true, personalizationWorker: personalizationWorker.getStatus() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/runtime/config") {
    const runtimeConfig = await loadRuntimeConfig();
    sendJson(res, 200, {
      provider: runtimeConfig.provider,
      model: runtimeConfig.model,
      baseUrl: runtimeConfig.baseUrl,
      apiKeyConfigured: Boolean(runtimeConfig.apiKey),
      localRuntimeFallback: {
        enabled: true,
        provider: "ollama",
        model: runtimeModel
      }
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/chat/history") {
    const limit = Number(url.searchParams.get("limit") ?? "100");
    const beforeId = url.searchParams.get("beforeId") ?? undefined;
    const history = await store.listChatHistory({ limit, beforeId });
    sendJson(res, 200, history);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/earning/actions") {
    sendJson(res, 200, { actions: await earningActionStore.list() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/earning/experiments") {
    sendJson(res, 200, { experiments: await earningExperimentStore.list() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/earning/research") {
    sendJson(res, 200, {
      records: await earningResearchStore.list(),
      scheduler: await earningResearchScheduler.getStatus()
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/earning/research/run") {
    if (!earningResearchEnabled) {
      sendJson(res, 409, { error: "earning_research_disabled" });
      return;
    }
    try {
      const records = await requestEarningResearchRun(new Date());
      sendJson(res, 200, {
        ok: true,
        records,
        scheduler: await earningResearchScheduler.getStatus()
      });
    } catch (error) {
      sendJson(res, 502, {
        error: "earning_research_failed",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
    return;
  }

  const earningDecisionMatch = url.pathname.match(
    /^\/api\/earning\/actions\/([^/]+)\/decision$/
  );
  if (req.method === "POST" && earningDecisionMatch) {
    try {
      const body = (await readJson(req)) as { decision?: unknown };
      if (body.decision !== "approved" && body.decision !== "rejected") {
        sendJson(res, 400, { error: "invalid_earning_action_decision" });
        return;
      }
      const action = await earningActionStore.decide(
        decodeURIComponent(earningDecisionMatch[1] ?? ""),
        body.decision
      );
      sendJson(res, 200, { ok: true, action });
    } catch (error) {
      sendJson(res, 409, {
        error: "earning_action_decision_failed",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
    return;
  }

  const earningEvidenceMatch = url.pathname.match(
    /^\/api\/earning\/actions\/([^/]+)\/evidence$/
  );
  if (req.method === "POST" && earningEvidenceMatch) {
    try {
      const body = (await readJson(req)) as Record<string, unknown>;
      const evidence = earningActionEvidenceSchema.parse({
        ...body,
        recordedAt:
          typeof body.recordedAt === "string" ? body.recordedAt : new Date().toISOString()
      });
      const action = await earningActionStore.complete(
        decodeURIComponent(earningEvidenceMatch[1] ?? ""),
        evidence
      );
      const startedExperiments =
        action.kind === "publish_offer"
          ? await earningExperimentStore.startForAction(action.id)
          : [];
      sendJson(res, 200, { ok: true, action, startedExperiments });
    } catch (error) {
      sendJson(res, 409, {
        error: "earning_action_evidence_failed",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
    return;
  }

  const earningMetricsMatch = url.pathname.match(
    /^\/api\/earning\/experiments\/([^/]+)\/metrics$/
  );
  if (req.method === "POST" && earningMetricsMatch) {
    try {
      const body = (await readJson(req)) as Record<string, unknown>;
      const experiment = await earningExperimentStore.recordMetrics(
        decodeURIComponent(earningMetricsMatch[1] ?? ""),
        body
      );
      sendJson(res, 200, { ok: true, experiment });
    } catch (error) {
      sendJson(res, 409, {
        error: "earning_experiment_metrics_failed",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
    return;
  }

  const earningRevenueMatch = url.pathname.match(
    /^\/api\/earning\/experiments\/([^/]+)\/revenue$/
  );
  if (req.method === "POST" && earningRevenueMatch) {
    try {
      const body = (await readJson(req)) as Record<string, unknown>;
      const experiment = await earningExperimentStore.recordRevenue(
        decodeURIComponent(earningRevenueMatch[1] ?? ""),
        {
          kind: "payment_record",
          amountCny: body.amountCny as number,
          reference: body.reference as string,
          recordedAt:
            typeof body.recordedAt === "string" ? body.recordedAt : new Date().toISOString(),
          actionId: typeof body.actionId === "string" ? body.actionId : undefined
        }
      );
      sendJson(res, 200, { ok: true, experiment });
    } catch (error) {
      sendJson(res, 409, {
        error: "earning_experiment_revenue_failed",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/runtime/config") {
    const body = (await readJson(req)) as Partial<RuntimeConfig> & { clearApiKey?: boolean };
    const current = await loadRuntimeConfig();
    const submittedApiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    const next: RuntimeConfig = {
      provider: body.provider ?? current.provider,
      model: body.model ?? current.model,
      baseUrl: body.baseUrl ?? current.baseUrl,
      apiKey: body.clearApiKey ? "" : submittedApiKey || current.apiKey
    };
    await saveRuntimeConfig(next);
    sendJson(res, 200, {
      ok: true,
      runtimeConfig: {
        provider: next.provider,
        model: next.model,
        baseUrl: next.baseUrl,
        apiKeyConfigured: Boolean(next.apiKey),
        localRuntimeFallback: {
          enabled: true,
          provider: "ollama",
          model: runtimeModel
        }
      }
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/self-model") {
    const snapshot = await store.getSnapshot();
    const profile = await loadProfile();
    const priorSkillOutputs = await loadPriorSkillOutputs(priorSkillOutputsPath);
    const priors = buildPriorHints(profile, priorSkillOutputs);
    const trainingConfig = await loadTrainingControlConfig(trainingConfigPath);
    const desireState = await refreshDesireState({
      snapshot,
      priorSkillOutputs
    });
    const selfModelDigest = buildSelfModelDigest({
      profile,
      priors,
      memories: snapshot.memories,
      currentProjection: snapshot.currentProjection,
      cognitionLogs: snapshot.cognitionLogs
    });
    sendJson(res, 200, {
      profile,
      priors,
      priorSkillOutputs,
      trainingConfig,
      desireState,
      selfModelDigest,
      currentProjection: snapshot.currentProjection,
      lifeTrajectory: snapshot.lifeTrajectory,
      pendingConfirmations: snapshot.memories.filter((item) => item.status === "pending_confirmation"),
      modelRegistry: await modelRegistry.load()
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/intake/profile") {
    const body = await readJson(req);
    const profile = body as PriorProfileInput;
    await saveProfile(profile);

    const hints = buildPriorHints(profile);
    const timestamp = new Date().toISOString();
    for (const hint of hints) {
      const memory: MemoryItem = {
        id: crypto.randomUUID(),
        type: "observation",
        subject: "user",
        statement: hint.summary,
        evidence: [
          {
            id: crypto.randomUUID(),
            kind: "prior_system",
            sourceId: "profile-intake",
            recordedAt: timestamp,
            confidence: hint.confidence
          }
        ],
        sourceIds: ["profile-intake"],
        timeWindow: { start: timestamp },
        confidence: hint.confidence,
        weight: hint.confidence,
        status: "candidate",
        impactScope: ["identity_model"],
        confirmationRequired: false,
        conflictsWith: [],
        supersedes: [],
        createdAt: timestamp,
        updatedAt: timestamp
      };
      await store.upsertMemory(memory);
    }

    sendJson(res, 200, { ok: true, hints });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/train/config") {
    sendJson(res, 200, await loadTrainingControlConfig(trainingConfigPath));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/train/config") {
    const body = (await readJson(req)) as Partial<ReturnType<typeof buildDefaultTrainingControlConfig>>;
    const current = await loadTrainingControlConfig(trainingConfigPath);
    const next = {
      ...current,
      ...body,
      window: {
        ...current.window,
        ...body.window
      }
    };
    await saveTrainingControlConfig(trainingConfigPath, next);
    sendJson(res, 200, { ok: true, trainingConfig: next });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/train/model-status") {
    const trainingConfig = await loadTrainingControlConfig(trainingConfigPath);
    const plan = planFastFineTune({
      rootDir: repoRoot,
      config: {
        ...trainingConfig,
        enabled: trainingEnabled && trainingConfig.enabled
      }
    });
    const modelStatus = await getTrainingModelPreparationStatus({
      scriptPath: join(repoRoot, "packages", "local-model-finetune", "scripts", "run_mlx_lora.py"),
      baseModel: plan.baseModel,
      dataDir: plan.datasetDir,
      runDir: plan.runDir,
      maxDurationSeconds: plan.maxDurationSeconds,
      pythonBin: trainingPythonBin
    });
    const candidateStatuses = await getTrainingModelCandidateStatuses({
      scriptPath: join(repoRoot, "packages", "local-model-finetune", "scripts", "run_mlx_lora.py"),
      baseModel: plan.baseModel,
      dataDir: plan.datasetDir,
      runDir: plan.runDir,
      maxDurationSeconds: plan.maxDurationSeconds,
      pythonBin: trainingPythonBin
    });
    sendJson(res, 200, {
      ok: true,
      model: plan.baseModel,
      modelStatus,
      candidateStatuses
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/train/prepare-model") {
    try {
      const body = ((await readJson(req).catch(() => ({}))) ?? {}) as {
        maxDurationSeconds?: number;
      };
      const trainingConfig = await loadTrainingControlConfig(trainingConfigPath);
      const plan = planFastFineTune({
        rootDir: repoRoot,
        config: {
          ...trainingConfig,
          maxDurationSeconds: body.maxDurationSeconds ?? trainingConfig.maxDurationSeconds,
          enabled: trainingEnabled && trainingConfig.enabled
        }
      });
      const preparation = await prepareTrainingModel({
        scriptPath: join(repoRoot, "packages", "local-model-finetune", "scripts", "run_mlx_lora.py"),
        baseModel: plan.baseModel,
        dataDir: plan.datasetDir,
        runDir: plan.runDir,
        maxDurationSeconds: plan.maxDurationSeconds,
        pythonBin: trainingPythonBin
      });
      sendJson(res, 200, {
        ok: true,
        model: plan.baseModel,
        preparation
      });
    } catch (error) {
      sendJson(res, 500, {
        error: "prepare_model_failed",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/priors/generate") {
    try {
      const profile = await loadProfile();
      const runtimeConfig = await loadRuntimeConfig();
      const priorSkillOutputs = await generatePriorSkillOutputs({
        profile,
        generatedAt: new Date().toISOString(),
        modelConfig: toCloudModelConfig(runtimeConfig)
      });
      await savePriorSkillOutputs(priorSkillOutputsPath, priorSkillOutputs);
      sendJson(res, 200, {
        ok: true,
        outputs: priorSkillOutputs
      });
    } catch (error) {
      sendJson(res, 500, {
        error: "prior_generation_failed",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/chat") {
    let runtimeConfig: RuntimeConfig | null = null;
    try {
      const body = (await readJson(req)) as { message: string };
      const snapshot = await store.getSnapshot();
      runtimeConfig = await loadRuntimeConfig();
      const profile = await loadProfile();
      const priorSkillOutputs = await loadPriorSkillOutputs(priorSkillOutputsPath);
      const priors = buildPriorHints(profile, priorSkillOutputs);
      const selfModelDigest = buildSelfModelDigest({
        profile,
        priors,
        memories: snapshot.memories,
        currentProjection: snapshot.currentProjection,
        cognitionLogs: snapshot.cognitionLogs
      });
      const localTurnPersonalization = trainingRunPromise
        ? {
            status: "skipped" as const,
            turnContextHints: [],
            reason: "Local personalization is paused while local training is running."
          }
        : await personalizationWorker.personalize({
            userMessage: body.message,
            projectionText: renderProjectionForPrompt(
              snapshot.currentProjection ?? buildCurrentProjection("default-user", [])
            ),
            selfModelDigestText: renderSelfModelDigestForPrompt(selfModelDigest)
          });
      const runtime = createRuntimeProvider(runtimeConfig);
      const runtimeTurn = await runRuntimeTurn({
        provider: runtime.provider,
        messages: [{ role: "user", content: body.message }],
        projection: snapshot.currentProjection ?? buildCurrentProjection("default-user", []),
        selfModelDigest: renderSelfModelDigestForPrompt(selfModelDigest),
        existingMemories: snapshot.memories,
        turnContextHints: localTurnPersonalization.turnContextHints,
        internetToolExecutor
      });
      runtimeTurn.logEntry.runtime = { ...runtime.execution };

      await store.appendLog(runtimeTurn.logEntry);
      for (const memory of runtimeTurn.memories) {
        await store.upsertMemory(memory);
      }
      const historyMessages: ChatHistoryMessage[] = [
        {
          id: `${runtimeTurn.logEntry.id}:user`,
          role: "user",
          content: body.message,
          timestamp: runtimeTurn.logEntry.occurredAt
        },
        {
          id: `${runtimeTurn.logEntry.id}:assistant`,
          role: "assistant",
          content: runtimeTurn.result.reply,
          timestamp: new Date(new Date(runtimeTurn.logEntry.occurredAt).getTime() + 1).toISOString(),
          sources: runtimeTurn.sources
        }
      ];
      await store.appendChatHistory(historyMessages);
      const earningActions = await earningActionStore.addProposals(
        runtimeTurn.result.proposedActions ?? [],
        runtimeTurn.logEntry.id
      );
      const updatedSnapshot = await store.getSnapshot();
      const refreshedPriorSkillOutputs = await loadPriorSkillOutputs(priorSkillOutputsPath);
      const desireState = await refreshDesireState({
        snapshot: updatedSnapshot,
        priorSkillOutputs: refreshedPriorSkillOutputs,
        latestUserMessage: body.message,
        latestMemoryCount: runtimeTurn.memories.length
      });

      sendJson(res, 200, {
        ...runtimeTurn.result,
        logEntryId: runtimeTurn.logEntry.id,
        earningActions,
        desireState,
        localTurnPersonalization,
        runtimeExecution: runtime.execution,
        sources: runtimeTurn.sources,
        internetToolsUsed: runtimeTurn.toolResults.length > 0
      });
    } catch (error) {
      sendJson(res, 502, {
        error: "runtime_unavailable",
        message: buildRuntimeUnavailableMessage(runtimeConfig ?? (await loadRuntimeConfig())),
        detail: error instanceof Error ? error.message : String(error)
      });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/evaluate/earning") {
    let runtimeConfig: RuntimeConfig | null = null;
    try {
      const body = (await readJson(req)) as {
        message?: string;
        personalSignals?: unknown[];
      };
      const message = body.message?.trim() ?? "";
      if (!message) {
        sendJson(res, 400, { error: "message_required" });
        return;
      }

      const personalSignals = (body.personalSignals ?? [])
        .filter((signal): signal is string => typeof signal === "string")
        .map((signal) => signal.trim())
        .filter(Boolean)
        .slice(0, 12);
      const snapshot = await store.getSnapshot();
      runtimeConfig = await loadRuntimeConfig();
      const profile = await loadProfile();
      const priorSkillOutputs = await loadPriorSkillOutputs(priorSkillOutputsPath);
      const priors = buildPriorHints(profile, priorSkillOutputs);
      const selfModelDigest = buildSelfModelDigest({
        profile,
        priors,
        memories: snapshot.memories,
        currentProjection: snapshot.currentProjection,
        cognitionLogs: snapshot.cognitionLogs
      });
      const localTurnPersonalization = trainingRunPromise
        ? {
            status: "skipped" as const,
            turnContextHints: [],
            reason: "Local personalization is paused while local training is running."
          }
        : await personalizationWorker.personalize({
            userMessage: message,
            projectionText: renderProjectionForPrompt(
              snapshot.currentProjection ?? buildCurrentProjection("default-user", [])
            ),
            selfModelDigestText: renderSelfModelDigestForPrompt(selfModelDigest)
          });
      const runtime = createRuntimeProvider(runtimeConfig);
      const comparison = await runEarningComparison({
        provider: runtime.provider,
        scenario: {
          id: crypto.randomUUID(),
          userMessage: message,
          projection: snapshot.currentProjection ?? buildCurrentProjection("default-user", []),
          selfModelDigest: renderSelfModelDigestForPrompt(selfModelDigest),
          turnContextHints: localTurnPersonalization.turnContextHints,
          personalSignals
        }
      });

      sendJson(res, 200, {
        ok: true,
        localTurnPersonalization,
        runtimeExecution: runtime.execution,
        comparison
      });
    } catch (error) {
      sendJson(res, 502, {
        error: "earning_evaluation_failed",
        message: buildRuntimeUnavailableMessage(runtimeConfig ?? (await loadRuntimeConfig())),
        detail: error instanceof Error ? error.message : String(error)
      });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/train/nightly") {
    try {
      const body = ((await readJson(req).catch(() => ({}))) ?? {}) as {
        respectWindow?: boolean;
      };
      const execution = await executeTraining({ respectWindow: body.respectWindow ?? false });
      sendJson(res, 200, {
        ok: true,
        ...execution
      });
    } catch (error) {
      sendJson(res, 500, {
        error: "training_failed",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
    return;
  }

  await serveStatic(url.pathname, res);
});

async function executeTraining(args: {
  respectWindow: boolean;
  now?: Date;
}): Promise<TrainingExecutionResult> {
  if (trainingRunPromise) return trainingRunPromise;

  const run = (async (): Promise<TrainingExecutionResult> => {
    await personalizationWorker.sleep("training_started");
    const snapshot = await store.getSnapshot();
    const profile = await loadProfile();
    const trainingConfig = await loadTrainingControlConfig(trainingConfigPath);
    const priorSkillOutputs = await loadPriorSkillOutputs(priorSkillOutputsPath);
    const priors = buildPriorHints(profile, priorSkillOutputs);
    const selfModelDigest = buildSelfModelDigest({
      profile,
      priors,
      memories: snapshot.memories,
      currentProjection: snapshot.currentProjection,
      cognitionLogs: snapshot.cognitionLogs
    });
    const examples = [
      ...buildProfileSeedExamples(profile, priors),
      ...buildPriorSkillExamples(priorSkillOutputs),
      ...buildSelfModelExamples(selfModelDigest),
      ...buildTrainingExamples(snapshot.cognitionLogs)
    ];
    const plan = planFastFineTune({
      rootDir: repoRoot,
      config: {
        ...trainingConfig,
        enabled: trainingEnabled && trainingConfig.enabled
      }
    });
    await writeTrainingDataset(plan.datasetPath, examples);
    const mlxDataset = await writeMlxChatDataset(plan.datasetDir, examples);
    const trainingRun = await runFastFineTune({
      rootDir: repoRoot,
      plan,
      registry: modelRegistry,
      exampleCount: mlxDataset.trainCount,
      respectWindow: args.respectWindow,
      now: args.now,
      pythonBin: trainingPythonBin
    });

    return {
      examples: examples.length,
      priorSkillOutputs: priorSkillOutputs.length,
      mlxDataset,
      plan,
      trainingRun,
      modelRegistry: await modelRegistry.load()
    };
  })();

  trainingRunPromise = run;
  try {
    return await run;
  } finally {
    if (trainingRunPromise === run) trainingRunPromise = null;
  }
}

async function ensurePriorSkillOutputs(
  profile: PriorProfileInput,
  runtimeConfig: RuntimeConfig
): Promise<PriorSkillOutput[]> {
  const existing = await loadPriorSkillOutputs(priorSkillOutputsPath);
  if (existing.length > 0) {
    return existing;
  }

  const outputs = await generatePriorSkillOutputs({
    profile,
    generatedAt: new Date().toISOString(),
    modelConfig: toCloudModelConfig(runtimeConfig)
  });
  await savePriorSkillOutputs(priorSkillOutputsPath, outputs);
  return outputs;
}

function toCloudModelConfig(runtimeConfig: RuntimeConfig): CloudModelConfig | undefined {
  if (runtimeConfig.provider !== "qyuanai" || !runtimeConfig.apiKey || !runtimeConfig.baseUrl) {
    return undefined;
  }

  return {
    apiKey: runtimeConfig.apiKey,
    baseUrl: runtimeConfig.baseUrl,
    model: runtimeConfig.model
  };
}

function createRuntimeProvider(
  runtimeConfig: RuntimeConfig
): RuntimeProviderSelection {
  if (runtimeConfig.provider === "ollama") {
    return {
      provider: createLocalRuntimeProvider(runtimeConfig.model),
      execution: {
        configuredProvider: "ollama",
        configuredModel: runtimeConfig.model,
        usedProvider: "ollama",
        usedModel: runtimeConfig.model,
        fallbackUsed: false
      }
    };
  }

  const execution: RuntimeExecutionInfo = {
    configuredProvider: "qyuanai",
    configuredModel: runtimeConfig.model,
    usedProvider: "qyuanai",
    usedModel: runtimeConfig.model,
    fallbackUsed: false
  };
  const fallback = createLocalRuntimeProvider(runtimeModel);
  if (!runtimeConfig.apiKey || !runtimeConfig.baseUrl) {
    execution.usedProvider = "ollama";
    execution.usedModel = runtimeModel;
    execution.fallbackUsed = true;
    execution.fallbackReason = "cloud_not_configured";
    return { provider: fallback, execution };
  }

  const primary = new OpenAICompatibleRuntimeClient({
    apiKey: runtimeConfig.apiKey,
    baseUrl: runtimeConfig.baseUrl,
    model: runtimeConfig.model,
    timeoutMs: 20_000
  });
  return {
    provider: new FallbackRuntimeProvider(primary, fallback, (reason) => {
      execution.usedProvider = "ollama";
      execution.usedModel = runtimeModel;
      execution.fallbackUsed = true;
      execution.fallbackReason = reason;
    }),
    execution
  };
}

function createLocalRuntimeProvider(model: string): OllamaRuntimeClient {
  return new OllamaRuntimeClient({
    model,
    timeoutMs: 120_000,
    maxOutputTokens: 768,
    keepAlive: "10m"
  });
}

function renderSelfModelDigestForPrompt(digest: {
  summary: string;
  stableFacts: string[];
  activeGoals: string[];
  workPreferences: string[];
  relationshipSignals: string[];
  valueSignals: string[];
  traitSignals: string[];
  currentThemes: string[];
  pendingConfirmations: string[];
  openQuestions: string[];
}): string {
  return [
    `Summary: ${digest.summary}`,
    digest.stableFacts.length > 0 ? `Stable facts: ${digest.stableFacts.join(" | ")}` : "",
    digest.activeGoals.length > 0 ? `Active goals: ${digest.activeGoals.join(" | ")}` : "",
    digest.workPreferences.length > 0
      ? `Work fit signals: ${digest.workPreferences.join(" | ")}`
      : "",
    digest.relationshipSignals.length > 0
      ? `Relationship signals: ${digest.relationshipSignals.join(" | ")}`
      : "",
    digest.valueSignals.length > 0 ? `Value signals: ${digest.valueSignals.join(" | ")}` : "",
    digest.traitSignals.length > 0 ? `Trait signals: ${digest.traitSignals.join(" | ")}` : "",
    digest.currentThemes.length > 0 ? `Current themes: ${digest.currentThemes.join(" | ")}` : "",
    digest.pendingConfirmations.length > 0
      ? `Pending confirmations: ${digest.pendingConfirmations.join(" | ")}`
      : "",
    digest.openQuestions.length > 0 ? `Useful next questions: ${digest.openQuestions.join(" | ")}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function renderProjectionForPrompt(
  projection: ReturnType<typeof buildCurrentProjection> | undefined
): string {
  if (!projection || projection.facets.length === 0) {
    return "- No current projection yet.";
  }

  return projection.facets.map((facet) => `- ${facet.label}: ${facet.summary}`).join("\n");
}

async function generatePriorSkillOutputs(
  context: PriorGeneratorContext
): Promise<PriorSkillOutput[]> {
  const outputs = await Promise.all([
    generateBaziZiweiPrior(context),
    generateBaziPrior(context),
    generateAstrologyPrior(context),
    generateYijingPrior(context)
  ]);

  return outputs;
}

async function generateBaziZiweiPrior(
  context: PriorGeneratorContext
): Promise<PriorSkillOutput> {
  const baseInput = buildFortuneBaseInput(context.profile);
  if (!baseInput) {
    return buildErrorOutput(context.generatedAt, "dzcmemory_bazi_ziwei", "bazi_ziwei", {
      requestedSourceUrl: "https://github.com/dzcmemory-web/bazi-ziwei-skill",
      resolvedSourceUrl: "https://github.com/dzcmemory-web/bazi-ziwei-skill",
      availability: "direct",
      rawInput: {}
    }, "Birth date, birth time, and gender are required to generate this prior.");
  }

  const baziResult = await runLocalMingyuBazi({
    gender: baseInput.gender,
    year: String(baseInput.year),
    month: String(baseInput.month),
    day: String(baseInput.day),
    timeIndex: baseInput.timeIndex,
    dateType: "solar",
    isLeapMonth: false,
    useTrueSolarTime: false,
    birthHour: "",
    birthMinute: "",
    birthPlace: context.profile.birthLocation ?? "",
    birthLongitude: ""
  });
  const ziweiResult = await runLocalMingyuZiwei({
    name: context.profile.fullName ?? "用户",
    gender: baseInput.gender,
    dateType: "solar",
    year: String(baseInput.year),
    month: String(baseInput.month),
    day: String(baseInput.day),
    timeIndex: baseInput.timeIndex,
    isLeapMonth: false
  });
  const skillExcerpt = await readRepoExcerpt(
    join(repoRoot, ".cache", "skills", "bazi-ziwei-skill", "SKILL.md")
  );
  const summary = await summarizePriorWithModel(context.modelConfig, {
    skillLabel: "dzcmemory-web/bazi-ziwei-skill",
    system: "bazi+ziwei",
    skillExcerpt,
    promptText:
      "Use the direct bazi+ziwei skill framing to generate low-authority personality hypotheses only. Focus on decision style, motivation tensions, pressure response, relationship style, recovery style, and realistic follow-up questions. Do not use prediction, fate, fortune, or period-luck language.",
    rawResult: {
      bazi: baziResult,
      ziwei: ziweiResult
    }
  });

  return {
    id: crypto.randomUUID(),
    skillId: "dzcmemory_bazi_ziwei",
    system: "bazi_ziwei",
    requestedSourceUrl: "https://github.com/dzcmemory-web/bazi-ziwei-skill",
    resolvedSourceUrl: "https://github.com/dzcmemory-web/bazi-ziwei-skill",
    engineSourceUrl: "https://github.com/Brhiza/mingyu",
    availability: "direct",
    status: "ready",
    generatedAt: context.generatedAt,
    confidence: 0.3,
    authority: "low",
    summary: summary.summary,
    structuredSignals: summary.structuredSignals,
    suggestedQuestions: summary.suggestedQuestions,
    disclaimers: [
      "Low-authority personality hypothesis derived from a traditional prior system.",
      "This output should never override confirmed user behavior."
    ],
    notes: [
      "The requested skill repo was available.",
      "The raw charting payload came from the local mingyu engine for privacy-preserving structured data."
    ],
    rawInput: baseInput,
    rawResult: {
      bazi: baziResult,
      ziwei: ziweiResult
    },
    rawPrompt: summary.rawPrompt
  };
}

async function generateBaziPrior(context: PriorGeneratorContext): Promise<PriorSkillOutput> {
  const baseInput = buildFortuneBaseInput(context.profile);
  if (!baseInput) {
    return buildErrorOutput(context.generatedAt, "jinchenma_bazi", "bazi", {
      requestedSourceUrl: "https://github.com/jinchenma94/bazi-skill",
      resolvedSourceUrl: "https://github.com/jinchenma94/bazi-skill",
      availability: "direct",
      rawInput: {}
    }, "Birth date, birth time, and gender are required to generate this prior.");
  }

  const baziResult = await runLocalMingyuBazi({
    gender: baseInput.gender,
    year: String(baseInput.year),
    month: String(baseInput.month),
    day: String(baseInput.day),
    timeIndex: baseInput.timeIndex,
    dateType: "solar",
    isLeapMonth: false,
    useTrueSolarTime: false,
    birthHour: "",
    birthMinute: "",
    birthPlace: context.profile.birthLocation ?? "",
    birthLongitude: ""
  });
  const skillExcerpt = await readRepoExcerpt(
    join(repoRoot, ".cache", "skills", "bazi-skill", "SKILL.md")
  );
  const summary = await summarizePriorWithModel(context.modelConfig, {
    skillLabel: "jinchenma94/bazi-skill",
    system: "bazi",
    skillExcerpt,
    promptText:
      "Use the direct bazi skill framing to generate low-authority personality hypotheses only. Focus on decision style, motivation tensions, pressure response, relationship style, recovery style, and realistic follow-up questions. Do not use prediction, fate, fortune, or period-luck language.",
    rawResult: baziResult
  });

  return {
    id: crypto.randomUUID(),
    skillId: "jinchenma_bazi",
    system: "bazi",
    requestedSourceUrl: "https://github.com/jinchenma94/bazi-skill",
    resolvedSourceUrl: "https://github.com/jinchenma94/bazi-skill",
    engineSourceUrl: "https://github.com/Brhiza/mingyu",
    availability: "direct",
    status: "ready",
    generatedAt: context.generatedAt,
    confidence: 0.26,
    authority: "low",
    summary: summary.summary,
    structuredSignals: summary.structuredSignals,
    suggestedQuestions: summary.suggestedQuestions,
    disclaimers: [
      "Low-authority personality hypothesis derived from a traditional prior system.",
      "Needs confirmation from long-term dialogue and observed choices."
    ],
    notes: [
      "The requested bazi skill repo was available.",
      "Its skill text was used as the interpretation frame.",
      "The raw charting payload came from the local mingyu engine."
    ],
    rawInput: baseInput,
    rawResult: baziResult,
    rawPrompt: summary.rawPrompt
  };
}

async function generateAstrologyPrior(
  context: PriorGeneratorContext
): Promise<PriorSkillOutput> {
  const birthParts = parseBirthDate(context.profile.birthDate);
  const birthTime = parseBirthTime(context.profile.birthTime);
  const coordinates = deriveAstrologyCoordinates(context.profile);

  if (!birthParts || !birthTime || !coordinates) {
    return buildErrorOutput(context.generatedAt, "astrology_skill", "astrology", {
      requestedSourceUrl: "https://github.com/astrologyai-pro/astrology-skill",
      resolvedSourceUrl: "https://github.com/Brhiza/mingyu",
      availability: "fallback",
      rawInput: {}
    }, "Birth date, birth time, and usable coordinates are required to generate this astrology prior.");
  }

  const astrolabeResult = await runLocalMingyuAstrolabe({
    name: context.profile.fullName ?? "用户",
    gender: mapAstrolabeGender(context.profile.gender),
    year: String(birthParts.year),
    month: String(birthParts.month),
    day: String(birthParts.day),
    hour: String(birthTime.hour),
    minute: String(birthTime.minute),
    latitude: String(coordinates.latitude),
    longitude: String(coordinates.longitude),
    timezone: String(coordinates.timezone),
    locationName: coordinates.locationName,
  });
  const skillExcerpt = await readRepoExcerpt(
    join(repoRoot, ".cache", "skills", "mingyu", "public", "skills", "aov-mingyu-api", "SKILL.md")
  );
  const summary = await summarizePriorWithModel(context.modelConfig, {
    skillLabel: "Brhiza/mingyu (astrolabe fallback)",
    system: "astrology",
    skillExcerpt,
    promptText:
      "Use the fallback astrolabe engine to generate low-authority personality hypotheses only. Focus on decision style, motivation tensions, pressure response, relationship style, recovery style, and realistic follow-up questions. Do not use prediction, fate, fortune, or period-luck language.",
    rawResult: astrolabeResult
  });
  const astrologySummary = normalizeAstrologySummary(summary, astrolabeResult);

  return {
    id: crypto.randomUUID(),
    skillId: "astrology_skill",
    system: "astrology",
    requestedSourceUrl: "https://github.com/astrologyai-pro/astrology-skill",
    resolvedSourceUrl: "https://github.com/Brhiza/mingyu",
    engineSourceUrl: "https://github.com/Brhiza/mingyu",
    availability: "fallback",
    status: "ready",
    generatedAt: context.generatedAt,
    confidence: 0.2,
    authority: "low",
    summary: astrologySummary.summary,
    structuredSignals: astrologySummary.structuredSignals,
    suggestedQuestions: astrologySummary.suggestedQuestions,
    disclaimers: [
      "Fallback astrology engine used because the requested repo was unavailable.",
      "Coordinates were approximate unless the profile included exact latitude and longitude."
    ],
    notes: [
      "Requested repo astrologyai-pro/astrology-skill was unavailable at generation time.",
      ...coordinates.notes
    ],
    rawInput: {
      year: birthParts.year,
      month: birthParts.month,
      day: birthParts.day,
      hour: birthTime.hour,
      minute: birthTime.minute,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      timezone: coordinates.timezone
    },
    rawResult: astrolabeResult,
    rawPrompt: astrologySummary.rawPrompt
  };
}

async function generateYijingPrior(context: PriorGeneratorContext): Promise<PriorSkillOutput> {
  const number = deriveDeterministicYijingNumber(context.profile);
  if (!number) {
    return buildErrorOutput(context.generatedAt, "yijing_skill", "yijing", {
      requestedSourceUrl: "https://github.com/yijingai-team/yijing-skill",
      resolvedSourceUrl: "https://github.com/Brhiza/mingyu",
      availability: "fallback",
      rawInput: {}
    }, "Birth profile was not detailed enough to derive a deterministic yijing fallback number.");
  }

  const meihuaResult = await runLocalMingyuMeihua({
    method: "number",
    number
  });
  const skillExcerpt = await readRepoExcerpt(
    join(repoRoot, ".cache", "skills", "mingyu", "public", "skills", "aov-mingyu-api", "SKILL.md")
  );
  const summary = await summarizePriorWithModel(context.modelConfig, {
    skillLabel: "Brhiza/mingyu (meihua fallback)",
    system: "yijing",
    skillExcerpt,
    promptText:
      "Use the fallback meihua/yijing engine to generate low-authority personality hypotheses only. Focus on decision style, motivation tensions, pressure response, relationship style, recovery style, and realistic follow-up questions. Do not use prediction, fate, fortune, or period-luck language.",
    rawResult: meihuaResult
  });

  return {
    id: crypto.randomUUID(),
    skillId: "yijing_skill",
    system: "yijing",
    requestedSourceUrl: "https://github.com/yijingai-team/yijing-skill",
    resolvedSourceUrl: "https://github.com/Brhiza/mingyu",
    engineSourceUrl: "https://github.com/Brhiza/mingyu",
    availability: "fallback",
    status: "ready",
    generatedAt: context.generatedAt,
    confidence: 0.16,
    authority: "low",
    summary: summary.summary,
    structuredSignals: summary.structuredSignals,
    suggestedQuestions: summary.suggestedQuestions,
    disclaimers: [
      "Fallback meihua/yijing engine used because the requested repo was unavailable.",
      "The hexagram seed number was deterministically derived from the profile to avoid random drift."
    ],
    notes: [
      "Requested repo yijingai-team/yijing-skill was unavailable at generation time.",
      `Deterministic seed number: ${number}`
    ],
    rawInput: {
      method: "number",
      number
    },
    rawResult: meihuaResult,
    rawPrompt: summary.rawPrompt
  };
}

async function summarizePriorWithModel(
  modelConfig: CloudModelConfig | undefined,
  args: {
    skillLabel: string;
    system: string;
    skillExcerpt: string;
    promptText: string;
    rawResult: unknown;
  }
): Promise<{
  summary: string;
  structuredSignals: string[];
  suggestedQuestions: string[];
  rawPrompt: string;
}> {
  const fallback = buildFallbackSummary(args.promptText, args.system);
  if (!modelConfig) {
    return fallback;
  }

  let response: Response;
  try {
    response = await fetch(buildChatCompletionsUrl(modelConfig.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${modelConfig.apiKey}`
      },
      body: JSON.stringify({
        model: modelConfig.model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You generate low-authority prior summaries for a personal-agent training set. Treat every prior as a tentative personality hypothesis. Never use fortune-telling, destiny, predictive, or mystical-advice language. Focus on observable behavior, decision patterns, motivations, tensions, relationships, and recovery style. Output strict JSON with keys summary, structuredSignals, suggestedQuestions."
          },
          {
            role: "user",
            content: JSON.stringify(
              {
                skillLabel: args.skillLabel,
                system: args.system,
                skillExcerpt: clipText(args.skillExcerpt, 7000),
                promptText: clipText(args.promptText, 7000),
                rawResult: args.rawResult,
                responseRequirements: {
                  summary:
                    "One concise paragraph emphasizing hypotheses, not truths, written in grounded language about personality and behavior.",
                  structuredSignals:
                    "Array of 3 to 5 short tentative behavioral signals. Avoid mystical jargon and predictions.",
                  suggestedQuestions:
                    "Array of 2 to 4 realistic confirmation questions about lived experience and decision patterns."
                }
              },
              null,
              2
            )
          }
        ]
      })
    });
  } catch {
    return fallback;
  }

  if (!response.ok) {
    return fallback;
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    return fallback;
  }

  try {
    const parsed = extractJsonPayload(content) as {
      summary?: string;
      structuredSignals?: string[];
      suggestedQuestions?: string[];
    };
    return normalizePriorPayload(args.system, {
      summary: typeof parsed.summary === "string" ? parsed.summary : fallback.summary,
      structuredSignals: Array.isArray(parsed.structuredSignals)
        ? parsed.structuredSignals.map((item) => String(item)).slice(0, 5)
        : fallback.structuredSignals,
      suggestedQuestions: Array.isArray(parsed.suggestedQuestions)
        ? parsed.suggestedQuestions.map((item) => String(item)).slice(0, 4)
        : fallback.suggestedQuestions,
      rawPrompt: args.promptText
    }, fallback);
  } catch {
    return fallback;
  }
}

function buildFallbackSummary(
  promptText: string,
  system: string
): {
  summary: string;
  structuredSignals: string[];
  suggestedQuestions: string[];
  rawPrompt: string;
} {
  const bySystem: Record<string, { summary: string; structuredSignals: string[]; suggestedQuestions: string[] }> = {
    "bazi+ziwei": {
      summary:
        "This low-authority prior suggests the user may care strongly about whether effort leads to visible movement, practical control, and a sense of personal respect. Treat that as a hypothesis about motivation and decision style, then confirm it through real examples.",
      structuredSignals: [
        "May prefer situations where initiative clearly changes the outcome",
        "May become impatient when progress feels blocked or symbolic only",
        "May need both freedom to act and enough structure to feel effective",
        "Earning decisions may depend heavily on whether effort feels respected"
      ],
      suggestedQuestions: [
        "When you choose work, do you care more about freedom to act or clarity of structure?",
        "What kind of stalled situation makes you lose motivation fastest?",
        "What kind of progress makes you feel genuinely respected rather than merely busy?"
      ]
    },
    bazi: {
      summary:
        "This low-authority prior suggests a possible tension between pushing forward and wanting a more reliable structure underneath that push. Use it to test how the user handles pressure, pacing, and practical tradeoffs, not to define who they are.",
      structuredSignals: [
        "May respond strongly to momentum and visible traction",
        "May dislike long periods of effort without concrete feedback",
        "Could oscillate between risk-taking and a wish for firmer control",
        "Growth choices may need to feel both useful and self-directed"
      ],
      suggestedQuestions: [
        "Do you do your best work when things are moving fast, or when the path is clearly mapped?",
        "When money pressure rises, do you narrow your focus or open more options?",
        "What kind of commitment feels energizing instead of constraining?"
      ]
    },
    astrology: {
      summary:
        "This low-authority prior is best treated as a lens on temperament: how directly the user shows themselves, how they regulate emotion, and how much freedom versus reassurance they need in order to act well.",
      structuredSignals: [
        "May have a visible outer style that differs from inner recovery needs",
        "Emotional regulation style may matter as much as raw ambition",
        "Could alternate between spontaneity and self-monitoring",
        "Interpersonal safety may affect execution quality more than it first appears"
      ],
      suggestedQuestions: [
        "When you seem decisive from the outside, what is usually happening inside?",
        "What kind of environment helps you recover your energy fastest?",
        "In close relationships, what makes you feel both free and safe?"
      ]
    },
    yijing: {
      summary:
        "This low-authority prior is best used as a lens on how the user responds to uncertainty, timing, and changing conditions. It should guide follow-up questions about adaptation style, not predictions.",
      structuredSignals: [
        "May be sensitive to whether the timing of a move feels ripe or forced",
        "Could prefer reading the situation before committing full force",
        "May adapt well when the context is legible and resist when it feels noisy",
        "Decision confidence may depend on pattern clarity more than on abstract logic alone"
      ],
      suggestedQuestions: [
        "When a choice is unclear, do you wait for a pattern to emerge or create momentum yourself?",
        "What signals tell you that the timing is right to move?",
        "In messy situations, what helps you trust your own judgment?"
      ]
    }
  };

  const fallback = bySystem[system] ?? {
    summary:
      "This low-authority prior should only be used as a starting hypothesis about personality and behavior, then confirmed or rejected through real-life evidence.",
    structuredSignals: [
      "Needs confirmation through repeated real behavior",
      "May point to motivation and decision-pattern hypotheses",
      "Should never override user correction"
    ],
    suggestedQuestions: [
      "Which parts of this feel true in your real life right now?",
      "Which parts feel off or outdated?",
      "What recent decision is the best evidence either way?"
    ]
  };

  return { ...fallback, rawPrompt: promptText };
}

function buildFortuneBaseInput(
  profile: PriorProfileInput
):
  | {
      gender: "male" | "female";
      year: number;
      month: number;
      day: number;
      timeIndex: number;
      dateType: "solar";
    }
  | null {
  const birthParts = parseBirthDate(profile.birthDate);
  const timeIndex = deriveTimeIndex(profile.birthTime);
  const gender = mapFortuneGender(profile.gender);
  if (!birthParts || timeIndex === null || !gender) {
    return null;
  }

  return {
    gender,
    year: birthParts.year,
    month: birthParts.month,
    day: birthParts.day,
    timeIndex,
    dateType: "solar"
  };
}

function parseBirthDate(
  birthDate?: string
): { year: number; month: number; day: number } | null {
  if (!birthDate) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate.trim());
  if (!match) return null;

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
}

function parseBirthTime(birthTime?: string): { hour: number; minute: number } | null {
  if (!birthTime) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(birthTime.trim());
  if (!match) return null;
  return {
    hour: Number(match[1]),
    minute: Number(match[2])
  };
}

function mapFortuneGender(gender?: string): "male" | "female" | null {
  if (!gender) return null;
  if (["male", "man", "男", "男性"].includes(gender)) return "male";
  if (["female", "woman", "女", "女性"].includes(gender)) return "female";
  return null;
}

function mapAstrolabeGender(gender?: string): "" | "男" | "女" {
  if (!gender) return "";
  if (["male", "man", "男", "男性"].includes(gender)) return "男";
  if (["female", "woman", "女", "女性"].includes(gender)) return "女";
  return "";
}

function summarizeText(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return clean.length > 320 ? `${clean.slice(0, 317)}...` : clean;
}

function normalizeAstrologySummary(
  summary: {
    summary: string;
    structuredSignals: string[];
    suggestedQuestions: string[];
    rawPrompt: string;
  },
  rawResult: unknown
): {
  summary: string;
  structuredSignals: string[];
  suggestedQuestions: string[];
  rawPrompt: string;
} {
  const astrolabe = rawResult as {
    planets?: Array<{ name?: string; sign?: string; retrograde?: boolean }>;
    angles?: Array<{ name?: string; sign?: string }>;
  };
  const sun = astrolabe.planets?.find((item) => item.name === "Sun")?.sign;
  const moon = astrolabe.planets?.find((item) => item.name === "Moon")?.sign;
  const ascendant = astrolabe.angles?.find((item) => item.name === "Ascendant")?.sign;
  const retrogradeCount = astrolabe.planets?.filter((item) => item.retrograde).length ?? 0;

  return {
    summary:
      `这个低权重星盘先验更适合被翻译成性格线索，而不是任何预测。太阳${sun ?? "未知"}、月亮${moon ?? "未知"}、上升${ascendant ?? "未知"}的组合，` +
      `可以先被理解为：你对外如何展开自己、你在情绪里如何恢复、以及你面对新关系或新任务时的第一反应可能并不完全相同。` +
      `如果这条线索成立，它更像是在提醒我们观察你如何在主动表达、内部校正和安全感需求之间找平衡。`,
    structuredSignals: [
      sun ? `太阳${sun}，外显驱动力和自我表达方式值得观察` : "外显驱动力需要后续确认",
      moon ? `月亮${moon}，情绪恢复方式与安全感模式值得观察` : "情绪恢复方式需要后续确认",
      ascendant ? `上升${ascendant}，面对新任务或新关系的第一反应风格较鲜明` : "第一反应风格需要后续确认",
      retrogradeCount > 0
        ? `逆行行星较多（${retrogradeCount}颗），可能更容易反复内省或延后表达`
        : "表达和决策节奏是否反复，需要继续观察"
    ],
    suggestedQuestions: [
      "你做决定时更像先冲出去再修正，还是先反复想清楚再动？",
      "你最有能量的时候，通常是在独立推进、团队协作，还是有明确安全边界的时候？",
      "当你对外表现得很坚定时，内心通常也同样坚定，还是其实还在持续校正？"
    ],
    rawPrompt: summary.rawPrompt
  };
}

function normalizePriorPayload(
  _system: string,
  candidate: {
    summary: string;
    structuredSignals: string[];
    suggestedQuestions: string[];
    rawPrompt: string;
  },
  fallback: {
    summary: string;
    structuredSignals: string[];
    suggestedQuestions: string[];
    rawPrompt: string;
  }
): {
  summary: string;
  structuredSignals: string[];
  suggestedQuestions: string[];
  rawPrompt: string;
} {
  if (["bazi+ziwei", "bazi", "yijing"].includes(_system)) {
    return fallback;
  }

  if (
    containsMysticalLanguage(candidate.summary) ||
    candidate.structuredSignals.some((item) => containsMysticalLanguage(item)) ||
    candidate.suggestedQuestions.some((item) => containsMysticalLanguage(item))
  ) {
    return fallback;
  }

  return candidate;
}

function containsMysticalLanguage(text: string): boolean {
  return /(命盘|八字|日主|财星|印星|食神|身弱|大运|流年|注定|必然|运势|宫位|化权|化禄|化忌|体用|互卦|变卦|坎为水|梅花易数|fortune|destiny|fate|predict|period luck)/i.test(
    text
  );
}

function buildSignalsFromText(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return ["Prior generated but needs user confirmation."];

  return clean
    .split(/[。.!?；;]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4)
    .map((item) => (item.length > 60 ? `${item.slice(0, 57)}...` : item));
}

function buildDefaultDesireState(): DesireState {
  return {
    axes: DESIRE_AXES.map((axis) => ({
      key: axis.key,
      desireType: axis.desireType,
      positiveName: axis.positiveName,
      positiveLabels: axis.positiveLabels,
      balance: axis.balance,
      shadow: axis.shadow,
      baselineScore: 0,
      displayScore: 0
    })),
    totalEffectiveTurns: 0,
    turnsSinceBaseline: 0,
    effectiveTurnTexts: []
  };
}

async function refreshDesireState(args: {
  snapshot: Awaited<ReturnType<FileSystemMemoryStore["getSnapshot"]>>;
  priorSkillOutputs: PriorSkillOutput[];
  latestUserMessage?: string;
  latestMemoryCount?: number;
}): Promise<DesireState> {
  const now = new Date().toISOString();
  const current = await loadDesireState();
  const next: DesireState = {
    ...current,
    axes:
      current.axes?.length === DESIRE_AXES.length
        ? current.axes
        : buildDefaultDesireState().axes
  };

  if (!next.initializedAt || next.totalEffectiveTurns === 0) {
    const baselineScores = computeDesireScores({
      snapshot: args.snapshot,
      priorSkillOutputs: args.priorSkillOutputs,
      textSources: next.effectiveTurnTexts
    });
    next.axes = next.axes.map((axis, index) => ({
      ...axis,
      baselineScore: baselineScores[index] ?? 0,
      displayScore: baselineScores[index] ?? 0
    }));
    next.initializedAt ??= now;
    next.baselineUpdatedAt = now;
  }

  if (
    args.latestUserMessage &&
    isEffectiveUserTurn(args.latestUserMessage, args.latestMemoryCount ?? 0)
  ) {
    next.totalEffectiveTurns += 1;
    next.turnsSinceBaseline += 1;
    next.effectiveTurnTexts = [...next.effectiveTurnTexts, args.latestUserMessage].slice(-200);
  }

  if (next.turnsSinceBaseline >= DESIRE_BASELINE_UPDATE_INTERVAL) {
    const baselineScores = computeDesireScores({
      snapshot: args.snapshot,
      priorSkillOutputs: args.priorSkillOutputs,
      textSources: next.effectiveTurnTexts
    });
    next.axes = next.axes.map((axis, index) => ({
      ...axis,
      baselineScore: baselineScores[index] ?? 0,
      displayScore: baselineScores[index] ?? 0
    }));
    next.turnsSinceBaseline = 0;
    next.baselineUpdatedAt = now;
  } else {
    const recentScores = computeDesireScores({
      snapshot: args.snapshot,
      priorSkillOutputs: [],
      textSources: args.snapshot.cognitionLogs.slice(-6).map((log) => log.rawInteraction.input)
    });
    next.axes = next.axes.map((axis, index) => ({
      ...axis,
      displayScore: clamp(axis.baselineScore * 0.72 + (recentScores[index] ?? 0) * 0.28, -1, 1)
    }));
  }

  await saveDesireState(next);
  return next;
}

function computeDesireScores(args: {
  snapshot: Awaited<ReturnType<FileSystemMemoryStore["getSnapshot"]>>;
  priorSkillOutputs: PriorSkillOutput[];
  textSources: string[];
}): number[] {
  const sources: Array<{ text: string; weight: number }> = [];

  for (const output of args.priorSkillOutputs) {
    if (output.status !== "ready") continue;
    sources.push({
      text: [output.summary, ...(output.structuredSignals ?? []), ...(output.suggestedQuestions ?? [])].join(" "),
      weight: 0.85
    });
  }

  for (const facet of args.snapshot.currentProjection?.facets ?? []) {
    sources.push({
      text: `${facet.label} ${facet.summary}`,
      weight: 1.1
    });
  }

  for (const pending of args.snapshot.memories.filter((item) => item.status === "pending_confirmation")) {
    sources.push({
      text: `${pending.type} ${pending.statement}`,
      weight: 0.9
    });
  }

  for (const text of args.textSources) {
    sources.push({
      text,
      weight: 1
    });
  }

  return DESIRE_AXES.map((axis) => {
    let positive = 0;
    let shadow = 0;

    for (const source of sources) {
      const text = source.text.toLowerCase();
      positive += countWeightedHits(text, axis.positiveTokens, source.weight);
      shadow += countWeightedHits(text, axis.shadowTokens, source.weight);

      if (axis.key === "security" && /(赚钱|收入|cash|money|income)/i.test(source.text)) {
        positive += 0.22 * source.weight;
      }
      if (axis.key === "ambition" && /(成长|学习|skill|growth|learn)/i.test(source.text)) {
        positive += 0.22 * source.weight;
      }
      if (axis.key === "intimacy" && /(关系|亲密|表达情感|emotion|relationship)/i.test(source.text)) {
        positive += 0.22 * source.weight;
      }
      if (axis.key === "rest" && /(恢复|休息|太累|burnout|rest|sleep)/i.test(source.text)) {
        positive += 0.22 * source.weight;
      }
    }

    const totalSignal = positive + shadow;
    return totalSignal < 0.2 ? 0 : clamp((positive - shadow * 1.12) / 3.2, -1, 1);
  });
}

function isEffectiveUserTurn(message: string, memoryCount: number): boolean {
  const clean = message.trim();
  if (memoryCount > 0) return true;
  if (clean.length >= 24) return true;
  return clean.length >= 6 && /(我|自己|想|不想|需要|喜欢|讨厌|关系|赚钱|成长|学习|压力|担心|害怕|选择)/.test(clean);
}

function countWeightedHits(text: string, tokens: readonly string[], weight: number): number {
  return tokens.reduce(
    (sum, token) => sum + (text.includes(token.toLowerCase()) ? weight : 0),
    0
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildErrorOutput(
  generatedAt: string,
  skillId: PriorSkillOutput["skillId"],
  system: PriorSkillOutput["system"],
  base: Pick<
    PriorSkillOutput,
    "requestedSourceUrl" | "resolvedSourceUrl" | "availability" | "rawInput"
  >,
  error: string
): PriorSkillOutput {
  return {
    id: crypto.randomUUID(),
    skillId,
    system,
    requestedSourceUrl: base.requestedSourceUrl,
    resolvedSourceUrl: base.resolvedSourceUrl,
    availability: base.availability,
    status: "error",
    generatedAt,
    confidence: 0,
    authority: "low",
    summary: "",
    structuredSignals: [],
    suggestedQuestions: [],
    disclaimers: [],
    notes: [],
    rawInput: base.rawInput,
    error
  };
}

async function runLocalMingyuBazi(input: Record<string, unknown>): Promise<unknown> {
  return runMingyuJson(
    "const { buildPersonFromInput, calculateFullBaziChart } = await import('./src/lib/full-chart-engine/bazi.ts'); const input = JSON.parse(Buffer.from(process.env.MINGYU_INPUT_B64, 'base64').toString('utf8')); const result = calculateFullBaziChart(buildPersonFromInput(input)); console.log(JSON.stringify(result));",
    input
  );
}

async function runLocalMingyuZiwei(input: Record<string, unknown>): Promise<unknown> {
  return runMingyuJson(
    "const { buildZiweiChartInput, calculatePublicZiweiChartForScopes } = await import('./src/lib/full-chart-engine/ziwei.ts'); const input = JSON.parse(Buffer.from(process.env.MINGYU_INPUT_B64, 'base64').toString('utf8')); const result = await calculatePublicZiweiChartForScopes(buildZiweiChartInput(input), ['origin']); console.log(JSON.stringify({ payloadByScope: result.payloadByScope }));",
    input
  );
}

async function runLocalMingyuAstrolabe(input: Record<string, unknown>): Promise<unknown> {
  return runMingyuJson(
    "const { generateAstrolabe } = await import('./src/lib/divination/algorithms/astrolabe.ts'); const input = JSON.parse(Buffer.from(process.env.MINGYU_INPUT_B64, 'base64').toString('utf8')); const result = generateAstrolabe(input); console.log(JSON.stringify(result));",
    input
  );
}

async function runLocalMingyuMeihua(input: Record<string, unknown>): Promise<unknown> {
  return runMingyuJson(
    "const { generateMeihua } = await import('./src/lib/divination/algorithms/meihua/index.ts'); const input = JSON.parse(Buffer.from(process.env.MINGYU_INPUT_B64, 'base64').toString('utf8')); const result = generateMeihua(undefined, input); console.log(JSON.stringify(result));",
    input
  );
}

async function runMingyuJson(script: string, input: Record<string, unknown>): Promise<unknown> {
  await ensureMingyuDependencies();

  return new Promise((resolve, reject) => {
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const child = spawn("node", ["--import", "tsx", "-e", script], {
      cwd: mingyuRoot,
      env: {
        ...process.env,
        TSX_TSCONFIG_PATH: "tsconfig.app.json",
        MINGYU_INPUT_B64: Buffer.from(JSON.stringify(input), "utf8").toString("base64")
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `Local mingyu runner failed with exit code ${code}: ${Buffer.concat(stderr).toString("utf8")}`
          )
        );
        return;
      }

      try {
        resolve(JSON.parse(Buffer.concat(stdout).toString("utf8")));
      } catch (error) {
        reject(
          new Error(
            `Local mingyu runner returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`
          )
        );
      }
    });
  });
}

async function ensureMingyuDependencies(): Promise<void> {
  if (!mingyuInstallPromise) {
    mingyuInstallPromise = (async () => {
      const { access } = await import("node:fs/promises");
      try {
        await access(join(mingyuRoot, "node_modules"));
      } catch {
        await new Promise<void>((resolve, reject) => {
          const child = spawn("npm", ["install"], {
            cwd: mingyuRoot,
            stdio: "ignore"
          });
          child.on("error", reject);
          child.on("exit", (code) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`npm install in mingyu failed with exit code ${code}`));
            }
          });
        });
      }
    })();
  }

  await mingyuInstallPromise;
}

function buildChatCompletionsUrl(baseUrl: string): string {
  const normalized = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return `${normalized}/v1/chat/completions`;
}

function extractJsonPayload(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(content.slice(start, end + 1));
    }
    throw new Error("No JSON object found in cloud model response");
  }
}

async function readRepoExcerpt(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

function clipText(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 3)}...`;
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return JSON.stringify(value, null, 2);
}

function readJson(req: import("node:http").IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

const port = Number(process.env.PORT ?? 4173);
server.listen(port, "127.0.0.1", () => {
  nightlyTrainingScheduler.start();
  earningResearchScheduler.start();
  console.log(`xiaoxian AI local web app listening on http://127.0.0.1:${port}`);
});

let shutdownStarted = false;
async function shutdownLocalServices(): Promise<void> {
  if (shutdownStarted) return;
  shutdownStarted = true;
  nightlyTrainingScheduler.stop();
  earningResearchScheduler.stop();
  await earningResearchRunPromise?.catch(() => []);
  await personalizationWorker.shutdown();
  server.close();
}

process.once("SIGINT", () => void shutdownLocalServices());
process.once("SIGTERM", () => void shutdownLocalServices());
