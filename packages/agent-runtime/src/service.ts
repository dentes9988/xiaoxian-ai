import {
  classifyConfirmationMode,
  reconcileMemory,
  type CognitionLogEntry,
  type CurrentProjection,
  type MemoryEvidence,
  type MemoryItem
} from "@98agent/memory-core";

import { buildRuntimeSystemPrompt } from "./prompts.js";
import {
  buildInternetEvidenceMessage,
  type InternetSource,
  type InternetToolExecutionResult,
  type InternetToolExecutor
} from "./internet-tools.js";
import {
  type CandidateMemoryDraft,
  type InternetToolRequest,
  type RuntimeMessage,
  type RuntimeTurnResult
} from "./schemas.js";

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
  internetToolExecutor?: InternetToolExecutor;
}): Promise<{
  result: RuntimeTurnResult;
  logEntry: CognitionLogEntry;
  memories: MemoryItem[];
  sources: InternetSource[];
  toolResults: InternetToolExecutionResult[];
}> {
  const occurredAt = new Date().toISOString();
  const sourceId = crypto.randomUUID();
  const systemPrompt = buildRuntimeSystemPrompt(
    args.projection,
    args.selfModelDigest,
    args.turnContextHints
  );
  const initialResult = await args.provider.run(args.messages, systemPrompt);
  const lastUserMessage = args.messages
    .slice()
    .reverse()
    .find((message) => message.role === "user")?.content ?? "";
  const inferredToolRequests = inferInternetToolRequests(lastUserMessage);
  const toolRequests =
    inferredToolRequests.length > 0
      ? inferredToolRequests
      : initialResult.toolRequests ?? [];
  const toolResults = args.internetToolExecutor
    ? await executeInternetToolRequests(args.internetToolExecutor, toolRequests)
    : [];
  const finalPass =
    toolResults.length > 0
      ? await args.provider.run(
          [
            ...args.messages,
            { role: "assistant", content: initialResult.reply },
            { role: "user", content: buildInternetEvidenceMessage(toolResults) }
          ],
          [
            systemPrompt,
            "This is the final answer pass. Use only the supplied internet evidence, keep toolRequests empty, and do not ask for another tool call."
          ].join("\n\n")
        )
      : undefined;
  const sources = collectInternetSources(toolResults);
  const rawResult: RuntimeTurnResult = finalPass
    ? {
        reply: groundReplyWithInternetSources(finalPass.reply, sources, lastUserMessage),
        candidateMemories: initialResult.candidateMemories,
        proposedActions:
          finalPass.proposedActions && finalPass.proposedActions.length > 0
            ? finalPass.proposedActions
            : initialResult.proposedActions,
        toolRequests: []
      }
    : initialResult;
  const result: RuntimeTurnResult = {
    ...rawResult,
    proposedActions: hasEarningActionIntent(lastUserMessage)
      ? rawResult.proposedActions
      : []
  };
  const candidateDrafts =
    initialResult.candidateMemories.length > 0
      ? initialResult.candidateMemories
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
    ...(toolResults.length > 0
      ? {
          internet: {
            requests: toolResults.map((toolResult) => ({
              kind: toolResult.request.kind,
              ...(toolResult.request.kind === "web_search"
                ? { query: toolResult.request.query }
                : { url: toolResult.request.url }),
              ok: toolResult.ok,
              errorCode: toolResult.errorCode
            })),
            sources
          }
        }
      : {}),
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

  return {
    result,
    logEntry,
    memories,
    sources,
    toolResults
  };
}

function groundReplyWithInternetSources(
  reply: string,
  sources: InternetSource[],
  userMessage: string
): string {
  if (sources.length === 0) return reply;
  const primarySource = sources[0];
  if (
    primarySource &&
    /(?:主页地址|官网地址|项目地址|网址|链接|\burl\b|homepage)/i.test(userMessage)
  ) {
    return [
      "根据联网结果，最相关来源是：",
      primarySource.title,
      primarySource.url
    ].join("\n");
  }
  const missingSources = sources
    .slice(0, 5)
    .filter((source) => !reply.includes(source.url));
  if (missingSources.length === 0) return reply;

  return [
    reply.trim(),
    "",
    "联网来源：",
    ...missingSources.map((source) => `- ${source.title}: ${source.url}`)
  ].join("\n");
}

async function executeInternetToolRequests(
  executor: InternetToolExecutor,
  requests: InternetToolRequest[]
): Promise<InternetToolExecutionResult[]> {
  const results: InternetToolExecutionResult[] = [];
  for (const request of requests.slice(0, 2)) {
    results.push(await executor.execute(request));
  }
  return results;
}

function collectInternetSources(results: InternetToolExecutionResult[]): InternetSource[] {
  const sources = new Map<string, InternetSource>();
  for (const result of results) {
    for (const source of result.sources) {
      if (!sources.has(source.url)) sources.set(source.url, source);
    }
  }
  return [...sources.values()];
}

function inferInternetToolRequests(message: string): InternetToolRequest[] {
  const publicUrl = message
    .match(/https?:\/\/[^\s<>{}"']+/i)?.[0]
    ?.replace(/[),.;!?，。！？）】》]+$/g, "");
  if (publicUrl && !containsSensitiveSearchMaterial(message.replace(publicUrl, ""))) {
    return [{ kind: "read_webpage", url: publicUrl }];
  }

  if (!/(?:联网|上网|搜索|搜一下|查一下|查询|查找|最新|新闻|当前|search|look\s*up|latest|today|web)/i.test(message)) {
    return [];
  }
  if (containsSensitiveSearchMaterial(message)) return [];

  const query = message
    .replace(/(?:请|帮我|麻烦)?(?:联网|上网|在线)?(?:搜索|搜一下|查一下|查询|查找|看看)/gi, " ")
    .replace(/\b(?:please|search|look\s*up|on\s+the\s+web)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
  return query.length >= 2 ? [{ kind: "web_search", query, maxResults: 5 }] : [];
}

function containsSensitiveSearchMaterial(value: string): boolean {
  return (
    /\bsk-[A-Za-z0-9_-]{12,}\b/.test(value) ||
    /(?:api[_ -]?key|password|secret|token|银行卡|身份证|密码|密钥)\s*[:=：]?\s*\S+/i.test(value) ||
    /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/.test(value) ||
    /\b\d{11,}\b/.test(value) ||
    /(?:出生日期|出生时间|家庭住址|住址|手机号|电话号码)/i.test(value)
  );
}

function hasEarningActionIntent(value: string): boolean {
  return /(?:赚钱|收入|现金流|收费|付费|客户|订单|发布服务|联系客户|购买|开户|转账|money|income|cash\s*flow|revenue|paid|customer|client|prospect|purchase|bank\s*account|transfer)/i.test(
    value
  );
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
