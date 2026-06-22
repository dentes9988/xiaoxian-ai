import { describe, expect, it } from "vitest";

import {
  buildDefaultTrainingControlConfig,
  estimateFastTuneIters,
  resolveTrainingModelCandidates,
  shouldTrainInWindow
} from "../src/index.js";

describe("local-model-finetune", () => {
  it("uses a fast MLX VibeThinker default config", () => {
    const config = buildDefaultTrainingControlConfig();
    expect(config.model).toBe("mlx-community/VibeThinker-3B-4bit");
    expect(config.maxDurationSeconds).toBe(300);
    expect(config.numLayers).toBe(4);
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
});
