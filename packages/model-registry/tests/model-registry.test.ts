import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { FileSystemModelRegistry, type ModelCheckpointRecord } from "../src/index.js";

describe("model registry", () => {
  it("preserves the active checkpoint when activation targets are invalid", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "xiaoxian-registry-"));
    const registry = new FileSystemModelRegistry(join(rootDir, "registry.json"));
    const active = checkpoint("active", "active");
    const failed = checkpoint("failed", "failed");
    await registry.save([active, failed]);

    try {
      await expect(registry.activate("missing")).rejects.toThrow("not found");
      await expect(registry.activate("failed")).rejects.toThrow("cannot be activated");
      expect((await registry.load()).filter((record) => record.status === "active")).toEqual([
        active
      ]);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});

function checkpoint(
  id: string,
  status: ModelCheckpointRecord["status"]
): ModelCheckpointRecord {
  return {
    id,
    baseModel: "fake-model",
    adapterPath: `/tmp/${id}`,
    createdAt: "2026-08-30T00:00:00.000Z",
    trainingMode: "mlx-lora",
    status,
    isolationMode: "adapter_only",
    trainingDataScope: "profile_cognition_and_skill_priors"
  };
}
