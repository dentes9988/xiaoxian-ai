import type { RuntimeMessage, RuntimeTurnResult } from "./schemas.js";
import type { RuntimeProvider } from "./service.js";

export type RuntimeFallbackReason =
  | "primary_auth_failed"
  | "primary_rate_limited"
  | "primary_timeout"
  | "primary_unavailable";

export class FallbackRuntimeProvider implements RuntimeProvider {
  private fallbackReason?: RuntimeFallbackReason;

  constructor(
    private readonly primary: RuntimeProvider,
    private readonly fallback: RuntimeProvider,
    private readonly onFallback?: (reason: RuntimeFallbackReason) => void
  ) {}

  async run(messages: RuntimeMessage[], systemPrompt: string): Promise<RuntimeTurnResult> {
    if (this.fallbackReason) {
      return this.fallback.run(messages, systemPrompt);
    }

    try {
      return await this.primary.run(messages, systemPrompt);
    } catch (primaryError) {
      this.fallbackReason = classifyRuntimeProviderError(primaryError);
      this.onFallback?.(this.fallbackReason);
      try {
        return await this.fallback.run(messages, systemPrompt);
      } catch (fallbackError) {
        throw new AggregateError(
          [primaryError, fallbackError],
          "Primary and fallback runtime providers failed.",
          { cause: fallbackError }
        );
      }
    }
  }
}

export function classifyRuntimeProviderError(error: unknown): RuntimeFallbackReason {
  const message = error instanceof Error ? error.message : String(error);
  if (/\b401\b|\b403\b|unauthorized|forbidden|api[ _-]?key/i.test(message)) {
    return "primary_auth_failed";
  }
  if (/\b429\b|rate[ _-]?limit|too many requests/i.test(message)) {
    return "primary_rate_limited";
  }
  if (/timeout|timed out|abort/i.test(message)) return "primary_timeout";
  return "primary_unavailable";
}
