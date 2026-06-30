import { defineEntity, p } from '@mikro-orm/core';
import { randomUUID } from 'node:crypto';
import { VectorType } from './vector.type';

const EMBEDDING_DIM = Number(process.env.EMBEDDING_DIM || 1536);

const DocumentChunkSchema = defineEntity({
  name: 'DocumentChunk',
  tableName: 'document_chunks',
  indexes: [
    { name: 'document_chunks_document_id', properties: ['documentId'] },
    {
      name: 'document_chunks_embedding_hnsw',
      expression:
        'create index "document_chunks_embedding_hnsw" on "document_chunks" using hnsw (embedding vector_cosine_ops)',
    },
    {
      name: 'document_chunks_content_fts',
      expression:
        `create index "document_chunks_content_fts" on "document_chunks" using gin (to_tsvector('simple', content))`,
    },
  ],
  properties: {
    id: p.uuid().primary().onCreate(() => randomUUID()),
    documentId: p.uuid(),
    content: p.text(),
    embedding: p.type(new VectorType(EMBEDDING_DIM)).$type<number[]>().nullable(),
    chunkIndex: p.integer(),
    createdAt: p.datetime().onCreate(() => new Date()),
  },
});

export class DocumentChunk extends DocumentChunkSchema.class {}

DocumentChunkSchema.setClass(DocumentChunk);
