import { runtimeTurnResultSchema, type RuntimeMessage, type RuntimeTurnResult } from "./schemas.js";
import { extractJsonPayload } from "./json.js";
import { parseEarningActionProposals } from "./earning-actions.js";

export interface OllamaRuntimeOptions {
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
  keepAlive?: string;
}

export class OllamaRuntimeClient {
  constructor(private readonly options: OllamaRuntimeOptions = {}) {}

  async run(messages: RuntimeMessage[], systemPrompt: string): Promise<RuntimeTurnResult> {
    const response = await fetch(`${this.options.baseUrl ?? "http://127.0.0.1:11434"}/api/chat`, {
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 15000),
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.options.model ?? "NitrAI/VibeThinker-3B:latest",
        stream: false,
        format: "json",
        think: false,
        keep_alive: this.options.keepAlive ?? "10m",
        options: {
          temperature: 0.2,
          num_predict: this.options.maxOutputTokens ?? 768
        },
        messages: [{ role: "system", content: systemPrompt }, ...messages]
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama chat failed with ${response.status}`);
    }

    const payload = (await response.json()) as { message?: { content?: string } };
    const content = payload.message?.content;
    if (!content) {
      throw new Error("Ollama response was missing JSON content");
    }

    return normalizeRuntimeTurnResult(content);
  }
}

function normalizeRuntimeTurnResult(content: string): RuntimeTurnResult {
  const payload = extractJsonPayload(content);
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const reply =
    typeof record.reply === "string"
      ? record.reply
      : typeof record.answer === "string"
        ? record.answer
        : typeof record.message === "string"
          ? record.message
          : content;

  const candidateMemories = Array.isArray(record.candidateMemories)
    ? record.candidateMemories
    : Array.isArray(record.memoryCandidates)
      ? record.memoryCandidates
      : [];

  return runtimeTurnResultSchema.parse({
    reply: sanitizeReply(reply),
    candidateMemories,
    proposedActions: parseEarningActionProposals(record.proposedActions)
  });
}

function sanitizeReply(reply: string): string {
  return reply
    .split(/(?:```json|#JSON Output:|candidateMemories)/i)[0]
    .replace(/\s+[}\]`"”]+$/g, "")
    .trim();
}
