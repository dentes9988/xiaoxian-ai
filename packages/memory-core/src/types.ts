export type MemoryType =
  | "observation"
  | "preference"
  | "relationship"
  | "value"
  | "goal"
  | "trait"
  | "conflict";

export type MemoryStatus =
  | "candidate"
  | "pending_confirmation"
  | "confirmed"
  | "rejected"
  | "superseded"
  | "archived";

export type ImpactScope =
  | "conversation"
  | "task_execution"
  | "earning_advice"
  | "relationship_advice"
  | "growth_guidance"
  | "identity_model";

export type EvidenceKind =
  | "user_confirmation"
  | "user_self_description"
  | "observed_behavior"
  | "imported_material"
  | "external_context"
  | "prior_system";

export interface MemoryEvidence {
  id: string;
  kind: EvidenceKind;
  sourceId: string;
  excerpt?: string;
  recordedAt: string;
  confidence: number;
}

export interface TimeWindow {
  start: string;
  end?: string;
}

export interface MemoryItem {
  id: string;
  type: MemoryType;
  subject: string;
  statement: string;
  evidence: MemoryEvidence[];
  sourceIds: string[];
  timeWindow: TimeWindow;
  confidence: number;
  weight: number;
  status: MemoryStatus;
  impactScope: ImpactScope[];
  confirmationRequired: boolean;
  conflictsWith: string[];
  supersedes: string[];
  supersededBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectionFacet {
  label: string;
  summary: string;
  memoryIds: string[];
  confidence: number;
}

export interface CurrentProjection {
  userId: string;
  generatedAt: string;
  facets: ProjectionFacet[];
  activeMemoryIds: string[];
}

export interface ChatHistorySource {
  title: string;
  url: string;
  snippet?: string;
  publishedAt?: string;
}

export interface ChatHistoryMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  sources?: ChatHistorySource[];
}

export interface LifeTrajectory {
  userId: string;
  generatedAt: string;
  milestones: Array<{
    period: TimeWindow;
    summary: string;
    memoryIds: string[];
  }>;
}

export interface CognitionLogEntry {
  id: string;
  occurredAt: string;
  rawInteraction: {
    kind: "chat" | "task" | "import";
    input: string;
    reply?: string;
  };
  runtime?: {
    configuredProvider: string;
    configuredModel: string;
    usedProvider: string;
    usedModel: string;
    fallbackUsed: boolean;
    fallbackReason?: string;
  };
  internet?: {
    requests: Array<{
      kind: "web_search" | "read_webpage";
      query?: string;
      url?: string;
      ok: boolean;
      errorCode?: string;
    }>;
    sources: ChatHistorySource[];
  };
  candidateMemories: MemoryItem[];
  decisionLog: Array<{
    memoryId: string;
    action:
      | "auto_accept"
      | "soft_confirm"
      | "hard_confirm"
      | "confirmed"
      | "rejected"
      | "superseded";
    reason: string;
  }>;
}
