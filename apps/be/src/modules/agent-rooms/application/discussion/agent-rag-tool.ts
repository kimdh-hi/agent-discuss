import type { RagService } from '../../../rag/application/rag.service';
import type { LlmTool } from '../../../../common/ai/llm/llm.types';
import { buildRagSearchTool } from '../../../rag/application/rag.tool';

export function buildAgentRagTool(
  ragService: RagService,
  agentKnowledgeScope: string,
): LlmTool {
  return buildRagSearchTool(ragService, agentKnowledgeScope);
}
