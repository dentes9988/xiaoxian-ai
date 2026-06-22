import type { ImpactScope, MemoryItem } from "./types.js";

const highImpactScopes = new Set<ImpactScope>([
  "earning_advice",
  "relationship_advice",
  "growth_guidance",
  "identity_model"
]);

export type ConfirmationMode = "auto_accept" | "soft_confirm" | "hard_confirm";

export function classifyConfirmationMode(memory: Pick<MemoryItem, "impactScope" | "type" | "confidence">): ConfirmationMode {
  const touchesHighImpact = memory.impactScope.some((scope) => highImpactScopes.has(scope));
  if (touchesHighImpact && memory.confidence >= 0.6) {
    return "hard_confirm";
  }

  if (touchesHighImpact || memory.confidence >= 0.4) {
    return "soft_confirm";
  }

  return "auto_accept";
}

