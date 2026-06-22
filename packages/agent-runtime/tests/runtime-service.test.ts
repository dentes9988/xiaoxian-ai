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
});
