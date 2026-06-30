import { LlmTool } from '../../../../common/ai/llm/llm.types';
import { RagService } from '../../../rag/application/rag.service';
import { buildRagSearchTool } from '../../../rag/application/rag.tool';

const BUILDERS: Record<string, (rag: RagService, agentId: string) => LlmTool> = {
  rag_search: (rag, agentId) => buildRagSearchTool(rag, agentId),
};

export const DEFAULT_AGENT_TOOLS = ['rag_search'];

export function buildToolsForAgent(
  agent: { id: string; tools?: string[] | null },
  rag: RagService,
): LlmTool[] {
  const keys = agent.tools ?? DEFAULT_AGENT_TOOLS;
  return keys
    .map((key) => BUILDERS[key])
    .filter((builder): builder is (rag: RagService, agentId: string) => LlmTool => !!builder)
    .map((builder) => builder(rag, agent.id));
}
