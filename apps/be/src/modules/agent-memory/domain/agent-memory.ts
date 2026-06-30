import { z } from 'zod';

export const AGENT_MEMORY_NAMESPACE = 'agentMemories';

export function agentMemoryNamespace(agentId: string): string[] {
  return [AGENT_MEMORY_NAMESPACE, agentId];
}

export interface StoredMemory {
  content: string;
  sourceTopicId: string;
  createdAt: string;
}

export interface AgentMemoryDto {
  id: string;
  agentId: string;
  content: string;
  sourceTopicId: string | null;
  createdAt: string | null;
}

export const MemoryExtractionSchema = z.object({
  notes: z.array(z.string()).max(3).default([]),
});

export type MemoryExtraction = z.infer<typeof MemoryExtractionSchema>;
