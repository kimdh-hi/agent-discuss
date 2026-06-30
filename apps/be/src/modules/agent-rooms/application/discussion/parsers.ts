import { z } from 'zod';

const strings = z.array(z.string()).default([]);

const IssueStatus = z.enum(['open', 'decidable', 'needs_verification', 'out_of_scope']);

const issueSchema = (fallbackStatus: z.infer<typeof IssueStatus>) =>
  z.object({
    id: z.string(),
    title: z.string(),
    status: IssueStatus.default(fallbackStatus),
    claims: strings,
    risks: strings,
    proposals: strings,
    ownerRole: z.string().optional(),
    lastTouchedTurn: z.number().default(0),
    revisits: z.number().default(0),
  });

const decisionCandidate = z
  .object({
    recommendation: z.string(),
    conditions: strings,
    risks: strings,
    verification: strings,
    isCommitted: z.boolean().default(false),
  })
  .nullish()
  .transform((candidate) => (candidate && candidate.recommendation.trim() ? candidate : null));

const inconsistencySchema = z.object({
  id: z.string(),
  description: z.string(),
  kind: z.enum(['arithmetic', 'unit', 'contradiction']).default('contradiction'),
  turn: z.number().default(0),
  resolved: z.boolean().default(false),
});

export const TopicSchema = z.object({ valid: z.boolean() });

export const AgendaSchema = z.object({
  discussionType: z.enum(['decision', 'review', 'brainstorm', 'risk_check']).default('decision'),
  outputContract: strings,
  options: strings,
});

export const IssuesSchema = z.object({
  issues: z.array(issueSchema('open')).default([]),
  newClaims: z.number().default(0),
  repeatClaims: z.number().default(0),
  decisionCandidate,
  inconsistencies: z.array(inconsistencySchema).default([]),
});

export const DecisionSchema = z.object({
  issues: z.array(issueSchema('decidable')).default([]),
  decisionCandidate,
});

export const PickSpeakerSchema = z.object({
  next: z.string().nullish(),
  done: z.boolean().default(false),
  reason: z.string().optional(),
});
