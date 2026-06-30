import { z } from 'zod';
import { LlmTool } from '../../../common/ai/llm/llm.types';
import { RagService } from './rag.service';

const MAX_QUERIES = 4;

export function buildRagSearchTool(rag: RagService, agentId: string): LlmTool {
  return {
    name: 'rag_search',
    description:
      'Search reference knowledge in the documents uploaded to this agent. Call it when an answer needs supporting evidence or fact-checking. For a complex question, split it into 2-4 key sub-queries and send them at once; for a simple one, send just a single query.',
    schema: z.object({
      queries: z
        .array(z.string())
        .min(1)
        .max(MAX_QUERIES)
        .describe('Key keywords or questions to search. If they cover different aspects, split them into several.'),
    }),
    async execute(args) {
      const queries = normalizeQueries(args.queries);
      if (queries.length === 0) return { content: 'The search query is empty.', meta: [] };

      const hits = await rag.searchMany(agentId, queries);
      if (hits.length === 0) return { content: 'No relevant material found', meta: [] };

      const content = hits
        .map((h, i) => `[${i + 1}] (${h.filename}) ${h.content}`)
        .join('\n');
      return { content, meta: hits };
    },
  };
}

function normalizeQueries(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [raw];
  const seen = new Set<string>();
  const queries: string[] = [];
  for (const item of list) {
    const query = String(item ?? '').trim();
    if (!query || seen.has(query)) continue;
    seen.add(query);
    queries.push(query);
    if (queries.length >= MAX_QUERIES) break;
  }
  return queries;
}
