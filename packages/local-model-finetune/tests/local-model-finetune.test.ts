import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { FileSystemModelRegistry } from "@98agent/model-registry";

import {
  assessPersonalizationHints,
  buildDefaultTrainingControlConfig,
  estimateFastTuneIters,
  getTrainingWindowKey,
  isDefaultMlxTrainingPlatformSupported,
  loadTrainingControlConfig,
  NightlyTrainingScheduler,
  ResidentPersonalizationWorker,
  resolveAdapterLoadPath,
  resolveDefaultTrainingPythonBin,
  selectPreferredPersonalizationCheckpoint,
  resolveTrainingModelCandidates,
  saveTrainingControlConfig,
  shouldTrainInWindow
} from "../src/index.js";

describe("local-model-finetune", () => {
  it("uses a fast MLX VibeThinker default config", () => {
    const config = buildDefaultTrainingControlConfig();
    expect(config.model).toBe("mlx-community/VibeThinker-3B-4bit");
    expect(config.maxDurationSeconds).toBe(300);
    expect(config.numLayers).toBe(4);
  });

  it("enables the verified MLX training path only on Apple silicon", () => {
    expect(isDefaultMlxTrainingPlatformSupported("darwin", "arm64")).toBe(true);
    expect(isDefaultMlxTrainingPlatformSupported("win32", "x64")).toBe(false);
    expect(isDefaultMlxTrainingPlatformSupported("linux", "x64")).toBe(false);
  });

  it("uses the project virtual environment for training subprocesses", () => {
    expect(resolveDefaultTrainingPythonBin("/project", "darwin")).toBe(
      "/project/.venv/bin/python"
    );
    expect(resolveDefaultTrainingPythonBin("C:\\project", "win32")).toContain(
      ".venv/Scripts/python.exe"
    );
  });

  it("handles overnight training windows", () => {
    expect(
      shouldTrainInWindow(new Date("2026-06-22T02:00:00+08:00"), {
        startHourLocal: 1,
        endHourLocal: 6
      })
    ).toBe(true);
    expect(
      shouldTrainInWindow(new Date("2026-06-22T09:00:00+08:00"), {
        startHourLocal: 1,
        endHourLocal: 6
      })
    ).toBe(false);
    expect(
      shouldTrainInWindow(new Date("2026-06-22T23:00:00+08:00"), {
        startHourLocal: 22,
        endHourLocal: 3
      })
    ).toBe(true);
  });

  it("keeps iteration counts bounded for fast local loops", () => {
    expect(estimateFastTuneIters({ exampleCount: 5, maxDurationSeconds: 90 })).toBeLessThanOrEqual(12);
    expect(estimateFastTuneIters({ exampleCount: 40, maxDurationSeconds: 300 })).toBeLessThanOrEqual(28);
    expect(estimateFastTuneIters({ exampleCount: 100, maxDurationSeconds: 600 })).toBeLessThanOrEqual(48);
  });

  it("rejects degenerate adapters before activation", () => {
    expect(assessPersonalizationHints(["!!!!!!!!!!!!!!!!!!!!!!!!"])).toEqual({
      status: "failed",
      hintCount: 0,
      reason: "The trained adapter did not produce at least two distinct usable hints."
    });
    expect(
      assessPersonalizationHints([
        "Prioritize a reversible first step.",
        "Preserve autonomy while testing demand."
      ])
    ).toEqual({ status: "passed", hintCount: 2 });
  });

  it("tries the paired VibeThinker candidate when the configured variant is unavailable", () => {
    expect(resolveTrainingModelCandidates("mlx-community/VibeThinker-3B-4bit")).toEqual([
      "mlx-community/VibeThinker-3B-4bit",
      "mlx-community/VibeThinker-3B"
    ]);
    expect(resolveTrainingModelCandidates("mlx-community/VibeThinker-3B")).toEqual([
      "mlx-community/VibeThinker-3B",
      "mlx-community/VibeThinker-3B-4bit"
    ]);
  });

  it("prefers an active adapter for local memory review", () => {
    expect(
      selectPreferredPersonalizationCheckpoint([
        {
          id: "older-ready",
          baseModel: "mlx-community/VibeThinker-3B-4bit",
          adapterPath: "/tmp/ready",
          createdAt: "2026-06-22T08:00:00.000Z",
          trainingMode: "mlx-lora",
          status: "ready",
          isolationMode: "adapter_only",
          trainingDataScope: "profile_cognition_and_skill_priors"
        },
        {
          id: "active",
          baseModel: "mlx-community/VibeThinker-3B-4bit",
          adapterPath: "/tmp/active",
          createdAt: "2026-06-21T08:00:00.000Z",
          trainingMode: "mlx-lora",
          status: "active",
          isolationMode: "adapter_only",
          trainingDataScope: "profile_cognition_and_skill_priors"
        }
      ])?.id
    ).toBe("active");
  });

  it("falls back to the newest ready adapter when none are active", () => {
    expect(
      selectPreferredPersonalizationCheckpoint([
        {
          id: "older-ready",
          baseModel: "mlx-community/VibeThinker-3B-4bit",
          adapterPath: "/tmp/older",
          createdAt: "2026-06-21T08:00:00.000Z",
          trainingMode: "mlx-lora",
          status: "ready",
          isolationMode: "adapter_only",
          trainingDataScope: "profile_cognition_and_skill_priors"
        },
        {
          id: "newer-ready",
          baseModel: "mlx-community/VibeThinker-3B-4bit",
          adapterPath: "/tmp/newer",
          createdAt: "2026-06-22T08:00:00.000Z",
          trainingMode: "mlx-lora",
          status: "ready",
          isolationMode: "adapter_only",
          trainingDataScope: "profile_cognition_and_skill_priors"
        }
      ])?.id
    ).toBe("newer-ready");
  });

  it("uses the adapter directory when the registry stores a safetensors file path", () => {
    expect(
      resolveAdapterLoadPath(
        "/tmp/xiaoxian-ai/data/checkpoints/2026-06-22T13-17-41-856Z/adapters.safetensors"
      )
    ).toBe(
      "/tmp/xiaoxian-ai/data/checkpoints/2026-06-22T13-17-41-856Z"
    );
  });

  it("reuses one resident worker and sleeps after the idle timeout", async () => {
    const fixture = await createResidentWorkerFixture();
    const worker = new ResidentPersonalizationWorker({
      rootDir: fixture.rootDir,
      registry: fixture.registry,
      pythonBin: process.execPath,
      scriptPath: fixture.workerScriptPath,
      idleTimeoutMs: 40,
      requestTimeoutMs: 1_000,
      startupTimeoutMs: 1_000
    });

    try {
      const first = await worker.personalize({ userMessage: "first" });
      const second = await worker.personalize({ userMessage: "second" });
      expect(first.status).toBe("used");
      expect(second.status).toBe("used");
      expect(first.turnContextHints[0]).toBe(second.turnContextHints[0]);
      expect(worker.getStatus().state).toBe("ready");

      await vi.waitFor(() => expect(worker.getStatus().state).toBe("sleeping"), {
        timeout: 2_000,
        interval: 20
      });
      expect(worker.getStatus().lastStopReason).toBe("idle_timeout");
    } finally {
      await worker.shutdown();
      await rm(fixture.rootDir, { recursive: true, force: true });
    }
  });

  it("reloads cleanly when a different adapter becomes active", async () => {
    const fixture = await createResidentWorkerFixture();
    const worker = new ResidentPersonalizationWorker({
      rootDir: fixture.rootDir,
      registry: fixture.registry,
      pythonBin: process.execPath,
      scriptPath: fixture.workerScriptPath,
      idleTimeoutMs: 5_000,
      requestTimeoutMs: 1_000,
      startupTimeoutMs: 1_000
    });

    try {
      const first = await worker.personalize({ userMessage: "first" });
      await fixture.registry.add({
        id: "checkpoint-b",
        baseModel: "fake-model",
        adapterPath: join(fixture.rootDir, "adapter-b"),
        createdAt: "2026-06-23T00:00:00.000Z",
        trainingMode: "mlx-lora",
        status: "ready",
        isolationMode: "adapter_only",
        trainingDataScope: "profile_cognition_and_skill_priors"
      });
      await fixture.registry.activate("checkpoint-b");

      const second = await worker.personalize({ userMessage: "second" });
      expect(first.turnContextHints).toContain(`adapter:${join(fixture.rootDir, "adapter-a")}`);
      expect(second.turnContextHints).toContain(`adapter:${join(fixture.rootDir, "adapter-b")}`);
      expect(second.checkpoint?.id).toBe("checkpoint-b");
      expect((await worker.healthCheck()).responsive).toBe(true);
    } finally {
      await worker.shutdown();
      await rm(fixture.rootDir, { recursive: true, force: true });
    }
  });

  it("restarts once when the resident worker crashes during a request", async () => {
    const fixture = await createResidentWorkerFixture();
    const worker = new ResidentPersonalizationWorker({
      rootDir: fixture.rootDir,
      registry: fixture.registry,
      pythonBin: process.execPath,
      scriptPath: fixture.workerScriptPath,
      idleTimeoutMs: 5_000,
      requestTimeoutMs: 1_000,
      startupTimeoutMs: 1_000
    });

    try {
      const result = await worker.personalize({ userMessage: "crash-once" });
      expect(result.status).toBe("used");
      expect(result.turnContextHints).toHaveLength(2);
      expect(worker.getStatus().restartCount).toBe(1);
    } finally {
      await worker.shutdown();
      await rm(fixture.rootDir, { recursive: true, force: true });
    }
  });

  it("maps overnight training windows to one stable attempt key", () => {
    const window = { startHourLocal: 22, endHourLocal: 3 };
    expect(getTrainingWindowKey(new Date(2026, 5, 22, 23), window)).toBe("2026-06-22");
    expect(getTrainingWindowKey(new Date(2026, 5, 23, 2), window)).toBe("2026-06-22");
    expect(getTrainingWindowKey(new Date(2026, 5, 23, 12), window)).toBeNull();
  });

  it("runs nightly training once per configured rest window", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "xiaoxian-scheduler-"));
    const configPath = join(rootDir, "training-config.json");
    const statePath = join(rootDir, "training-scheduler-state.json");
    await saveTrainingControlConfig(configPath, {
      ...buildDefaultTrainingControlConfig(),
      window: { startHourLocal: 22, endHourLocal: 3 }
    });
    let runCount = 0;
    const scheduler = new NightlyTrainingScheduler({
      statePath,
      loadConfig: () => loadTrainingControlConfig(configPath),
      run: async () => {
        runCount += 1;
        return { status: "completed" };
      }
    });

    try {
      const first = await scheduler.tick(new Date(2026, 5, 22, 23));
      const second = await scheduler.tick(new Date(2026, 5, 23, 2));
      expect(first.status).toBe("ran");
      expect(second.status).toBe("already_attempted");
      expect(runCount).toBe(1);
      expect((await scheduler.getStatus()).persisted.lastResultStatus).toBe("completed");
    } finally {
      scheduler.stop();
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});

async function createResidentWorkerFixture(): Promise<{
  rootDir: string;
  registry: FileSystemModelRegistry;
  workerScriptPath: string;
}> {
  const rootDir = await mkdtemp(join(tmpdir(), "xiaoxian-worker-"));
  const workerScriptPath = join(rootDir, "fake-worker.mjs");
  const registry = new FileSystemModelRegistry(join(rootDir, "model-registry.json"));
  await registry.add({
    id: "checkpoint-a",
    baseModel: "fake-model",
    adapterPath: join(rootDir, "adapter-a"),
    createdAt: "2026-06-22T00:00:00.000Z",
    trainingMode: "mlx-lora",
    status: "active",
    isolationMode: "adapter_only",
    trainingDataScope: "profile_cognition_and_skill_priors"
  });

  await writeFile(
    workerScriptPath,
    [
      "import { existsSync, writeFileSync } from 'node:fs';",
      "const adapterFlag = process.argv.indexOf('--adapter-path');",
      "const adapter = process.argv[adapterFlag + 1];",
      "const crashMarker = new URL('./crash-once.marker', import.meta.url);",
      "const respond = (value) => process.stdout.write(JSON.stringify(value) + '\\n');",
      "respond({ type: 'ready' });",
      "let buffer = '';",
      "process.stdin.setEncoding('utf8');",
      "process.stdin.on('data', (chunk) => {",
      "  buffer += chunk;",
      "  let newline = buffer.indexOf('\\n');",
      "  while (newline >= 0) {",
      "    const line = buffer.slice(0, newline).trim();",
      "    buffer = buffer.slice(newline + 1);",
      "    if (line) {",
      "      const request = JSON.parse(line);",
      "      if (request.command === 'personalize' && request.payload?.userMessage === 'crash-once' && !existsSync(crashMarker)) {",
      "        writeFileSync(crashMarker, 'crashed', 'utf8');",
      "        process.exit(9);",
      "      }",
      "      const result = request.command === 'ping'",
      "        ? { status: 'ready' }",
      "        : { turnContextHints: ['pid:' + process.pid, 'adapter:' + adapter], notes: ['fake_worker'] };",
      "      respond({ id: request.id, ok: true, result });",
      "    }",
      "    newline = buffer.indexOf('\\n');",
      "  }",
      "});"
    ].join("\n"),
    "utf8"
  );

  return { rootDir, registry, workerScriptPath };
}
