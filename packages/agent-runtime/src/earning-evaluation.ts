import type { CurrentProjection } from "@98agent/memory-core";

import { buildRuntimeSystemPrompt } from "./prompts.js";
import type { RuntimeMessage, RuntimeTurnResult } from "./schemas.js";
import type { RuntimeProvider } from "./service.js";

export interface EarningEvaluationScenario {
  id: string;
  userMessage: string;
  projection?: CurrentProjection;
  selfModelDigest?: string;
  turnContextHints?: string[];
  personalSignals: string[];
}

export interface EarningResponseScore {
  executability: number;
  personalFit: number;
  total: number;
  evidence: string[];
}

export interface EarningComparisonResult {
  scenarioId: string;
  generic: { result: RuntimeTurnResult; score: EarningResponseScore };
  personalized: { result: RuntimeTurnResult; score: EarningResponseScore };
  delta: { executability: number; personalFit: number; total: number };
  winner: "generic" | "personalized" | "tie";
}

const EXECUTABILITY_CHECKS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: "time_bound", pattern: /(today|tomorrow|this week|24 hours|48 hours|今天|明天|本周|小时|两天)/i },
  { label: "concrete_action", pattern: /(contact|publish|list|draft|build|send|call|offer|联系|发布|列出|起草|制作|发送|报价)/i },
  { label: "measurable", pattern: /(\d+|price|rate|revenue|income|cash flow|价格|报价|收入|现金流)/i },
  { label: "market_test", pattern: /(customer|buyer|demand|validate|feedback|客户|买家|需求|验证|反馈)/i },
  { label: "deliverable", pattern: /(proposal|landing page|sample|portfolio|script|清单|方案|页面|样品|作品集|话术)/i }
];

export async function runEarningComparison(args: {
  provider: RuntimeProvider;
  scenario: EarningEvaluationScenario;
}): Promise<EarningComparisonResult> {
  const messages: RuntimeMessage[] = [{ role: "user", content: args.scenario.userMessage }];
  const genericResult = await args.provider.run(messages, buildGenericEarningSystemPrompt());
  const personalizedResult = await args.provider.run(
    messages,
    buildRuntimeSystemPrompt(
      args.scenario.projection,
      args.scenario.selfModelDigest,
      args.scenario.turnContextHints
    )
  );
  return compareEarningResponses(args.scenario, genericResult, personalizedResult);
}

export function compareEarningResponses(
  scenario: EarningEvaluationScenario,
  genericResult: RuntimeTurnResult,
  personalizedResult: RuntimeTurnResult
): EarningComparisonResult {
  const genericScore = scoreEarningResponse(genericResult.reply, scenario.personalSignals);
  const personalizedScore = scoreEarningResponse(
    personalizedResult.reply,
    scenario.personalSignals
  );
  const delta = {
    executability: personalizedScore.executability - genericScore.executability,
    personalFit: personalizedScore.personalFit - genericScore.personalFit,
    total: personalizedScore.total - genericScore.total
  };

  return {
    scenarioId: scenario.id,
    generic: { result: genericResult, score: genericScore },
    personalized: { result: personalizedResult, score: personalizedScore },
    delta,
    winner: delta.total > 0 ? "personalized" : delta.total < 0 ? "generic" : "tie"
  };
}

export function scoreEarningResponse(
  reply: string,
  personalSignals: string[]
): EarningResponseScore {
  const evidence: string[] = [];
  let executability = 0;
  for (const check of EXECUTABILITY_CHECKS) {
    if (!check.pattern.test(reply)) continue;
    executability += 1;
    evidence.push(check.label);
  }

  const normalizedReply = reply.toLocaleLowerCase();
  const normalizedSignals = [
    ...new Set(personalSignals.map((signal) => signal.trim().toLocaleLowerCase()).filter(Boolean))
  ];
  const matchedSignals = normalizedSignals.filter((signal) => normalizedReply.includes(signal));
  const personalFit =
    normalizedSignals.length === 0
      ? 0
      : Math.round((matchedSignals.length / normalizedSignals.length) * 5);
  evidence.push(...matchedSignals.map((signal) => `personal:${signal}`));

  return {
    executability,
    personalFit,
    total: executability + personalFit,
    evidence
  };
}

export function buildGenericEarningSystemPrompt(): string {
  return [
    "You are a generic earning-assistance baseline with no personal profile or memory.",
    "Answer the user's earning question with practical near-term actions.",
    "Do not claim that an external action was completed unless a tool result proves it.",
    "Return strict JSON only with this exact shape:",
    '{"reply":"string","candidateMemories":[]}'
  ].join("\n");
}
