import type { CurrentProjection, LifeTrajectory, MemoryItem, ProjectionFacet } from "./types.js";

function buildFacet(type: MemoryItem["type"], memories: MemoryItem[]): ProjectionFacet {
  const recent = memories
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 3);

  return {
    label: type,
    summary: recent.map((item) => item.statement).join(" "),
    memoryIds: recent.map((item) => item.id),
    confidence:
      recent.reduce((sum, item) => sum + item.confidence, 0) / Math.max(recent.length, 1)
  };
}

export function buildCurrentProjection(userId: string, memories: MemoryItem[]): CurrentProjection {
  const active = memories.filter(
    (item) => item.status === "confirmed" || item.status === "pending_confirmation"
  );
  const grouped = new Map<MemoryItem["type"], MemoryItem[]>();
  for (const memory of active) {
    const bucket = grouped.get(memory.type) ?? [];
    bucket.push(memory);
    grouped.set(memory.type, bucket);
  }

  return {
    userId,
    generatedAt: new Date().toISOString(),
    facets: Array.from(grouped.entries()).map(([type, items]) => buildFacet(type, items)),
    activeMemoryIds: active.map((item) => item.id)
  };
}

export function buildLifeTrajectory(userId: string, memories: MemoryItem[]): LifeTrajectory {
  const grouped = new Map<string, MemoryItem[]>();
  for (const memory of memories) {
    const key = memory.timeWindow.start.slice(0, 7);
    const bucket = grouped.get(key) ?? [];
    bucket.push(memory);
    grouped.set(key, bucket);
  }

  const milestones = Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, items]) => ({
      period: { start: `${period}-01T00:00:00.000Z` },
      summary: items.map((item) => item.statement).join(" "),
      memoryIds: items.map((item) => item.id)
    }));

  return {
    userId,
    generatedAt: new Date().toISOString(),
    milestones
  };
}

