import {
  classifyConfirmationMode,
  reconcileMemory,
  type CognitionLogEntry,
  type CurrentProjection,
  type MemoryEvidence,
  type MemoryItem
} from "@98agent/memory-core";

import { buildRuntimeSystemPrompt } from "./prompts.js";
import { type CandidateMemoryDraft, type RuntimeMessage, type RuntimeTurnResult } from "./schemas.js";

export interface RuntimeProvider {
  run(messages: RuntimeMessage[], systemPrompt: string): Promise<RuntimeTurnResult>;
}

export function draftToMemory(
  draft: CandidateMemoryDraft,
  sourceId: string,
  occurredAt: string
): MemoryItem {
  const evidence: MemoryEvidence = {
    id: crypto.randomUUID(),
    kind: "observed_behavior",
    sourceId,
    recordedAt: occurredAt,
    confidence: draft.confidence
  };
  const confirmationMode = classifyConfirmationMode({
    impactScope: draft.impactScope,
    type: draft.type,
    confidence: draft.confidence
  });

  return {
    id: crypto.randomUUID(),
    type: draft.type,
    subject: draft.subject,
    statement: draft.statement,
    evidence: [evidence],
    sourceIds: [sourceId],
    timeWindow: { start: occurredAt },
    confidence: draft.confidence,
    weight: draft.confidence,
    status:
      confirmationMode === "hard_confirm"
        ? "pending_confirmation"
        : confirmationMode === "soft_confirm"
          ? "candidate"
          : "confirmed",
    impactScope: draft.impactScope,
    confirmationRequired: confirmationMode === "hard_confirm" || draft.confirmationRequired,
    conflictsWith: [],
    supersedes: [],
    createdAt: occurredAt,
    updatedAt: occurredAt
  };
}

export async function runRuntimeTurn(args: {
  provider: RuntimeProvider;
  messages: RuntimeMessage[];
  projection?: CurrentProjection;
  selfModelDigest?: string;
  existingMemories: MemoryItem[];
  turnContextHints?: string[];
}): Promise<{ result: RuntimeTurnResult; logEntry: CognitionLogEntry; memories: MemoryItem[] }> {
  const occurredAt = new Date().toISOString();
  const sourceId = crypto.randomUUID();
  const result = await args.provider.run(
    args.messages,
    buildRuntimeSystemPrompt(args.projection, args.selfModelDigest, args.turnContextHints)
  );
  const lastUserMessage = args.messages
    .slice()
    .reverse()
    .find((message) => message.role === "user")?.content ?? "";
  const candidateDrafts =
    result.candidateMemories.length > 0
      ? result.candidateMemories
      : buildFallbackCandidateMemories(lastUserMessage);

  const memories = candidateDrafts.map((draft) =>
    reconcileMemory(draftToMemory(draft, sourceId, occurredAt), args.existingMemories)
  );

  const logEntry: CognitionLogEntry = {
    id: sourceId,
    occurredAt,
    rawInteraction: {
      kind: "chat",
      input: args.messages.at(-1)?.content ?? "",
      reply: result.reply
    },
    candidateMemories: memories,
    decisionLog: memories.map((memory) => ({
      memoryId: memory.id,
      action:
        memory.status === "confirmed"
          ? "auto_accept"
          : memory.status === "pending_confirmation"
            ? "hard_confirm"
            : "soft_confirm",
      reason: "Generated from live runtime turn"
    }))
  };

  return { result, logEntry, memories };
}

function buildFallbackCandidateMemories(message: string): CandidateMemoryDraft[] {
  const drafts: CandidateMemoryDraft[] = [];

  if (/(赚钱|收入|cash|money|income|赚到钱)/i.test(message)) {
    drafts.push({
      type: "goal",
      subject: "user",
      statement: "User is actively seeking near-term cash flow improvement.",
      confidence: 0.78,
      impactScope: ["earning_advice", "identity_model"],
      confirmationRequired: true,
      rationale: "Detected explicit request about earning money soon."
    });
  }

  if (/(学习|成长|learn|growth|skill)/i.test(message)) {
    drafts.push({
      type: "goal",
      subject: "user",
      statement: "User is actively seeking directed growth and learning guidance.",
      confidence: 0.72,
      impactScope: ["growth_guidance", "identity_model"],
      confirmationRequired: true,
      rationale: "Detected explicit request about learning or growth."
    });
  }

  if (/(情感|表达|关系|谁说|emotion|relationship|talk to)/i.test(message)) {
    drafts.push({
      type: "relationship",
      subject: "user",
      statement: "User is seeking support about where to express emotions safely.",
      confidence: 0.7,
      impactScope: ["relationship_advice", "identity_model"],
      confirmationRequired: true,
      rationale: "Detected explicit request about emotional expression or relationships."
    });
  }

  return drafts;
}
