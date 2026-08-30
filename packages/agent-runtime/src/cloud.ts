import {
  candidateMemorySchema,
  runtimeTurnResultSchema,
  type RuntimeMessage,
  type RuntimeTurnResult
} from "./schemas.js";
import { extractJsonPayload } from "./json.js";

export interface OpenAICompatibleRuntimeOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs?: number;
}

export class OpenAICompatibleRuntimeClient {
  constructor(private readonly options: OpenAICompatibleRuntimeOptions) {}

  async run(messages: RuntimeMessage[], systemPrompt: string): Promise<RuntimeTurnResult> {
    const response = await fetch(buildChatCompletionsUrl(this.options.baseUrl), {
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 20000),
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.options.apiKey}`
      },
      body: JSON.stringify({
        model: this.options.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: systemPrompt }, ...messages]
      })
    });

    if (!response.ok) {
      throw new Error(`Cloud chat failed with ${response.status}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Cloud response was missing assistant content");
    }

    return normalizeCloudTurnResult(content);
  }
}

function buildChatCompletionsUrl(baseUrl: string): string {
  const normalized = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return `${normalized}/v1/chat/completions`;
}

function normalizeCloudTurnResult(content: string): RuntimeTurnResult {
  const payload = extractJsonPayload(content);
  const reply = deriveReply(payload, content);
  const candidateMemories = deriveCandidateMemories(payload);

  return runtimeTurnResultSchema.parse({
    reply: sanitizeReply(reply),
    candidateMemories
  });
}

function sanitizeReply(reply: string): string {
  return reply
    .split(/(?:```json|#JSON Output:|candidateMemories)/i)[0]
    .replace(/\s+[}\]`"”]+$/g, "")
    .trim();
}

function deriveReply(payload: unknown, rawContent: string): string {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (typeof record.reply === "string") return record.reply;
    if (typeof record.answer === "string") return record.answer;
    if (typeof record.message === "string") return record.message;
  }

  const replyMatch = rawContent.match(/"reply"\s*:\s*"((?:\\.|[^"\\])*)"/s);
  if (replyMatch?.[1]) {
    return decodeJsonString(replyMatch[1]);
  }

  return sanitizeReply(rawContent);
}

function deriveCandidateMemories(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  const rawItems = Array.isArray(record.candidateMemories)
    ? record.candidateMemories
    : Array.isArray(record.memoryCandidates)
      ? record.memoryCandidates
      : [];

  return rawItems
    .map((item) => candidateMemorySchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data);
}

function decodeJsonString(value: string): string {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return value
      .replace(/\\"/g, '"')
      .replace(/\\n/g, "\n")
      .replace(/\\\\/g, "\\");
  }
}
