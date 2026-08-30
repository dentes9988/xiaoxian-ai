import { describe, expect, it } from "vitest";

import { runRuntimeTurn, type RuntimeProvider } from "../src/index.js";

describe("runtime service", () => {
  it("builds cognition logs and candidate memories from provider output", async () => {
    const provider: RuntimeProvider = {
      async run() {
        return {
          reply: "Try packaging your strongest consulting offer first.",
          candidateMemories: [
            {
              type: "goal",
              subject: "user",
              statement: "Wants short-term income now.",
              confidence: 0.8,
              impactScope: ["earning_advice"],
              confirmationRequired: true,
              rationale: "User explicitly asked for money-first help."
            }
          ]
        };
      }
    };

    const turn = await runRuntimeTurn({
      provider,
      messages: [{ role: "user", content: "I need to make money this week." }],
      existingMemories: []
    });

    expect(turn.result.reply).toContain("strongest consulting offer");
    expect(turn.memories).toHaveLength(1);
    expect(turn.logEntry.candidateMemories).toHaveLength(1);
  });

  it("falls back to heuristic candidate memories when the provider returns none", async () => {
    const provider: RuntimeProvider = {
      async run() {
        return {
          reply: "Try the fastest route to near-term cash flow first.",
          candidateMemories: []
        };
      }
    };

    const turn = await runRuntimeTurn({
      provider,
      messages: [{ role: "user", content: "我这周想赶紧赚钱。" }],
      existingMemories: []
    });

    expect(turn.memories).toHaveLength(1);
    expect(turn.memories[0]?.impactScope).toContain("earning_advice");
  });

  it("passes local turn context hints into the runtime prompt without changing the reply flow", async () => {
    let capturedSystemPrompt = "";
    const provider: RuntimeProvider = {
      async run(_messages, systemPrompt) {
        capturedSystemPrompt = systemPrompt;
        return {
          reply: "Keep focusing on short-term income first.",
          candidateMemories: [
            {
              type: "goal",
              subject: "user",
              statement: "User wants near-term cash flow improvement.",
              confidence: 0.82,
              impactScope: ["earning_advice", "identity_model"],
              confirmationRequired: true,
              rationale: "The user explicitly prioritized making money soon."
            },
            {
              type: "trait",
              subject: "user",
              statement: "User is definitely impatient.",
              confidence: 0.54,
              impactScope: ["identity_model"],
              confirmationRequired: true,
              rationale: "Weak inference from urgency."
            }
          ]
        };
      }
    };

    const turn = await runRuntimeTurn({
      provider,
      messages: [{ role: "user", content: "我最近先想把现金流稳住。" }],
      existingMemories: [],
      turnContextHints: ["The user currently prioritizes stability and near-term cash flow."]
    });

    expect(turn.result.reply).toBe("Keep focusing on short-term income first.");
    expect(turn.memories).toHaveLength(2);
    expect(capturedSystemPrompt).toContain("Local personalized hints for this turn:");
    expect(capturedSystemPrompt).toContain("The user currently prioritizes stability and near-term cash flow.");
  });
});
