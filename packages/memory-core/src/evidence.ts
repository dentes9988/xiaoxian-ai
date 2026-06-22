import type { EvidenceKind, MemoryEvidence, MemoryItem } from "./types.js";

const evidencePriority: Record<EvidenceKind, number> = {
  user_confirmation: 100,
  user_self_description: 80,
  observed_behavior: 60,
  imported_material: 40,
  external_context: 20,
  prior_system: 10
};

export function getEvidencePriority(kind: EvidenceKind): number {
  return evidencePriority[kind];
}

export function summarizeEvidenceStrength(evidence: MemoryEvidence[]): number {
  if (evidence.length === 0) return 0;
  const weighted = evidence.map((item) => getEvidencePriority(item.kind) * item.confidence);
  return weighted.reduce((sum, value) => sum + value, 0) / evidence.length;
}

export function compareMemoryAuthority(a: MemoryItem, b: MemoryItem): number {
  const aScore = summarizeEvidenceStrength(a.evidence) + a.weight + a.confidence;
  const bScore = summarizeEvidenceStrength(b.evidence) + b.weight + b.confidence;
  return aScore - bScore;
}

