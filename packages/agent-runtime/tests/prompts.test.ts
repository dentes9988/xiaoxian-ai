import { describe, expect, it } from "vitest";

import { buildRuntimeSystemPrompt } from "../src/index.js";

describe("runtime prompts", () => {
  it("includes strict json and memory extraction guidance for fast chat models", () => {
    const prompt = buildRuntimeSystemPrompt();

    expect(prompt).toContain("deepseek-v4-flash");
    expect(prompt).toContain("Return strict JSON only.");
    expect(prompt).toContain("candidateMemories");
    expect(prompt).toContain("collect it naturally through the conversation");
    expect(prompt).toContain("Do not wrap JSON in markdown fences.");
    expect(prompt).toContain("Require explicit approval before publishing");
    expect(prompt).toContain("Never claim that money was earned");
  });

  it("includes the current projection when available", () => {
    const prompt = buildRuntimeSystemPrompt({
      userId: "default-user",
      generatedAt: "2026-06-22T00:00:00.000Z",
      activeMemoryIds: ["m1"],
      facets: [
        {
          label: "goal",
          summary: "User wants near-term cash flow improvement.",
          memoryIds: ["m1"],
          confidence: 0.8
        }
      ]
    });

    expect(prompt).toContain("Current self-model projection:");
    expect(prompt).toContain("- goal: User wants near-term cash flow improvement.");
  });

  it("includes the richer self-model digest when available", () => {
    const prompt = buildRuntimeSystemPrompt(undefined, "Stable facts: lives in Xi'an. Active goals: improve cash flow.");

    expect(prompt).toContain("Current self-model digest:");
    expect(prompt).toContain("Stable facts: lives in Xi'an. Active goals: improve cash flow.");
  });

  it("includes local personalized hints for the current turn when available", () => {
    const prompt = buildRuntimeSystemPrompt(
      undefined,
      undefined,
      ["User is seeking a low-pressure way to stabilize income this week."]
    );

    expect(prompt).toContain("Local personalized hints for this turn:");
    expect(prompt).toContain("User is seeking a low-pressure way to stabilize income this week.");
  });
});
