import type { RagService } from '../../../rag/application/rag.service';
import type { LlmTool } from '../../../../common/ai/llm/llm.types';
import type { CachePort } from '../../../../common/cache/cache.port';
import { buildRagSearchTool } from '../../../rag/application/rag.tool';

export function buildAgentRagTool(
  ragService: RagService,
  agentKnowledgeScope: string,
  cache?: CachePort,
): LlmTool {
  return buildRagSearchTool(ragService, agentKnowledgeScope, cache);
}
