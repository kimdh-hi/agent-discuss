import { Entity, Index, Opt, PrimaryKey, Property } from '@mikro-orm/core';
import { randomUUID } from 'node:crypto';
import { VectorType } from './vector.type';

const EMBEDDING_DIM = Number(process.env.EMBEDDING_DIM || 1536);

@Entity({ tableName: 'document_chunks' })
@Index({ name: 'document_chunks_document_id', properties: ['documentId'] })
@Index({
  name: 'document_chunks_embedding_hnsw',
  expression:
    'create index "document_chunks_embedding_hnsw" on "document_chunks" using hnsw (embedding vector_cosine_ops)',
})
@Index({
  name: 'document_chunks_content_fts',
  expression:
    `create index "document_chunks_content_fts" on "document_chunks" using gin (to_tsvector('simple', content))`,
})
export class DocumentChunk {
  @PrimaryKey({ type: 'uuid' })
  id: string & Opt = randomUUID();

  @Property({ type: 'uuid' })
  documentId!: string;

  @Property({ type: 'text' })
  content!: string;

  @Property({ type: new VectorType(EMBEDDING_DIM), nullable: true })
  embedding?: number[];

  @Property({ type: 'integer' })
  chunkIndex!: number;

  @Property({ type: 'datetime' })
  createdAt: Date & Opt = new Date();
}
