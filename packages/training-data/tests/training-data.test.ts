import { describe, expect, it } from "vitest";

import type { CognitionLogEntry } from "@98agent/memory-core";
import type { PriorSkillOutput } from "@98agent/prior-engines";

import {
  buildSelfModelDigest,
  buildSelfModelExamples,
  buildPriorSkillExamples,
  buildProfileSeedExamples,
  buildTrainingExamples
} from "../src/index.js";

describe("training-data", () => {
  it("builds multiple training example types from a cognition log", () => {
    const log: CognitionLogEntry = {
      id: "log-1",
      occurredAt: "2026-06-21T13:54:55.920Z",
      rawInteraction: {
        kind: "chat",
        input: "我这周想尽快赚到钱，应该先做什么？"
      },
      candidateMemories: [
        {
          id: "mem-1",
          type: "goal",
          subject: "user",
          statement: "User is actively seeking near-term cash flow improvement.",
          evidence: [],
          sourceIds: ["src-1"],
          timeWindow: { start: "2026-06-21T13:54:55.920Z" },
          confidence: 0.78,
          weight: 0.78,
          status: "pending_confirmation",
          impactScope: ["earning_advice", "identity_model"],
          confirmationRequired: true,
          conflictsWith: [],
          supersedes: [],
          createdAt: "2026-06-21T13:54:55.920Z",
          updatedAt: "2026-06-21T13:54:55.920Z"
        }
      ],
      decisionLog: [
        {
          memoryId: "mem-1",
          action: "hard_confirm",
          reason: "High-impact earning intent should be confirmed."
        }
      ]
    };

    const examples = buildTrainingExamples([log]);
    expect(examples.map((example) => example.task)).toEqual([
      "extract_candidate_memories",
      "decide_memory_action",
      "update_current_projection"
    ]);
  });

  it("keeps no-memory turns as time-stamped negative extraction examples", () => {
    const examples = buildTrainingExamples([
      {
        id: "log-no-memory",
        occurredAt: "2026-08-30T14:47:00.000Z",
        rawInteraction: {
          kind: "chat",
          input: "Confirm that the runtime is available.",
          reply: "The runtime is available."
        },
        runtime: {
          configuredProvider: "qyuanai",
          configuredModel: "cloud-model",
          usedProvider: "ollama",
          usedModel: "local-model",
          fallbackUsed: true,
          fallbackReason: "primary_auth_failed"
        },
        candidateMemories: [],
        decisionLog: []
      }
    ]);

    expect(examples).toHaveLength(1);
    expect(examples[0]).toMatchObject({
      task: "extract_candidate_memories",
      metadata: {
        logId: "log-no-memory",
        occurredAt: "2026-08-30T14:47:00.000Z"
      }
    });
    expect(JSON.parse(examples[0]?.output ?? "{}")).toEqual({ candidateMemories: [] });
    expect(JSON.parse(examples[0]?.input ?? "{}").runtime).toMatchObject({
      usedProvider: "ollama",
      fallbackUsed: true
    });
  });

  it("builds profile-seed examples from stable personal biography", () => {
    const examples = buildProfileSeedExamples(
      {
        gender: "male",
        birthDate: "1991-08-17",
        birthTime: "07:30",
        birthLocation: "上海市浦东新区东方医院",
        childhoodLocations: ["上海市徐汇区"]
      },
      [
        {
          system: "astrology",
          summary: "Birth information is available for optional later prior generation.",
          confidence: 0.1,
          suggestedQuestions: []
        }
      ]
    );

    expect(examples.map((example) => example.task)).toEqual([
      "profile_seed_interpretation",
      "profile_seed_projection"
    ]);
    expect(examples[0]?.output).toContain("上海市浦东新区东方医院");
  });

  it("builds prior-skill examples and reconciliation output", () => {
    const outputs: PriorSkillOutput[] = [
      {
        id: "prior-1",
        skillId: "jinchenma_bazi",
        system: "bazi",
        requestedSourceUrl: "https://github.com/jinchenma94/bazi-skill",
        resolvedSourceUrl: "https://github.com/jinchenma94/bazi-skill",
        availability: "direct",
        status: "ready",
        generatedAt: "2026-06-21T13:54:55.920Z",
        confidence: 0.28,
        authority: "low",
        summary: "The chart suggests strong self-drive with a need to verify how it shows up in real work choices.",
        structuredSignals: ["Strong self-drive", "Needs real-world verification"],
        suggestedQuestions: ["What kind of earning pressure makes you move fastest?"],
        disclaimers: ["Traditional prior only."],
        notes: [],
        rawInput: { birthDate: "1991-08-17" }
      },
      {
        id: "prior-2",
        skillId: "astrology_skill",
        system: "astrology",
        requestedSourceUrl: "https://github.com/astrologyai-pro/astrology-skill",
        resolvedSourceUrl: "https://github.com/Brhiza/mingyu",
        availability: "fallback",
        status: "ready",
        generatedAt: "2026-06-21T13:54:55.920Z",
        confidence: 0.22,
        authority: "low",
        summary: "The fallback astrolabe points to strong self-drive with visible sensitivity to environment.",
        structuredSignals: ["Strong self-drive", "Sensitive to environment"],
        suggestedQuestions: ["Which environments help you stay calm and effective?"],
        disclaimers: ["Fallback engine used."],
        notes: ["Original requested astrology skill repo was unavailable at generation time."],
        rawInput: { birthLocation: "西安" }
      }
    ];

    const examples = buildPriorSkillExamples(outputs);
    expect(examples.map((example) => example.task)).toEqual([
      "prior_skill_interpretation",
      "prior_skill_interpretation",
      "prior_skill_reconciliation"
    ]);
    expect(examples[2]?.output).toContain("Strong self-drive");
  });

  it("builds a richer self-model digest and training examples", () => {
    const digest = buildSelfModelDigest({
      profile: {
        gender: "male",
        birthDate: "1991-08-17",
        birthLocation: "上海市浦东新区东方医院",
        mbti: "INTJ"
      },
      priors: [
        {
          system: "astrology",
          summary: "Low-authority hint about strong self-drive.",
          confidence: 0.18,
          suggestedQuestions: ["What kind of work pressure wakes you up fastest?"]
        }
      ],
      memories: [
        {
          id: "m1",
          type: "goal",
          subject: "user",
          statement: "User is actively seeking near-term cash flow improvement.",
          evidence: [],
          sourceIds: ["s1"],
          timeWindow: { start: "2026-06-21T13:54:55.920Z" },
          confidence: 0.78,
          weight: 0.78,
          status: "confirmed",
          impactScope: ["earning_advice", "identity_model"],
          confirmationRequired: true,
          conflictsWith: [],
          supersedes: [],
          createdAt: "2026-06-21T13:54:55.920Z",
          updatedAt: "2026-06-21T13:54:55.920Z"
        },
        {
          id: "m2",
          type: "preference",
          subject: "user",
          statement: "User prefers direct work with fast feedback loops.",
          evidence: [],
          sourceIds: ["s2"],
          timeWindow: { start: "2026-06-21T13:55:55.920Z" },
          confidence: 0.72,
          weight: 0.72,
          status: "confirmed",
          impactScope: ["task_execution", "identity_model"],
          confirmationRequired: false,
          conflictsWith: [],
          supersedes: [],
          createdAt: "2026-06-21T13:55:55.920Z",
          updatedAt: "2026-06-21T13:55:55.920Z"
        },
        {
          id: "m3",
          type: "relationship",
          subject: "user",
          statement: "User is unsure where to express strong emotions safely.",
          evidence: [],
          sourceIds: ["s3"],
          timeWindow: { start: "2026-06-21T13:56:55.920Z" },
          confidence: 0.69,
          weight: 0.69,
          status: "pending_confirmation",
          impactScope: ["relationship_advice", "identity_model"],
          confirmationRequired: true,
          conflictsWith: [],
          supersedes: [],
          createdAt: "2026-06-21T13:56:55.920Z",
          updatedAt: "2026-06-21T13:56:55.920Z"
        }
      ],
      currentProjection: {
        userId: "default-user",
        generatedAt: "2026-06-22T00:00:00.000Z",
        activeMemoryIds: ["m1", "m2", "m3"],
        facets: [
          {
            label: "goal",
            summary: "User is actively seeking near-term cash flow improvement.",
            memoryIds: ["m1"],
            confidence: 0.78
          }
        ]
      },
      cognitionLogs: [
        {
          id: "log-1",
          occurredAt: "2026-06-21T13:54:55.920Z",
          rawInteraction: {
            kind: "chat",
            input: "我这周想尽快赚到钱。",
            reply: "先做最快能成交的那条。"
          },
          candidateMemories: [],
          decisionLog: []
        }
      ]
    });

    expect(digest.activeGoals[0]).toContain("cash flow");
    expect(digest.workPreferences[0]).toContain("fast feedback");
    expect(digest.pendingConfirmations[0]).toContain("strong emotions");

    const examples = buildSelfModelExamples(digest);
    expect(examples.map((example) => example.task)).toEqual([
      "self_model_consolidation",
      "self_model_questioning",
      "self_model_decision_support"
    ]);
  });
});
