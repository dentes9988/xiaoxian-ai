import type {
  CognitionLogEntry,
  CurrentProjection,
  MemoryItem
} from "@98agent/memory-core";
import type {
  PriorHint,
  PriorProfileInput,
  PriorSkillOutput
} from "@98agent/prior-engines";

export interface TrainingExample {
  task:
    | "extract_candidate_memories"
    | "decide_memory_action"
    | "update_current_projection"
    | "profile_seed_interpretation"
    | "profile_seed_projection"
    | "prior_skill_interpretation"
    | "prior_skill_reconciliation"
    | "self_model_consolidation"
    | "self_model_questioning"
    | "self_model_decision_support";
  instruction: string;
  input: string;
  output: string;
  metadata: Record<string, string>;
}

export interface SelfModelDigest {
  summary: string;
  stableFacts: string[];
  activeGoals: string[];
  workPreferences: string[];
  relationshipSignals: string[];
  valueSignals: string[];
  traitSignals: string[];
  currentThemes: string[];
  recentSignals: string[];
  pendingConfirmations: string[];
  openQuestions: string[];
}

export function buildProfileSeedExamples(
  profile: PriorProfileInput,
  priors: PriorHint[]
): TrainingExample[] {
  const examples: TrainingExample[] = [];
  const normalizedProfile = {
    fullName: profile.fullName ?? "",
    gender: profile.gender ?? "",
    birthDate: profile.birthDate ?? "",
    birthTime: profile.birthTime ?? "",
    birthLocation: profile.birthLocation ?? "",
    childhoodLocations: profile.childhoodLocations ?? [],
    mbti: profile.mbti ?? "",
    birthLatitude:
      typeof profile.birthLatitude === "number" ? String(profile.birthLatitude) : "",
    birthLongitude:
      typeof profile.birthLongitude === "number" ? String(profile.birthLongitude) : "",
    timezoneOffsetHours:
      typeof profile.timezoneOffsetHours === "number" ? String(profile.timezoneOffsetHours) : ""
  };

  examples.push({
    task: "profile_seed_interpretation",
    instruction:
      "Read the user's stable biographical seed profile and optional prior hints, then produce cautious candidate memories that can initialize a personal model without treating priors as truth.",
    input: JSON.stringify(
      {
        profile: normalizedProfile,
        priors
      },
      null,
      2
    ),
    output: JSON.stringify(
      {
        seedFacts: [
          normalizedProfile.gender
            ? `User self-identifies as ${normalizedProfile.gender}.`
            : undefined,
          normalizedProfile.birthLocation
            ? `User was born in ${normalizedProfile.birthLocation}.`
            : undefined,
          normalizedProfile.childhoodLocations.length > 0
            ? `User spent childhood in ${normalizedProfile.childhoodLocations.join(" / ")}.`
            : undefined
        ].filter(Boolean),
        priorHints: priors.map((prior) => ({
          system: prior.system,
          summary: prior.summary,
          confidence: prior.confidence
        }))
      },
      null,
      2
    ),
    metadata: {
      source: "profile_seed"
    }
  });

  examples.push({
    task: "profile_seed_projection",
    instruction:
      "Build an initial current projection from stable biographical profile fields plus low-authority prior hints. Keep hard facts separate from interpretive hints.",
    input: JSON.stringify(
      {
        profile: normalizedProfile,
        priors
      },
      null,
      2
    ),
    output: JSON.stringify(
      {
        stableFacts: [
          normalizedProfile.birthDate ? `Birth date: ${normalizedProfile.birthDate}` : undefined,
          normalizedProfile.birthTime ? `Birth time: ${normalizedProfile.birthTime}` : undefined,
          normalizedProfile.birthLocation
            ? `Birth place: ${normalizedProfile.birthLocation}`
            : undefined,
          normalizedProfile.childhoodLocations.length > 0
            ? `Childhood locations: ${normalizedProfile.childhoodLocations.join(" / ")}`
            : undefined
        ].filter(Boolean),
        interpretiveHints: priors.map((prior) => prior.summary)
      },
      null,
      2
    ),
    metadata: {
      source: "profile_seed"
    }
  });

  return examples;
}

export function buildPriorSkillExamples(outputs: PriorSkillOutput[]): TrainingExample[] {
  const readyOutputs = outputs.filter((output) => output.status === "ready");
  const examples: TrainingExample[] = readyOutputs.map((output) => ({
    task: "prior_skill_interpretation",
    instruction:
      "Given a low-authority skill-derived prior, restate only tentative signals that may be useful for a personal model. Preserve provenance, caveats, and suggested confirmation questions.",
    input: JSON.stringify(
      {
        skillId: output.skillId,
        system: output.system,
        requestedSourceUrl: output.requestedSourceUrl,
        resolvedSourceUrl: output.resolvedSourceUrl,
        availability: output.availability,
        confidence: output.confidence,
        rawInput: output.rawInput,
        rawResultSummary: summarizeUnknown(output.rawResult)
      },
      null,
      2
    ),
    output: JSON.stringify(
      {
        summary: output.summary,
        structuredSignals: output.structuredSignals,
        suggestedQuestions: output.suggestedQuestions,
        disclaimers: output.disclaimers
      },
      null,
      2
    ),
    metadata: {
      source: "prior_skill_output",
      skillId: output.skillId,
      availability: output.availability
    }
  }));

  if (readyOutputs.length > 1) {
    examples.push({
      task: "prior_skill_reconciliation",
      instruction:
        "Reconcile multiple low-authority prior systems. Keep recurring signals, name tensions between systems, and preserve the rule that user confirmation outranks priors.",
      input: JSON.stringify(
        readyOutputs.map((output) => ({
          skillId: output.skillId,
          system: output.system,
          summary: output.summary,
          structuredSignals: output.structuredSignals,
          confidence: output.confidence
        })),
        null,
        2
      ),
      output: JSON.stringify(
        {
          overlappingSignals: collectOverlappingSignals(readyOutputs),
          disagreements: readyOutputs
            .filter((output) => output.notes.length > 0)
            .map((output) => ({
              skillId: output.skillId,
              notes: output.notes
            })),
          confirmationPolicy:
            "Treat all prior systems as hypotheses. Any profile update that could affect future decisions must be confirmed by the user."
        },
        null,
        2
      ),
      metadata: {
        source: "prior_skill_output",
        skillCount: String(readyOutputs.length)
      }
    });
  }

  return examples;
}

export function buildSelfModelDigest(args: {
  profile: PriorProfileInput;
  priors: PriorHint[];
  memories: MemoryItem[];
  currentProjection?: CurrentProjection;
  cognitionLogs: CognitionLogEntry[];
}): SelfModelDigest {
  const confirmed = args.memories.filter((memory) => memory.status === "confirmed");
  const pending = args.memories.filter((memory) => memory.status === "pending_confirmation");
  const recentLogs = args.cognitionLogs.slice(-5);

  const stableFacts = compact([
    args.profile.fullName ? `Name: ${args.profile.fullName}` : undefined,
    args.profile.gender ? `Gender: ${args.profile.gender}` : undefined,
    args.profile.birthDate ? `Birth date: ${args.profile.birthDate}` : undefined,
    args.profile.birthTime ? `Birth time: ${args.profile.birthTime}` : undefined,
    args.profile.birthLocation ? `Birth place: ${args.profile.birthLocation}` : undefined,
    args.profile.childhoodLocations?.length
      ? `Childhood locations: ${args.profile.childhoodLocations.join(" / ")}`
      : undefined,
    args.profile.mbti ? `MBTI (self-reported): ${args.profile.mbti}` : undefined
  ]);

  const activeGoals = collectStatements(confirmed, "goal", 4);
  const workPreferences = dedupeStrings([
    ...collectStatements(
      confirmed.filter(
        (memory) =>
          memory.type === "preference" ||
          memory.type === "trait" ||
          memory.type === "value"
      ),
      undefined,
      4,
      /(工作|赚钱|学习|成长|task|work|money|learn|growth)/i
    ),
    ...extractProjectionThemes(args.currentProjection, /(goal|preference|trait|value)/i, 3)
  ]).slice(0, 5);
  const relationshipSignals = collectStatements(
    confirmed,
    "relationship",
    4,
    /(关系|亲密|表达情感|emotion|relationship|friend|family)/i
  );
  const valueSignals = collectStatements(confirmed, "value", 4);
  const traitSignals = collectStatements(confirmed, "trait", 4);
  const currentThemes = dedupeStrings([
    ...extractProjectionThemes(args.currentProjection, /.*/, 5),
    ...pending.slice(0, 3).map((memory) => `Pending: ${memory.statement}`)
  ]).slice(0, 6);
  const recentSignals = recentLogs.flatMap((log) =>
    compact([
      log.rawInteraction.input ? `User said: ${shorten(log.rawInteraction.input, 140)}` : undefined,
      log.rawInteraction.reply ? `Agent replied: ${shorten(log.rawInteraction.reply, 140)}` : undefined
    ])
  ).slice(-6);
  const pendingConfirmations = pending.slice(0, 6).map((memory) => memory.statement);
  const openQuestions = dedupeStrings([
    ...args.priors.flatMap((prior) => prior.suggestedQuestions),
    ...pendingConfirmations.map((statement) => `Should confirm: ${statement}`)
  ]).slice(0, 6);

  const summarySegments = compact([
    activeGoals.length > 0 ? `Current goals: ${activeGoals.join(" | ")}` : undefined,
    workPreferences.length > 0 ? `Work style: ${workPreferences.join(" | ")}` : undefined,
    relationshipSignals.length > 0
      ? `Relationship signals: ${relationshipSignals.join(" | ")}`
      : undefined,
    pendingConfirmations.length > 0
      ? `Still needs confirmation: ${pendingConfirmations.join(" | ")}`
      : undefined
  ]);

  return {
    summary:
      summarySegments.join(" ") ||
      "The self-model is still sparse. Continue gathering grounded user facts, goals, and preferences.",
    stableFacts,
    activeGoals,
    workPreferences,
    relationshipSignals,
    valueSignals,
    traitSignals,
    currentThemes,
    recentSignals,
    pendingConfirmations,
    openQuestions
  };
}

export function buildSelfModelExamples(digest: SelfModelDigest): TrainingExample[] {
  return [
    {
      task: "self_model_consolidation",
      instruction:
        "Consolidate the current self-model into stable facts, active themes, and unresolved hypotheses without overstating confidence.",
      input: JSON.stringify(digest, null, 2),
      output: JSON.stringify(
        {
          stableFacts: digest.stableFacts,
          activeThemes: digest.currentThemes,
          unresolved: digest.pendingConfirmations,
          caution: "Treat pending confirmations and prior-derived questions as hypotheses until the user confirms them."
        },
        null,
        2
      ),
      metadata: {
        source: "self_model_digest"
      }
    },
    {
      task: "self_model_questioning",
      instruction:
        "Given the current self-model, ask the next most useful calibration questions that reduce uncertainty about work fit, decision style, or relationship needs.",
      input: JSON.stringify(digest, null, 2),
      output: JSON.stringify(
        {
          nextQuestions: digest.openQuestions,
          reasoningFocus: digest.pendingConfirmations.length > 0 ? "confirm_high_impact" : "deepen_fit"
        },
        null,
        2
      ),
      metadata: {
        source: "self_model_digest"
      }
    },
    {
      task: "self_model_decision_support",
      instruction:
        "Turn the current self-model into short decision-support rules that help advice stay personal, consequence-aware, and cautious.",
      input: JSON.stringify(digest, null, 2),
      output: JSON.stringify(
        {
          guidanceRules: compact([
            digest.activeGoals.length > 0
              ? `Respect active goals: ${digest.activeGoals.join(" | ")}`
              : undefined,
            digest.workPreferences.length > 0
              ? `Match work suggestions to known fit signals: ${digest.workPreferences.join(" | ")}`
              : undefined,
            digest.pendingConfirmations.length > 0
              ? `Flag hypotheses before using them strongly: ${digest.pendingConfirmations.join(" | ")}`
              : undefined
          ]),
          tone: "Use hypotheses for identity-sensitive advice. Focus on consequences and fit."
        },
        null,
        2
      ),
      metadata: {
        source: "self_model_digest"
      }
    }
  ];
}

export function buildTrainingExamples(logs: CognitionLogEntry[]): TrainingExample[] {
  const examples: TrainingExample[] = [];

  for (const log of logs) {
    examples.push({
      task: "extract_candidate_memories",
      instruction:
        "Read the user's interaction and return candidate memories with type, statement, impact scope, confirmation need, and confidence. Return an empty list when the turn contains no durable personal information.",
      input: JSON.stringify(
        {
          interaction: log.rawInteraction,
          runtime: log.runtime,
          priorDecisions: log.decisionLog.map((decision) => ({
            memoryId: decision.memoryId,
            action: decision.action
          }))
        },
        null,
        2
      ),
      output: JSON.stringify(
        {
          candidateMemories: log.candidateMemories.map((memory) => ({
            type: memory.type,
            subject: memory.subject,
            statement: memory.statement,
            confidence: memory.confidence,
            impactScope: memory.impactScope,
            confirmationRequired: memory.confirmationRequired
          }))
        },
        null,
        2
      ),
      metadata: {
        logId: log.id,
        occurredAt: log.occurredAt
      }
    });

    for (const memory of log.candidateMemories) {
      const decision = log.decisionLog.find((item) => item.memoryId === memory.id);
      if (!decision) continue;

      examples.push({
        task: "decide_memory_action",
        instruction:
          "Given a candidate memory and the interaction context, decide whether it should auto-accept, soft-confirm, hard-confirm, reject, or supersede older memory.",
        input: JSON.stringify(
          {
            interaction: log.rawInteraction,
            candidateMemory: {
              type: memory.type,
              statement: memory.statement,
              confidence: memory.confidence,
              impactScope: memory.impactScope,
              confirmationRequired: memory.confirmationRequired
            }
          },
          null,
          2
        ),
        output: JSON.stringify(
          {
            action: decision.action,
            reason: decision.reason
          },
          null,
          2
        ),
        metadata: {
          logId: log.id,
          occurredAt: log.occurredAt,
          memoryId: memory.id
        }
      });
    }

    if (log.candidateMemories.length > 0) {
      examples.push({
        task: "update_current_projection",
        instruction:
          "Update the user's current projection using the interaction and the accepted or pending candidate memories. Focus on what should become part of the user's active self-model now.",
        input: JSON.stringify(
          {
            interaction: log.rawInteraction,
            candidateMemories: log.candidateMemories.map((memory) => ({
              type: memory.type,
              statement: memory.statement,
              status: memory.status,
              impactScope: memory.impactScope
            })),
            decisions: log.decisionLog
          },
          null,
          2
        ),
        output: JSON.stringify(
          {
            activeFacets: summarizeProjectionFacets(log),
            pendingConfirmations: log.candidateMemories
              .filter((memory) => memory.status === "pending_confirmation")
              .map((memory) => memory.statement)
          },
          null,
          2
        ),
        metadata: {
          logId: log.id,
          occurredAt: log.occurredAt
        }
      });
    }
  }

  return examples;
}

function extractProjectionThemes(
  projection: CurrentProjection | undefined,
  labelPattern: RegExp,
  limit: number
): string[] {
  if (!projection) return [];
  return projection.facets
    .filter((facet) => labelPattern.test(facet.label))
    .slice(0, limit)
    .map((facet) => `${facet.label}: ${facet.summary}`);
}

function collectStatements(
  memories: MemoryItem[],
  type?: MemoryItem["type"],
  limit = 4,
  pattern?: RegExp
): string[] {
  return dedupeStrings(
    memories
      .filter((memory) => (type ? memory.type === type : true))
      .map((memory) => memory.statement)
      .filter((statement) => (pattern ? pattern.test(statement) : true))
  ).slice(0, limit);
}

function shorten(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function compact(values: Array<string | undefined>): string[] {
  return values.filter((value): value is string => Boolean(value && value.trim()));
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    deduped.push(value);
  }
  return deduped;
}

function summarizeProjectionFacets(log: CognitionLogEntry): Array<{
  label: string;
  summary: string;
}> {
  const grouped = new Map<string, string[]>();
  for (const memory of log.candidateMemories) {
    if (memory.status !== "confirmed" && memory.status !== "pending_confirmation") continue;
    const bucket = grouped.get(memory.type) ?? [];
    bucket.push(memory.statement);
    grouped.set(memory.type, bucket);
  }

  return Array.from(grouped.entries()).map(([label, summaries]) => ({
    label,
    summary: summaries.join(" ")
  }));
}

function collectOverlappingSignals(outputs: PriorSkillOutput[]): string[] {
  const signalCounts = new Map<string, number>();
  for (const output of outputs) {
    for (const signal of output.structuredSignals) {
      signalCounts.set(signal, (signalCounts.get(signal) ?? 0) + 1);
    }
  }

  return Array.from(signalCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([signal]) => signal);
}

function summarizeUnknown(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") {
    return value.length > 1200 ? `${value.slice(0, 1197)}...` : value;
  }

  const text = JSON.stringify(value);
  return text.length > 1200 ? `${text.slice(0, 1197)}...` : text;
}
