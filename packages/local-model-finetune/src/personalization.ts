import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  FileSystemModelRegistry,
  type ModelCheckpointRecord
} from "@98agent/model-registry";

export interface LocalTurnPersonalizationResult {
  status: "used" | "skipped" | "failed";
  turnContextHints: string[];
  checkpoint?: ModelCheckpointRecord;
  reason?: string;
  notes?: string[];
}

export type ResidentPersonalizationWorkerState =
  | "sleeping"
  | "starting"
  | "ready"
  | "stopping"
  | "failed";

export interface ResidentPersonalizationWorkerStatus {
  state: ResidentPersonalizationWorkerState;
  idleTimeoutMs: number;
  checkpointId?: string;
  pid?: number;
  startedAt?: string;
  lastUsedAt?: string;
  idleExpiresAt?: string;
  restartCount: number;
  lastStopReason?: string;
  lastError?: string;
}

interface TurnContextScriptPayload {
  turnContextHints?: unknown;
  notes?: unknown;
}

interface WorkerEnvelope {
  type?: unknown;
  id?: unknown;
  ok?: unknown;
  result?: unknown;
  error?: unknown;
}

interface PendingWorkerRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
}

interface ResidentPersonalizationWorkerOptions {
  rootDir: string;
  registry: FileSystemModelRegistry;
  idleTimeoutMs?: number;
  requestTimeoutMs?: number;
  startupTimeoutMs?: number;
  pythonBin?: string;
  scriptPath?: string;
}

interface TurnPersonalizationInput {
  userMessage: string;
  projectionText?: string;
  selfModelDigestText?: string;
}

const DEFAULT_IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;
const DEFAULT_STARTUP_TIMEOUT_MS = 120_000;

export function selectPreferredPersonalizationCheckpoint(
  records: ModelCheckpointRecord[]
): ModelCheckpointRecord | undefined {
  const eligible = records
    .filter(
      (record) =>
        (record.status === "active" || record.status === "ready") &&
        typeof record.adapterPath === "string" &&
        record.adapterPath.length > 0
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  return eligible.find((record) => record.status === "active") ?? eligible[0];
}

export function resolveAdapterLoadPath(adapterPath: string): string {
  return adapterPath.endsWith(".safetensors") ? dirname(adapterPath) : adapterPath;
}

export async function resolvePersonalizationPythonBin(args: {
  rootDir: string;
  explicitPythonBin?: string;
  platform?: NodeJS.Platform;
}): Promise<string | undefined> {
  const platform = args.platform ?? process.platform;
  const candidates = [
    args.explicitPythonBin,
    process.env.XIAOXIAN_LOCAL_PYTHON,
    platform === "win32"
      ? join(args.rootDir, ".venv", "Scripts", "python.exe")
      : join(args.rootDir, ".venv", "bin", "python")
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }

  return undefined;
}

export class ResidentPersonalizationWorker {
  private readonly idleTimeoutMs: number;
  private readonly requestTimeoutMs: number;
  private readonly startupTimeoutMs: number;
  private child: ChildProcessWithoutNullStreams | null = null;
  private state: ResidentPersonalizationWorkerState = "sleeping";
  private checkpoint: ModelCheckpointRecord | undefined;
  private checkpointFingerprint: string | undefined;
  private stdoutBuffer = "";
  private stderrBuffer = "";
  private pendingRequests = new Map<string, PendingWorkerRequest>();
  private idleTimer: NodeJS.Timeout | undefined;
  private startupTimer: NodeJS.Timeout | undefined;
  private startupResolve: (() => void) | undefined;
  private startupReject: ((reason: Error) => void) | undefined;
  private operationQueue: Promise<void> = Promise.resolve();
  private startedAt: string | undefined;
  private lastUsedAt: string | undefined;
  private restartCount = 0;
  private lastStopReason: string | undefined;
  private lastError: string | undefined;

  constructor(private readonly options: ResidentPersonalizationWorkerOptions) {
    this.idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.startupTimeoutMs = options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS;
  }

  getStatus(): ResidentPersonalizationWorkerStatus {
    const idleExpiresAt =
      this.state === "ready" && this.lastUsedAt
        ? new Date(new Date(this.lastUsedAt).getTime() + this.idleTimeoutMs).toISOString()
        : undefined;

    return {
      state: this.state,
      idleTimeoutMs: this.idleTimeoutMs,
      checkpointId: this.checkpoint?.id,
      pid: this.child?.pid,
      startedAt: this.startedAt,
      lastUsedAt: this.lastUsedAt,
      idleExpiresAt,
      restartCount: this.restartCount,
      lastStopReason: this.lastStopReason,
      lastError: this.lastError
    };
  }

  async personalize(input: TurnPersonalizationInput): Promise<LocalTurnPersonalizationResult> {
    return this.serialize(() => this.personalizeSerial(input));
  }

  async healthCheck(): Promise<ResidentPersonalizationWorkerStatus & { responsive: boolean }> {
    return this.serialize(async () => {
      if (!this.child || this.state === "sleeping") {
        return { ...this.getStatus(), responsive: this.state !== "failed" };
      }

      try {
        await this.sendCommand("ping", {});
        return { ...this.getStatus(), responsive: true };
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : String(error);
        await this.stopWorker("health_check_failed");
        return { ...this.getStatus(), responsive: false };
      }
    });
  }

  async reloadIfNeeded(): Promise<boolean> {
    return this.serialize(async () => {
      if (!this.child || !this.checkpointFingerprint) return false;
      const next = selectPreferredPersonalizationCheckpoint(await this.options.registry.load());
      const nextFingerprint = next ? checkpointKey(next) : undefined;
      if (nextFingerprint === this.checkpointFingerprint) return false;
      await this.stopWorker("adapter_changed");
      return true;
    });
  }

  async sleep(reason = "manual_sleep"): Promise<void> {
    await this.serialize(() => this.stopWorker(reason));
  }

  async shutdown(): Promise<void> {
    await this.sleep("shutdown");
  }

  private async personalizeSerial(
    input: TurnPersonalizationInput
  ): Promise<LocalTurnPersonalizationResult> {
    const checkpoint = selectPreferredPersonalizationCheckpoint(await this.options.registry.load());
    if (!checkpoint?.adapterPath) {
      return {
        status: "skipped",
        turnContextHints: [],
        reason: "No trained local adapter is ready for turn personalization."
      };
    }

    const pythonBin = await resolvePersonalizationPythonBin({
      rootDir: this.options.rootDir,
      explicitPythonBin: this.options.pythonBin
    });
    if (!pythonBin) {
      return {
        status: "skipped",
        turnContextHints: [],
        checkpoint,
        reason: "The local personalization Python environment is not installed."
      };
    }

    const scriptPath =
      this.options.scriptPath ??
      join(
        this.options.rootDir,
        "packages",
        "local-model-finetune",
        "scripts",
        "extract_turn_context.py"
      );
    if (!(await pathExists(scriptPath))) {
      return {
        status: "failed",
        turnContextHints: [],
        checkpoint,
        reason: "Local turn-context extraction script is missing."
      };
    }

    const payload = {
      userMessage: input.userMessage,
      projectionText: input.projectionText ?? "",
      selfModelDigestText: input.selfModelDigestText ?? ""
    };

    let lastFailure: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await this.ensureWorker({ checkpoint, pythonBin, scriptPath });
        const raw = await this.sendCommand("personalize", payload);
        const parsed = parseTurnContextScriptPayload(raw);
        if (!parsed) throw new Error("Local turn-context model returned invalid JSON.");

        this.lastUsedAt = new Date().toISOString();
        this.lastError = undefined;
        this.scheduleIdleSleep();
        return {
          status: "used",
          turnContextHints: parsed.turnContextHints,
          checkpoint,
          notes: parsed.notes
        };
      } catch (error) {
        lastFailure = error;
        this.lastError = error instanceof Error ? error.message : String(error);
        await this.stopWorker(attempt === 0 ? "request_restart" : "request_failed");
        if (attempt === 0) this.restartCount += 1;
      }
    }

    return {
      status: "failed",
      turnContextHints: [],
      checkpoint,
      reason: lastFailure instanceof Error ? lastFailure.message : String(lastFailure)
    };
  }

  private async ensureWorker(args: {
    checkpoint: ModelCheckpointRecord;
    pythonBin: string;
    scriptPath: string;
  }): Promise<void> {
    const fingerprint = checkpointKey(args.checkpoint);
    if (this.child && this.state === "ready" && this.checkpointFingerprint === fingerprint) {
      this.clearIdleTimer();
      return;
    }

    if (this.child) await this.stopWorker("adapter_changed");

    this.state = "starting";
    this.checkpoint = args.checkpoint;
    this.checkpointFingerprint = fingerprint;
    this.stdoutBuffer = "";
    this.stderrBuffer = "";
    this.lastStopReason = undefined;

    const child = spawn(
      args.pythonBin,
      [
        args.scriptPath,
        "--serve",
        "--model",
        args.checkpoint.baseModel,
        "--adapter-path",
        resolveAdapterLoadPath(args.checkpoint.adapterPath ?? ""),
        "--max-tokens",
        "320"
      ],
      { stdio: ["pipe", "pipe", "pipe"] }
    );
    this.child = child;

    child.stdout.on("data", (chunk) => this.handleStdout(child, String(chunk)));
    child.stderr.on("data", (chunk) => {
      this.stderrBuffer = `${this.stderrBuffer}${String(chunk)}`.slice(-8_000);
    });
    child.on("error", (error) => this.handleUnexpectedExit(child, error));
    child.on("exit", (code, signal) => {
      const detail = this.stderrBuffer.trim();
      this.handleUnexpectedExit(
        child,
        new Error(
          detail ||
            `Local personalization worker exited with code ${String(code)} and signal ${String(signal)}.`
        )
      );
    });

    await new Promise<void>((resolve, reject) => {
      this.startupResolve = resolve;
      this.startupReject = reject;
      this.startupTimer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(
          new Error(`Local personalization worker startup timed out after ${this.startupTimeoutMs}ms.`)
        );
      }, this.startupTimeoutMs);
      this.startupTimer.unref();
    });

    this.state = "ready";
    this.startedAt = new Date().toISOString();
  }

  private handleStdout(child: ChildProcessWithoutNullStreams, chunk: string): void {
    if (this.child !== child) return;
    this.stdoutBuffer += chunk;

    let newline = this.stdoutBuffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.stdoutBuffer.slice(0, newline).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      if (line) this.handleWorkerLine(line);
      newline = this.stdoutBuffer.indexOf("\n");
    }
  }

  private handleWorkerLine(line: string): void {
    let envelope: WorkerEnvelope;
    try {
      envelope = JSON.parse(line) as WorkerEnvelope;
    } catch {
      return;
    }

    if (envelope.type === "ready") {
      this.clearStartupTimer();
      this.startupResolve?.();
      this.startupResolve = undefined;
      this.startupReject = undefined;
      return;
    }

    if (typeof envelope.id !== "string") return;
    const pending = this.pendingRequests.get(envelope.id);
    if (!pending) return;
    this.pendingRequests.delete(envelope.id);
    clearTimeout(pending.timer);

    if (envelope.ok === true) {
      pending.resolve(envelope.result);
      return;
    }

    pending.reject(
      new Error(typeof envelope.error === "string" ? envelope.error : "Local worker request failed.")
    );
  }

  private handleUnexpectedExit(child: ChildProcessWithoutNullStreams, error: Error): void {
    if (this.child !== child) return;
    this.child = null;
    this.state = "failed";
    this.lastError = error.message;
    this.clearIdleTimer();
    this.clearStartupTimer();
    this.startupReject?.(error);
    this.startupResolve = undefined;
    this.startupReject = undefined;
    this.rejectPending(error);
  }

  private async sendCommand(command: "ping" | "personalize", payload: unknown): Promise<unknown> {
    const child = this.child;
    if (!child || this.state !== "ready") {
      throw new Error("Local personalization worker is not ready.");
    }

    const id = crypto.randomUUID();
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        child.kill("SIGKILL");
        reject(
          new Error(`Local personalization worker request timed out after ${this.requestTimeoutMs}ms.`)
        );
      }, this.requestTimeoutMs);
      timer.unref();

      this.pendingRequests.set(id, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify({ id, command, payload })}\n`, (error) => {
        if (!error) return;
        const pending = this.pendingRequests.get(id);
        if (!pending) return;
        this.pendingRequests.delete(id);
        clearTimeout(pending.timer);
        pending.reject(error);
      });
    });
  }

  private scheduleIdleSleep(): void {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      void this.serialize(() => this.stopWorker("idle_timeout"));
    }, this.idleTimeoutMs);
    this.idleTimer.unref();
  }

  private async stopWorker(reason: string): Promise<void> {
    this.clearIdleTimer();
    this.clearStartupTimer();
    const child = this.child;
    this.child = null;
    this.state = child ? "stopping" : "sleeping";
    this.lastStopReason = reason;
    this.checkpoint = undefined;
    this.checkpointFingerprint = undefined;
    this.startedAt = undefined;
    this.stdoutBuffer = "";
    this.stderrBuffer = "";
    this.startupReject?.(new Error(`Local personalization worker stopped: ${reason}.`));
    this.startupResolve = undefined;
    this.startupReject = undefined;
    this.rejectPending(new Error(`Local personalization worker stopped: ${reason}.`));

    if (child && child.exitCode === null) {
      await new Promise<void>((resolve) => {
        let settled = false;
        let forceTimer: NodeJS.Timeout;
        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimeout(forceTimer);
          resolve();
        };
        forceTimer = setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } finally {
            finish();
          }
        }, 1_000);
        forceTimer.unref();
        child.once("exit", finish);
        try {
          child.kill();
        } catch {
          finish();
        }
      });
    }

    this.state = "sleeping";
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
  }

  private clearStartupTimer(): void {
    if (this.startupTimer) clearTimeout(this.startupTimer);
    this.startupTimer = undefined;
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

export async function extractTurnPersonalizationWithLocalModel(args: {
  rootDir: string;
  registry: FileSystemModelRegistry;
  userMessage: string;
  projectionText?: string;
  selfModelDigestText?: string;
  timeoutMs?: number;
  pythonBin?: string;
  scriptPath?: string;
}): Promise<LocalTurnPersonalizationResult> {
  const worker = new ResidentPersonalizationWorker({
    rootDir: args.rootDir,
    registry: args.registry,
    requestTimeoutMs: args.timeoutMs,
    pythonBin: args.pythonBin,
    scriptPath: args.scriptPath
  });

  try {
    return await worker.personalize(args);
  } finally {
    await worker.shutdown();
  }
}

function parseTurnContextScriptPayload(
  value: unknown
): { turnContextHints: string[]; notes: string[] } | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as TurnContextScriptPayload;
  if (!Array.isArray(payload.turnContextHints)) return null;

  const turnContextHints = payload.turnContextHints
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);

  const notes = Array.isArray(payload.notes)
    ? payload.notes.filter((item): item is string => typeof item === "string")
    : [];

  return { turnContextHints, notes };
}

function checkpointKey(checkpoint: ModelCheckpointRecord): string {
  return [
    checkpoint.id,
    checkpoint.baseModel,
    resolveAdapterLoadPath(checkpoint.adapterPath ?? ""),
    checkpoint.createdAt
  ].join("::");
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}
