import { describe, expect, it } from "vitest";

import {
  runRuntimeTurn,
  type InternetToolExecutor,
  type RuntimeProvider
} from "../src/index.js";

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

  it("uses at most two model passes and keeps web evidence out of candidate memories", async () => {
    const prompts: string[] = [];
    const provider: RuntimeProvider = {
      async run(_messages, systemPrompt) {
        prompts.push(systemPrompt);
        if (prompts.length === 1) {
          return {
            reply: "我先查一下公开信息。",
            candidateMemories: [
              {
                type: "preference",
                subject: "user",
                statement: "User wants sourced internet answers.",
                confidence: 0.84,
                impactScope: ["conversation"],
                confirmationRequired: false,
                rationale: "The user explicitly requested a web search."
              }
            ],
            toolRequests: [
              { kind: "web_search", query: "xiaoxian AI GitHub", maxResults: 3 }
            ]
          };
        }

        return {
          reply: "项目公开仓库可在 https://github.com/dentes9988/xiaoxian-ai 查看。",
          candidateMemories: [
            {
              type: "observation",
              subject: "internet",
              statement: "The repository is public.",
              confidence: 0.9,
              impactScope: ["conversation"],
              confirmationRequired: false,
              rationale: "Found on the web."
            }
          ],
          toolRequests: [{ kind: "web_search", query: "another search" }]
        };
      }
    };
    const internetToolExecutor: InternetToolExecutor = {
      async execute(request) {
        return {
          request,
          ok: true,
          sources: [
            {
              title: "xiaoxian AI",
              url: "https://github.com/dentes9988/xiaoxian-ai"
            }
          ],
          content: "A local-first personal assistant."
        };
      }
    };

    const turn = await runRuntimeTurn({
      provider,
      internetToolExecutor,
      messages: [{ role: "user", content: "请联网搜索 xiaoxian AI 的 GitHub，并给我项目地址。" }],
      existingMemories: []
    });

    expect(prompts).toHaveLength(2);
    expect(turn.result.toolRequests).toEqual([]);
    expect(turn.result.reply).toBe(
      "根据联网结果，最相关来源是：\nxiaoxian AI\nhttps://github.com/dentes9988/xiaoxian-ai"
    );
    expect(turn.memories).toHaveLength(1);
    expect(turn.memories[0]?.statement).toBe("User wants sourced internet answers.");
    expect(turn.sources).toEqual([
      {
        title: "xiaoxian AI",
        url: "https://github.com/dentes9988/xiaoxian-ai"
      }
    ]);
    expect(turn.logEntry.internet?.requests).toHaveLength(1);
  });

  it("derives a privacy-checked search request when a small local model omits it", async () => {
    let calls = 0;
    const provider: RuntimeProvider = {
      async run() {
        calls += 1;
        return {
          reply: calls === 1 ? "我来查。" : "已经根据公开来源回答。",
          candidateMemories: [],
          toolRequests: []
        };
      }
    };
    const seenQueries: string[] = [];
    const internetToolExecutor: InternetToolExecutor = {
      async execute(request) {
        if (request.kind !== "web_search") throw new Error("Unexpected tool kind");
        seenQueries.push(request.query);
        return {
          request,
          ok: true,
          sources: [{ title: "Result", url: "https://example.com/" }],
          content: "Current public information."
        };
      }
    };

    await runRuntimeTurn({
      provider,
      internetToolExecutor,
      messages: [{ role: "user", content: "帮我联网搜索今天的 AI 新闻" }],
      existingMemories: []
    });

    expect(calls).toBe(2);
    expect(seenQueries).toEqual(["今天的 AI 新闻"]);
  });

  it("drops copied earning actions when the user did not ask about earning", async () => {
    const provider: RuntimeProvider = {
      async run() {
        return {
          reply: "Here is the requested project information.",
          candidateMemories: [],
          proposedActions: [
            {
              kind: "publish_offer",
              title: "Copied example action",
              description: "This was not requested by the user.",
              rationale: "A small model copied a prompt example.",
              successMetric: "None",
              estimatedCostCny: 0
            }
          ]
        };
      }
    };

    const turn = await runRuntimeTurn({
      provider,
      messages: [{ role: "user", content: "解释这个 GitHub 项目的结构。" }],
      existingMemories: []
    });

    expect(turn.result.proposedActions).toEqual([]);
  });
});
