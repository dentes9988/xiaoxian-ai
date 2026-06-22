import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FileSystemMemoryStore,
  classifyConfirmationMode,
  getEvidencePriority,
  reconcileMemory,
  type MemoryItem
} from "../src/index.js";

const tempDirs: string[] = [];

function sampleMemory(overrides: Partial<MemoryItem> = {}): MemoryItem {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    type: overrides.type ?? "preference",
    subject: "user",
    statement: overrides.statement ?? "Prefers short direct tasks.",
    evidence: overrides.evidence ?? [
      {
        id: crypto.randomUUID(),
        kind: "user_self_description",
        sourceId: "src-1",
        recordedAt: new Date().toISOString(),
        confidence: 0.9
      }
    ],
    sourceIds: ["src-1"],
    timeWindow: { start: new Date().toISOString() },
    confidence: overrides.confidence ?? 0.75,
    weight: overrides.weight ?? 0.5,
    status: overrides.status ?? "confirmed",
    impactScope: overrides.impactScope ?? ["task_execution"],
    confirmationRequired: overrides.confirmationRequired ?? false,
    conflictsWith: [],
    supersedes: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("memory core", () => {
  it("prioritizes confirmation evidence highest", () => {
    expect(getEvidencePriority("user_confirmation")).toBeGreaterThan(
      getEvidencePriority("prior_system")
    );
  });

  it("classifies high impact memories for hard confirmation", () => {
    const mode = classifyConfirmationMode({
      impactScope: ["identity_model"],
      type: "goal",
      confidence: 0.8
    });
    expect(mode).toBe("hard_confirm");
  });

  it("reconciles conflicts by linking superseded memories", () => {
    const older = sampleMemory({ statement: "Prefers solo work." });
    const newer = reconcileMemory(
      sampleMemory({
        statement: "Prefers collaborative work.",
        evidence: [
          {
            id: crypto.randomUUID(),
            kind: "user_confirmation",
            sourceId: "src-2",
            recordedAt: new Date().toISOString(),
            confidence: 1
          }
        ]
      }),
      [older]
    );
    expect(newer.conflictsWith).toContain(older.id);
    expect(newer.supersedes).toContain(older.id);
  });

  it("persists memories and derives projections", async () => {
    const dir = await mkdtemp(join(tmpdir(), "98agent-memory-"));
    tempDirs.push(dir);
    const store = new FileSystemMemoryStore(dir, "default-user");
    await store.upsertMemory(sampleMemory());

    const snapshot = await store.getSnapshot();
    expect(snapshot.memories).toHaveLength(1);
    expect(snapshot.currentProjection?.activeMemoryIds).toHaveLength(1);
    expect(snapshot.lifeTrajectory?.milestones.length).toBeGreaterThan(0);
  });

  it("lists recent chat history and paginates older messages", async () => {
    const dir = await mkdtemp(join(tmpdir(), "98agent-memory-"));
    tempDirs.push(dir);
    const store = new FileSystemMemoryStore(dir, "default-user");

    await store.appendChatHistory(
      Array.from({ length: 5 }, (_, index) => ({
        id: `msg-${index + 1}`,
        role: index % 2 === 0 ? "user" : "assistant",
        content: `message-${index + 1}`,
        timestamp: new Date(Date.UTC(2026, 5, 22, 1, index, 0)).toISOString()
      }))
    );

    const latest = await store.listChatHistory({ limit: 3 });
    expect(latest.messages.map((message) => message.id)).toEqual(["msg-3", "msg-4", "msg-5"]);
    expect(latest.hasMore).toBe(true);

    const older = await store.listChatHistory({ limit: 2, beforeId: "msg-3" });
    expect(older.messages.map((message) => message.id)).toEqual(["msg-1", "msg-2"]);
    expect(older.hasMore).toBe(false);
  });
});
