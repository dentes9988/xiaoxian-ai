import { z } from "zod";

export const messageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().min(1)
});

export const candidateMemorySchema = z.object({
  type: z.enum(["observation", "preference", "relationship", "value", "goal", "trait", "conflict"]),
  subject: z.string().min(1),
  statement: z.string().min(1),
  confidence: z.number().min(0).max(1),
  impactScope: z
    .array(
      z.enum([
        "conversation",
        "task_execution",
        "earning_advice",
        "relationship_advice",
        "growth_guidance",
        "identity_model"
      ])
    )
    .min(1),
  confirmationRequired: z.boolean(),
  rationale: z.string().min(1)
});

export const runtimeTurnResultSchema = z.object({
  reply: z.string().min(1),
  candidateMemories: z.array(candidateMemorySchema)
});

export type RuntimeMessage = z.infer<typeof messageSchema>;
export type CandidateMemoryDraft = z.infer<typeof candidateMemorySchema>;
export type RuntimeTurnResult = z.infer<typeof runtimeTurnResultSchema>;

