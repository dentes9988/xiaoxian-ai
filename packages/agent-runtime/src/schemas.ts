import { z } from "zod";

import { earningActionProposalSchema } from "./earning-actions.js";

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

export const internetToolRequestSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("web_search"),
    query: z.string().trim().min(2).max(300),
    maxResults: z.number().int().min(1).max(5).optional()
  }),
  z.object({
    kind: z.literal("read_webpage"),
    url: z.string().trim().url().max(2_048)
  })
]);

export const runtimeTurnResultSchema = z.object({
  reply: z.string().min(1),
  candidateMemories: z.array(candidateMemorySchema),
  proposedActions: z.array(earningActionProposalSchema).optional(),
  toolRequests: z.array(internetToolRequestSchema).max(2).optional()
});

export type RuntimeMessage = z.infer<typeof messageSchema>;
export type CandidateMemoryDraft = z.infer<typeof candidateMemorySchema>;
export type InternetToolRequest = z.infer<typeof internetToolRequestSchema>;
export type RuntimeTurnResult = z.infer<typeof runtimeTurnResultSchema>;

export function parseInternetToolRequests(value: unknown): InternetToolRequest[] {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, 2)
    .map((item) => internetToolRequestSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data);
}
