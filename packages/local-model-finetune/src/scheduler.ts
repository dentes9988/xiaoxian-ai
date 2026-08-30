import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type {
  FineTuneRunSummary,
  TrainingControlConfig,
  TrainingWindowConfig
} from "./index.js";

export interface NightlyTrainingSchedulerState {
  lastAttemptWindow?: string;
  lastAttemptAt?: string;
  lastResultStatus?: FineTuneRunSummary["status"] | "running" | "failed";
  lastCompletedAt?: string;
  lastError?: string;
}

export interface NightlyTrainingSchedulerStatus {
  running: boolean;
  intervalMs: number;
  persisted: NightlyTrainingSchedulerState;
}

export type NightlyTrainingTickResult =
  | { status: "disabled" | "outside_window" | "already_attempted" | "already_running" }
  | { status: "ran"; windowKey: string; result: FineTuneRunSummary }
  | { status: "failed"; windowKey: string; error: string };

export function getTrainingWindowKey(
  now: Date,
  window: TrainingWindowConfig
): string | null {
  const hour = now.getHours();
  if (window.startHourLocal === window.endHourLocal) return localDateKey(now);

  if (window.startHourLocal < window.endHourLocal) {
    return hour >= window.startHourLocal && hour < window.endHourLocal
      ? localDateKey(now)
      : null;
  }

  if (hour >= window.startHourLocal) return localDateKey(now);
  if (hour < window.endHourLocal) {
    const previousLocalDay = new Date(now);
    previousLocalDay.setDate(previousLocalDay.getDate() - 1);
    return localDateKey(previousLocalDay);
  }
  return null;
}

export class NightlyTrainingScheduler {
  private readonly intervalMs: number;
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly options: {
      statePath: string;
      loadConfig: () => Promise<TrainingControlConfig>;
      run: (now: Date) => Promise<FineTuneRunSummary>;
      intervalMs?: number;
    }
  ) {
    this.intervalMs = options.intervalMs ?? 60_000;
  }

  start(): void {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async getStatus(): Promise<NightlyTrainingSchedulerStatus> {
    return {
      running: this.running,
      intervalMs: this.intervalMs,
      persisted: await loadSchedulerState(this.options.statePath)
    };
  }

  async tick(now = new Date()): Promise<NightlyTrainingTickResult> {
    if (this.running) return { status: "already_running" };

    const config = await this.options.loadConfig();
    if (!config.enabled) return { status: "disabled" };
    const windowKey = getTrainingWindowKey(now, config.window);
    if (!windowKey) return { status: "outside_window" };

    const previous = await loadSchedulerState(this.options.statePath);
    if (previous.lastAttemptWindow === windowKey) {
      return { status: "already_attempted" };
    }

    this.running = true;
    await saveSchedulerState(this.options.statePath, {
      ...previous,
      lastAttemptWindow: windowKey,
      lastAttemptAt: now.toISOString(),
      lastResultStatus: "running",
      lastError: undefined
    });

    try {
      const result = await this.options.run(now);
      await saveSchedulerState(this.options.statePath, {
        lastAttemptWindow: windowKey,
        lastAttemptAt: now.toISOString(),
        lastResultStatus: result.status,
        lastCompletedAt: result.status === "completed" ? new Date().toISOString() : previous.lastCompletedAt,
        lastError: result.reason
      });
      return { status: "ran", windowKey, result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await saveSchedulerState(this.options.statePath, {
        lastAttemptWindow: windowKey,
        lastAttemptAt: now.toISOString(),
        lastResultStatus: "failed",
        lastCompletedAt: previous.lastCompletedAt,
        lastError: message
      });
      return { status: "failed", windowKey, error: message };
    } finally {
      this.running = false;
    }
  }
}

async function loadSchedulerState(path: string): Promise<NightlyTrainingSchedulerState> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as NightlyTrainingSchedulerState;
  } catch {
    return {};
  }
}

async function saveSchedulerState(
  path: string,
  state: NightlyTrainingSchedulerState
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2), "utf8");
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
