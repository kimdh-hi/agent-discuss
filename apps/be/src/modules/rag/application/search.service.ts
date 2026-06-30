import { Injectable, Logger } from '@nestjs/common';
import { EntityRepository } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { Document } from '../entities';
import { RagLlmService } from './llm/rag-llm.service';
import { SearchHit } from './rag.interfaces';

const RRF_K = 60;
const TOP_K = 5;
const CANDIDATES = 20;
const MIN_VECTOR_SIMILARITY = 0.2;

export function mentionsFilename(text: string, filename: string): boolean {
  const lower = text.toLowerCase();
  const name = filename.toLowerCase();
  if (name.length >= 3 && lower.includes(name)) return true;
  const stem = name.replace(/\.[^.]+$/, '');
  return stem.length >= 3 && lower.includes(stem);
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    @InjectRepository(Document, 'rag') private readonly documentRepository: EntityRepository<Document>,
    private readonly llm: RagLlmService,
  ) {}

  async search(agentId: string, query: string, topK = TOP_K): Promise<SearchHit[]> {
    if (!query.trim()) return [];
    this.logger.log(`rag_search agentId=${agentId} query="${query}"`);
    const [embedding] = await this.llm.embed([query]);
    const conn = this.documentRepository.getEntityManager().getConnection();
    const vectorLiteral = `[${embedding.join(',')}]`;

    const docs = await this.documentRepository.find(
      { agentId, status: 'ready', deletedAt: null },
      { fields: ['id', 'filename'] },
    );
    const mentionedIds = new Set(
      docs.filter((d) => mentionsFilename(query, d.filename)).map((d) => d.id),
    );

    type ChunkRow = {
      id: string;
      content: string;
      document_id: string;
      filename: string;
      similarity: number;
    };

    const vectorRows = (
      (await conn.execute(
        `SELECT c.id, c.content, c.document_id, d.filename,
                1 - (c.embedding <=> ?) AS similarity
         FROM document_chunks c
         JOIN documents d ON d.id = c.document_id
         WHERE d.agent_id = ? AND d.status = 'ready' AND d.deleted_at IS NULL
           AND c.embedding IS NOT NULL
         ORDER BY c.embedding <=> ?
         LIMIT ?`,
        [vectorLiteral, agentId, vectorLiteral, CANDIDATES],
      )) as ChunkRow[]
    ).filter(
      (r) => Number(r.similarity) >= MIN_VECTOR_SIMILARITY || mentionedIds.has(r.document_id),
    );

    if (mentionedIds.size > 0) {
      const ids = [...mentionedIds];
      const placeholders = ids.map(() => '?').join(', ');
      const mentionedRows = (await conn.execute(
        `SELECT c.id, c.content, c.document_id, d.filename,
                1 - (c.embedding <=> ?) AS similarity
         FROM document_chunks c
         JOIN documents d ON d.id = c.document_id
         WHERE c.document_id IN (${placeholders}) AND c.embedding IS NOT NULL
         ORDER BY c.embedding <=> ?
         LIMIT ?`,
        [vectorLiteral, ...ids, vectorLiteral, TOP_K],
      )) as ChunkRow[];
      for (const row of mentionedRows) {
        if (!vectorRows.some((v) => v.id === row.id)) vectorRows.push(row);
      }
    }

    const relevantIds = new Set(vectorRows.map((r) => r.id));

    const ftsRows = (
      (await conn.execute(
        `SELECT c.id, c.content, c.document_id, d.filename,
                ts_rank(to_tsvector('simple', c.content), plainto_tsquery('simple', ?)) AS rank
         FROM document_chunks c
         JOIN documents d ON d.id = c.document_id
         WHERE d.agent_id = ? AND d.status = 'ready' AND d.deleted_at IS NULL
           AND to_tsvector('simple', c.content) @@ plainto_tsquery('simple', ?)
         ORDER BY rank DESC
         LIMIT ?`,
        [query, agentId, query, CANDIDATES],
      )) as { id: string; content: string; document_id: string; filename: string; rank: number }[]
    ).filter((r) => relevantIds.has(r.id));

    const scores = new Map<
      string,
      {
        row: { id: string; content: string; document_id: string; filename: string };
        score: number;
      }
    >();
    const addRanked = (
      rows: { id: string; content: string; document_id: string; filename: string }[],
    ) => {
      rows.forEach((row, idx) => {
        const entry = scores.get(row.id) ?? { row, score: 0 };
        entry.score += 1 / (RRF_K + idx + 1);
        scores.set(row.id, entry);
      });
    };
    addRanked(vectorRows);
    addRanked(ftsRows);

    const results = [...scores.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((e) => ({
        documentId: e.row.document_id,
        filename: e.row.filename,
        snippet: e.row.content.slice(0, 300),
        content: e.row.content,
        score: Number(e.score.toFixed(4)),
      }));
    this.logger.log(`rag_search done hits=${results.length}`);
    return results;
  }
}
