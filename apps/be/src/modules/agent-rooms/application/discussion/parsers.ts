import { z } from 'zod';

const strings = z.array(z.string()).default([]);

const IssueStatus = z.enum(['open', 'decidable', 'needs_verification', 'out_of_scope']);
const RoleRelevance = z.enum(['core', 'supporting', 'out_of_scope']);

const issueSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: IssueStatus.default('open'),
  claims: strings,
  risks: strings,
  proposals: strings,
  ownerRole: z.string().optional(),
  lastTouchedTurn: z.number().default(0),
  revisits: z.number().default(0),
});

const decisionCandidateSchema = z
  .object({
    recommendation: z.string(),
    conditions: strings,
    risks: strings,
    verification: strings,
    isCommitted: z.boolean().default(false),
  })
  .nullish()
  .transform((c) => (c && c.recommendation.trim() ? c : null));

const inconsistencySchema = z.object({
  id: z.string(),
  description: z.string(),
  kind: z.enum(['arithmetic', 'unit', 'contradiction']).default('contradiction'),
  turn: z.number().default(0),
  resolved: z.boolean().default(false),
});

export const topicValidationSchema = z.object({
  valid: z.boolean(),
  reason: z.string().optional(),
});

export const speakerPickSchema = z.object({
  next: z.string().nullish(),
  reason: z.string().optional(),
  done: z.boolean().default(false),
});

const rolePlanSchema = z.object({
  agentId: z.string(),
  agentName: z.string().optional(),
  relevance: RoleRelevance,
  assignedContribution: z.string().optional(),
  exclusionReason: z.string().optional(),
});

const discussionBriefSchema = z.object({
  objective: z.string().default(''),
  deliverable: z.string().default(''),
  inScope: z.array(z.string()).default([]),
  outOfScope: z.array(z.string()).default([]),
  requiredDimensions: z.array(z.string()).default([]),
  rolePlan: z.array(rolePlanSchema).default([]),
});

export const topicClassificationSchema = z.object({
  discussionType: z.enum(['decision', 'review', 'brainstorm', 'risk_check']),
  outputContract: z.array(z.string()).default([]),
  options: z.array(z.string()).optional(),
  brief: discussionBriefSchema.optional(),
});

export type TopicClassification = z.infer<typeof topicClassificationSchema>;

export const claimExtractionSchema = z.object({
  issues: z.array(issueSchema).default([]),
  newClaims: z.number().default(0),
  repeatClaims: z.number().default(0),
  decisionCandidate: decisionCandidateSchema,
  inconsistencies: z.array(inconsistencySchema).default([]),
});

export type ClaimExtraction = z.infer<typeof claimExtractionSchema>;
