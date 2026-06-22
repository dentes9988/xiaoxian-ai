import { compareMemoryAuthority } from "./evidence.js";
import type { MemoryItem } from "./types.js";

export function detectConflicts(candidate: MemoryItem, existing: MemoryItem[]): MemoryItem[] {
  return existing.filter(
    (item) =>
      item.subject === candidate.subject &&
      item.type === candidate.type &&
      item.id !== candidate.id &&
      item.statement !== candidate.statement
  );
}

export function reconcileMemory(candidate: MemoryItem, existing: MemoryItem[]): MemoryItem {
  const conflicts = detectConflicts(candidate, existing);
  candidate.conflictsWith = conflicts.map((item) => item.id);

  const stronger = conflicts.filter((item) => compareMemoryAuthority(candidate, item) > 0);
  candidate.supersedes = stronger.map((item) => item.id);

  return candidate;
}

