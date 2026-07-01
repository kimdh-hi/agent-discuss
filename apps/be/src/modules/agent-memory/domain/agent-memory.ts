import { z } from 'zod';

export const AGENT_MEMORY_NAMESPACE = 'agentMemories';

export function agentMemoryNamespace(agentId: string): string[] {
  return [AGENT_MEMORY_NAMESPACE, agentId];
}

export const AGENT_MEMORY_KINDS = [
  'judgment_criterion',
  'verification_rule',
  'decision_preference',
  'role_constraint',
] as const;

export type AgentMemoryKind = (typeof AGENT_MEMORY_KINDS)[number];

export const AGENT_MEMORY_EVIDENCE_LEVELS = [
  'final_conclusion',
  'final_and_snapshot',
  'repeated_by_agent',
  'explicit_user_preference',
  'single_agent_unopposed',
  'weak_or_ambiguous',
] as const;

export type AgentMemoryEvidenceLevel = (typeof AGENT_MEMORY_EVIDENCE_LEVELS)[number];

export const AGENT_MEMORY_FLAGS = [
  'needs_verification',
  'unresolved_inconsistency',
  'speculative',
] as const;

export type AgentMemoryFlag = (typeof AGENT_MEMORY_FLAGS)[number];

export const MIN_STORED_CONFIDENCE = 0.6;

export function confidenceForEvidence(
  evidenceLevel: AgentMemoryEvidenceLevel,
  flags: AgentMemoryFlag[] = [],
): number {
  const base: Record<AgentMemoryEvidenceLevel, number> = {
    final_conclusion: 1.0,
    final_and_snapshot: 0.9,
    repeated_by_agent: 0.8,
    explicit_user_preference: 0.7,
    single_agent_unopposed: 0.6,
    weak_or_ambiguous: 0,
  };
  const penalty = flags.reduce((sum, flag) => sum + (AGENT_MEMORY_FLAGS.includes(flag) ? 0.15 : 0), 0);
  return Math.max(0, base[evidenceLevel] - penalty);
}

export interface StoredMemory {
  content: string;
  kind: string;
  confidence: number;
  importance: number;
  contentHash: string;
  sourceTopicId: string | null;
  sourceRounds: number[];
  createdAt: string;
  expiresAt: string | null;
  lastAccessedAt: string | null;
}

export interface AgentMemoryDto {
  id: string;
  agentId: string;
  content: string;
  kind: string | null;
  confidence: number | null;
  sourceTopicId: string | null;
  createdAt: string | null;
  expiresAt: string | null;
}

export const MemoryExtractionSchema = z.object({
  candidates: z
    .array(
      z.object({
        key: z.string().min(1).max(160).nullable(),
        kind: z.enum(AGENT_MEMORY_KINDS),
        content: z.string().min(1).max(1200),
        evidenceLevel: z.enum(AGENT_MEMORY_EVIDENCE_LEVELS),
        flags: z.array(z.enum(AGENT_MEMORY_FLAGS)),
        sourceRounds: z.array(z.number().int().nonnegative()),
      }),
    )
    .max(10)
    .default([]),
});

export type MemoryExtraction = z.infer<typeof MemoryExtractionSchema>;
