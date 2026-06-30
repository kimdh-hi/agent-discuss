import { defineEntity, p } from '@mikro-orm/core';
import { randomUUID } from 'node:crypto';

export type DocumentStatus = 'processing' | 'ready' | 'failed';
export type DocumentStage = 'extracting' | 'embedding';

const DocumentSchema = defineEntity({
  name: 'Document',
  tableName: 'documents',
  properties: {
    id: p.uuid().primary().onCreate(() => randomUUID()),
    agentId: p.uuid().index(),
    uploadedById: p.uuid().nullable(),
    uploadedByName: p.string().length(255).nullable(),
    filename: p.string().length(255),
    mimeType: p.string().length(100),
    size: p.integer(),
    status: p.string().length(20).$type<DocumentStatus>().default('processing'),
    stage: p.string().length(20).$type<DocumentStage>().nullable(),
    storageKey: p.string().length(500).nullable(),
    error: p.string().length(500).nullable(),
    chunkCount: p.integer().default(0),
    createdAt: p.datetime().onCreate(() => new Date()),
    deletedAt: p.datetime().nullable(),
  },
});

export class Document extends DocumentSchema.class {}

DocumentSchema.setClass(Document);
