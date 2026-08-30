import { describe, expect, it } from "vitest";

import {
  runEarningComparison,
  scoreEarningResponse,
  type RuntimeProvider
} from "../src/index.js";

describe("earning evaluation", () => {
  it("scores concrete actions separately from personal fit", () => {
    const score = scoreEarningResponse(
      "Today draft a consulting proposal, set a price, and contact 5 customers to validate demand.",
      ["autonomy", "consulting"]
    );

    expect(score.executability).toBe(5);
    expect(score.personalFit).toBe(3);
    expect(score.evidence).toContain("market_test");
    expect(score.evidence).toContain("personal:consulting");
  });

  it("runs the same earning scenario against generic and personalized prompts", async () => {
    const observedMessages: string[] = [];
    const provider: RuntimeProvider = {
      async run(messages, systemPrompt) {
        observedMessages.push(messages[0]?.content ?? "");
        const generic = systemPrompt.includes("generic earning-assistance baseline");
        return {
          reply: generic
            ? "Today list 3 services, set a price, and contact 5 customers to validate demand."
            : "Today draft 3 consulting offers, preserve autonomy, and contact 5 customers to validate demand before committing.",
          candidateMemories: []
        };
      }
    };

    const comparison = await runEarningComparison({
      provider,
      scenario: {
        id: "cash-flow-autonomy",
        userMessage: "What should I do this week to make money?",
        selfModelDigest: "The user values autonomy and has consulting experience.",
        personalSignals: ["autonomy", "consulting"]
      }
    });

    expect(observedMessages).toEqual([
      "What should I do this week to make money?",
      "What should I do this week to make money?"
    ]);
    expect(comparison.personalized.score.personalFit).toBe(5);
    expect(comparison.generic.score.personalFit).toBe(0);
    expect(comparison.winner).toBe("personalized");
  });
});
