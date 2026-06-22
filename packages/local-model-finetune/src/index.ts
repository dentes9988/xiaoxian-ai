import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";

import type { TrainingExample } from "@98agent/training-data";
import { FileSystemModelRegistry } from "@98agent/model-registry";

export interface TrainingWindowConfig {
  startHourLocal: number;
  endHourLocal: number;
}

export interface FineTuneRuntimeConfig {
  model: string;
  maxDurationSeconds: number;
  batchSize: number;
  gradAccumulationSteps: number;
  numLayers: number;
  learningRate: number;
  maxSeqLength: number;
  saveEvery: number;
  optimizer: "adam" | "adamw" | "muon" | "sgd" | "adafactor";
  maskPrompt: boolean;
  gradCheckpoint: boolean;
  window: TrainingWindowConfig;
  enabled: boolean;
}

export interface FineTunePlan {
  backend: "mlx-lora";
  baseModel: string;
  maxDurationSeconds: number;
  datasetPath: string;
  datasetDir: string;
  outputDir: string;
  runId: string;
  runDir: string;
  enabled: boolean;
  window: TrainingWindowConfig;
  trainingArgs: {
    batchSize: number;
    gradAccumulationSteps: number;
    numLayers: number;
    learningRate: number;
    maxSeqLength: number;
    saveEvery: number;
    optimizer: "adam" | "adamw" | "muon" | "sgd" | "adafactor";
    maskPrompt: boolean;
    gradCheckpoint: boolean;
    iters: number;
  };
}

export interface FineTuneRunSummary {
  status: "completed" | "timed_out" | "disabled" | "skipped_window" | "needs_prepare" | "failed";
  adapterPath?: string;
  manifestPath?: string;
  logPath?: string;
  elapsedSeconds?: number;
  bootstrapSeconds?: number;
  preparedModelPath?: string;
  reason?: string;
}

interface PreparedFineTuneModel {
  status?: "prepared" | "partial";
  bootstrapSeconds: number;
  manifestPath?: string;
  preparedModelPath: string;
  reason?: string;
}

export interface TrainingModelPreparationStatus {
  requestedModel?: string;
  checkedModel?: string;
  prepared: boolean;
  preparedModelPath?: string;
  reason?: string;
  missingFiles?: string[];
  usedFallbackCandidate?: boolean;
  actualBytes?: number;
  expectedBytes?: number;
  downloadPercent?: number;
}

export interface TrainingModelCandidateStatus extends TrainingModelPreparationStatus {
  candidateModel: string;
}

export interface TrainingControlConfig extends FineTuneRuntimeConfig {
  trainingProvider: "mlx";
}

export function resolveTrainingModelCandidates(model: string): string[] {
  const normalized = model.trim();
  if (!normalized) return [];

  const candidates = [normalized];
  if (normalized === "mlx-community/VibeThinker-3B-4bit") {
    candidates.push("mlx-community/VibeThinker-3B");
  } else if (normalized === "mlx-community/VibeThinker-3B") {
    candidates.push("mlx-community/VibeThinker-3B-4bit");
  }

  return [...new Set(candidates)];
}

export function buildDefaultTrainingControlConfig(): TrainingControlConfig {
  return {
    trainingProvider: "mlx",
    model: "mlx-community/VibeThinker-3B-4bit",
    maxDurationSeconds: 300,
    batchSize: 1,
    gradAccumulationSteps: 4,
    numLayers: 4,
    learningRate: 1e-5,
    maxSeqLength: 1024,
    saveEvery: 8,
    optimizer: "adamw",
    maskPrompt: true,
    gradCheckpoint: true,
    enabled: true,
    window: {
      startHourLocal: 1,
      endHourLocal: 6
    }
  };
}

export async function loadTrainingControlConfig(
  path: string
): Promise<TrainingControlConfig> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as Partial<TrainingControlConfig>;
    const defaults = buildDefaultTrainingControlConfig();
    return {
      ...defaults,
      ...parsed,
      window: {
        ...defaults.window,
        ...parsed.window
      }
    };
  } catch {
    return buildDefaultTrainingControlConfig();
  }
}

export async function saveTrainingControlConfig(
  path: string,
  config: TrainingControlConfig
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(config, null, 2), "utf8");
}

export function planFastFineTune(args: {
  rootDir: string;
  config?: Partial<TrainingControlConfig>;
}): FineTunePlan {
  const defaults = buildDefaultTrainingControlConfig();
  const resolved: TrainingControlConfig = {
    ...defaults,
    ...args.config,
    window: {
      ...defaults.window,
      ...args.config?.window
    }
  };
  const runId = new Date().toISOString().replace(/[:.]/g, "-");

  return {
    backend: "mlx-lora",
    baseModel: resolved.model,
    maxDurationSeconds: Math.min(Math.max(resolved.maxDurationSeconds, 60), 900),
    datasetPath: join(args.rootDir, "data", "training", "daily-cognition.jsonl"),
    datasetDir: join(args.rootDir, "data", "training", "mlx-lora"),
    outputDir: join(args.rootDir, "data", "checkpoints"),
    runId,
    runDir: join(args.rootDir, "data", "checkpoints", runId),
    enabled: resolved.enabled,
    window: resolved.window,
    trainingArgs: {
      batchSize: Math.max(1, resolved.batchSize),
      gradAccumulationSteps: Math.max(1, resolved.gradAccumulationSteps),
      numLayers: Math.max(1, resolved.numLayers),
      learningRate: resolved.learningRate,
      maxSeqLength: Math.max(256, resolved.maxSeqLength),
      saveEvery: Math.max(1, resolved.saveEvery),
      optimizer: resolved.optimizer,
      maskPrompt: resolved.maskPrompt,
      gradCheckpoint: resolved.gradCheckpoint,
      iters: 24
    }
  };
}

export async function writeTrainingDataset(path: string, examples: TrainingExample[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const content = examples.map((example) => JSON.stringify(example)).join("\n");
  await writeFile(path, content, "utf8");
}

export async function writeMlxChatDataset(
  datasetDir: string,
  examples: TrainingExample[]
): Promise<{
  trainCount: number;
  validCount: number;
}> {
  await mkdir(datasetDir, { recursive: true });

  const chatRows = examples.map((example) => ({
    messages: [
      {
        role: "system",
        content:
          "You are the user's private self-model training adapter. Learn cautious, time-aware personalization patterns. Never invent certainty."
      },
      {
        role: "user",
        content: [
          `Task: ${example.task}`,
          `Instruction: ${example.instruction}`,
          `Input:`,
          example.input
        ].join("\n")
      },
      {
        role: "assistant",
        content: example.output
      }
    ]
  }));

  const validCount = chatRows.length >= 8 ? Math.max(1, Math.floor(chatRows.length * 0.2)) : 0;
  const trainCount = Math.max(1, chatRows.length - validCount);
  const trainRows = chatRows.slice(0, trainCount);
  const validRows = chatRows.slice(trainCount);

  await writeFile(
    join(datasetDir, "train.jsonl"),
    trainRows.map((row) => JSON.stringify(row)).join("\n"),
    "utf8"
  );

  if (validRows.length > 0) {
    await writeFile(
      join(datasetDir, "valid.jsonl"),
      validRows.map((row) => JSON.stringify(row)).join("\n"),
      "utf8"
    );
  } else {
    const { rm } = await import("node:fs/promises");
    await rm(join(datasetDir, "valid.jsonl"), { force: true });
  }

  return {
    trainCount: trainRows.length,
    validCount: validRows.length
  };
}

export function shouldTrainInWindow(
  now: Date,
  window: TrainingWindowConfig
): boolean {
  const hour = now.getHours();
  if (window.startHourLocal === window.endHourLocal) {
    return true;
  }
  if (window.startHourLocal < window.endHourLocal) {
    return hour >= window.startHourLocal && hour < window.endHourLocal;
  }
  return hour >= window.startHourLocal || hour < window.endHourLocal;
}

export function estimateFastTuneIters(args: {
  exampleCount: number;
  maxDurationSeconds: number;
}): number {
  const floor = Math.max(12, Math.min(32, args.exampleCount * 2));
  if (args.maxDurationSeconds <= 120) return Math.min(floor, 12);
  if (args.maxDurationSeconds <= 240) return Math.min(floor, 20);
  if (args.maxDurationSeconds <= 360) return Math.min(floor, 28);
  return Math.min(Math.max(floor, 24), 48);
}

export async function runFastFineTune(args: {
  rootDir: string;
  plan: FineTunePlan;
  registry: FileSystemModelRegistry;
  exampleCount: number;
  respectWindow?: boolean;
  now?: Date;
}): Promise<FineTuneRunSummary> {
  if (!args.plan.enabled) {
    return {
      status: "disabled",
      reason: "Training is disabled by configuration."
    };
  }

  const now = args.now ?? new Date();
  if (args.respectWindow && !shouldTrainInWindow(now, args.plan.window)) {
    return {
      status: "skipped_window",
      reason: `Current local hour ${now.getHours()} is outside the configured training window.`
    };
  }

  await mkdir(args.plan.runDir, { recursive: true });
  const scriptPath = join(args.rootDir, "packages", "local-model-finetune", "scripts", "run_mlx_lora.py");
  const preparationStatus = await getTrainingModelPreparationStatus({
    scriptPath,
    baseModel: args.plan.baseModel,
    dataDir: args.plan.datasetDir,
    runDir: args.plan.runDir,
    maxDurationSeconds: args.plan.maxDurationSeconds
  });
  if (!preparationStatus.prepared || !preparationStatus.preparedModelPath) {
    return {
      status: "needs_prepare",
      reason:
        preparationStatus.reason ??
        "Training model is not prepared locally yet. Run the one-time model preparation step before nightly fast-tuning."
    };
  }

  const preparedModel = await prepareFastFineTuneModel({
    scriptPath,
    baseModel: preparationStatus.checkedModel ?? args.plan.baseModel,
    dataDir: args.plan.datasetDir,
    runDir: args.plan.runDir,
    maxDurationSeconds: args.plan.maxDurationSeconds
  });
  const remainingSeconds = Math.max(
    0,
    args.plan.maxDurationSeconds - Math.ceil(preparedModel.bootstrapSeconds)
  );

  if (remainingSeconds < 30) {
    return {
      status: "timed_out",
      bootstrapSeconds: preparedModel.bootstrapSeconds,
      preparedModelPath: preparedModel.preparedModelPath,
      manifestPath: preparedModel.manifestPath,
      reason: "Model preparation used the available fast-training budget."
    };
  }

  const iters = estimateFastTuneIters({
    exampleCount: args.exampleCount,
    maxDurationSeconds: remainingSeconds
  });

  const result = await new Promise<FineTuneRunSummary>((resolve, reject) => {
    const child = spawn(
      "python3",
      [
        scriptPath,
        "--model",
        preparedModel.preparedModelPath,
        "--data-dir",
        args.plan.datasetDir,
        "--adapter-path",
        args.plan.runDir,
        "--max-seconds",
        String(remainingSeconds),
        "--iters",
        String(iters),
        "--batch-size",
        String(args.plan.trainingArgs.batchSize),
        "--grad-accumulation-steps",
        String(args.plan.trainingArgs.gradAccumulationSteps),
        "--num-layers",
        String(args.plan.trainingArgs.numLayers),
        "--learning-rate",
        String(args.plan.trainingArgs.learningRate),
        "--max-seq-length",
        String(args.plan.trainingArgs.maxSeqLength),
        "--save-every",
        String(args.plan.trainingArgs.saveEvery),
        "--optimizer",
        args.plan.trainingArgs.optimizer,
        ...(args.plan.trainingArgs.maskPrompt ? ["--mask-prompt"] : []),
        ...(args.plan.trainingArgs.gradCheckpoint ? ["--grad-checkpoint"] : [])
      ],
      { stdio: "inherit" }
    );

    child.on("error", reject);
    child.on("exit", async (code) => {
      if (code !== 0) {
        reject(new Error(`Fine-tune command failed with exit code ${code}`));
        return;
      }

      try {
        const manifestPath = join(args.plan.runDir, "run-manifest.json");
        const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
          status: FineTuneRunSummary["status"];
          adapter_path?: string;
          log_path?: string;
          elapsed_seconds?: number;
        };
        resolve({
          status: manifest.status,
          adapterPath: manifest.adapter_path,
          manifestPath,
          logPath: manifest.log_path,
          elapsedSeconds: manifest.elapsed_seconds,
          bootstrapSeconds: preparedModel.bootstrapSeconds,
          preparedModelPath: preparedModel.preparedModelPath
        });
      } catch (error) {
        reject(error);
      }
    });
  });

  if (result.adapterPath) {
    await args.registry.add({
      id: crypto.randomUUID(),
      baseModel: args.plan.baseModel,
      adapterPath: result.adapterPath,
      createdAt: new Date().toISOString(),
      trainingMode: "mlx-lora",
      status: "ready",
      isolationMode: "adapter_only",
      trainingDataScope: "profile_cognition_and_skill_priors",
      notes:
        `MLX LoRA run ${args.plan.runId} finished with status ${result.status}. ` +
        `Budget ${args.plan.maxDurationSeconds}s with ${result.bootstrapSeconds ?? 0}s spent preparing the model, ` +
        `${iters} iterations, ` +
        `${args.plan.trainingArgs.numLayers} layers, batch ${args.plan.trainingArgs.batchSize} x accum ${args.plan.trainingArgs.gradAccumulationSteps}.`
    });
  }

  return result;
}

export async function getTrainingModelPreparationStatus(args: {
  scriptPath: string;
  baseModel: string;
  dataDir: string;
  runDir: string;
  maxDurationSeconds: number;
}): Promise<TrainingModelPreparationStatus> {
  const candidateStatuses = await getTrainingModelCandidateStatuses(args);
  const preparedCandidate = candidateStatuses.find((candidate) => candidate.prepared);
  if (preparedCandidate) return preparedCandidate;

  return (
    candidateStatuses[0] ?? {
      requestedModel: args.baseModel,
      checkedModel: args.baseModel,
      prepared: false,
      reason:
        "Training model is not fully prepared locally yet. Run model preparation once before nightly fast-tuning."
    }
  );
}

export async function getTrainingModelCandidateStatuses(args: {
  scriptPath: string;
  baseModel: string;
  dataDir: string;
  runDir: string;
  maxDurationSeconds: number;
}): Promise<TrainingModelCandidateStatus[]> {
  const candidates = resolveTrainingModelCandidates(args.baseModel);
  return Promise.all(
    candidates.map(async (candidateModel) => ({
      candidateModel,
      ...(await inspectTrainingModelCandidate({
        ...args,
        candidateModel
      }))
    }))
  );
}

export async function prepareTrainingModel(args: {
  scriptPath: string;
  baseModel: string;
  dataDir: string;
  runDir: string;
  maxDurationSeconds: number;
}): Promise<PreparedFineTuneModel> {
  const currentStatus = await getTrainingModelPreparationStatus(args);
  if (currentStatus.prepared && currentStatus.preparedModelPath) {
    return {
      bootstrapSeconds: 0,
      preparedModelPath: currentStatus.preparedModelPath
    };
  }
  return prepareFastFineTuneModel(args);
}

async function prepareFastFineTuneModel(args: {
  scriptPath: string;
  baseModel: string;
  dataDir: string;
  runDir: string;
  maxDurationSeconds: number;
}): Promise<PreparedFineTuneModel> {
  return new Promise<PreparedFineTuneModel>((resolve, reject) => {
    const child = spawn(
      "python3",
      [
        args.scriptPath,
        "--prepare-only",
        "--model",
        args.baseModel,
        "--data-dir",
        args.dataDir,
        "--adapter-path",
        args.runDir,
        "--max-seconds",
        String(args.maxDurationSeconds)
      ],
      { stdio: ["ignore", "pipe", "inherit"] }
    );

    let stdout = "";
    if (!child.stdout) {
      reject(new Error("Unable to read model preparation output."));
      return;
    }
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.on("error", reject);
    child.on("exit", async (code) => {
      if (code !== 0) {
        reject(new Error(`Model preparation failed with exit code ${code}`));
        return;
      }

      try {
        const payload = JSON.parse(stdout.trim()) as {
          status?: "prepared" | "partial";
          bootstrap_seconds?: number;
          prepared_model_path?: string;
          manifest_path?: string;
          checked_model?: string;
          reason?: string;
        };
        if (!payload.prepared_model_path) {
          throw new Error("Model preparation did not return a prepared model path.");
        }
        resolve({
          status: payload.status,
          bootstrapSeconds: payload.bootstrap_seconds ?? 0,
          manifestPath: payload.manifest_path,
          preparedModelPath: payload.prepared_model_path,
          reason: payload.reason
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function inspectTrainingModelCandidate(args: {
  scriptPath: string;
  baseModel: string;
  candidateModel: string;
  dataDir: string;
  runDir: string;
  maxDurationSeconds: number;
}): Promise<TrainingModelPreparationStatus> {
  return new Promise<TrainingModelPreparationStatus>((resolve, reject) => {
    const child = spawn(
      "python3",
      [
        args.scriptPath,
        "--check-only",
        "--model",
        args.candidateModel,
        "--data-dir",
        args.dataDir,
        "--adapter-path",
        args.runDir,
        "--max-seconds",
        String(args.maxDurationSeconds)
      ],
      { stdio: ["ignore", "pipe", "inherit"] }
    );

    let stdout = "";
    if (!child.stdout) {
      reject(new Error("Unable to inspect training model status."));
      return;
    }

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`Training model status check failed with exit code ${code}`));
        return;
      }

      try {
        const payload = JSON.parse(stdout.trim()) as {
          requested_model?: string;
          checked_model?: string;
          prepared?: boolean;
          prepared_model_path?: string;
          reason?: string;
          missing_files?: string[];
          actual_bytes?: number;
          expected_bytes?: number;
          download_percent?: number;
        };
        const requestedModel = payload.requested_model ?? args.baseModel;
        const checkedModel = payload.checked_model ?? args.candidateModel;
        resolve({
          requestedModel,
          checkedModel,
          prepared: Boolean(payload.prepared),
          preparedModelPath: payload.prepared_model_path,
          reason: payload.reason,
          missingFiles: Array.isArray(payload.missing_files) ? payload.missing_files : [],
          usedFallbackCandidate: Boolean(payload.prepared) && checkedModel !== requestedModel,
          actualBytes: payload.actual_bytes,
          expectedBytes: payload.expected_bytes,
          downloadPercent: payload.download_percent
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}
