import { runtimeTurnResultSchema, type RuntimeMessage, type RuntimeTurnResult } from "./schemas.js";

export interface OllamaRuntimeOptions {
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
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

function extractJsonPayload(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(content.slice(start, end + 1));
    }
    throw new Error("No JSON object found in model response");
  }
}

function normalizeRuntimeTurnResult(content: string): RuntimeTurnResult {
  const payload = extractJsonPayload(content) as Record<string, unknown>;
  const reply =
    typeof payload.reply === "string"
      ? payload.reply
      : typeof payload.answer === "string"
        ? payload.answer
        : typeof payload.message === "string"
          ? payload.message
          : content;

  const candidateMemories = Array.isArray(payload.candidateMemories)
    ? payload.candidateMemories
    : Array.isArray(payload.memoryCandidates)
      ? payload.memoryCandidates
      : [];

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
