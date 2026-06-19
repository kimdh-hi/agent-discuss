import { Entity, Index, Opt, PrimaryKey, Property } from '@mikro-orm/core';
import { randomUUID } from 'node:crypto';

export type DocumentStatus = 'processing' | 'ready' | 'failed';
export type DocumentStage = 'extracting' | 'embedding';

@Entity({ tableName: 'documents' })
export class Document {
  @PrimaryKey({ type: 'uuid' })
  id: string & Opt = randomUUID();

  @Property({ type: 'uuid' })
  @Index()
  agentId!: string;

  @Property({ type: 'uuid', nullable: true })
  uploadedById?: string;

  @Property({ type: 'string', length: 255, nullable: true })
  uploadedByName?: string;

  @Property({ type: 'string', length: 255 })
  filename!: string;

  @Property({ type: 'string', length: 100 })
  mimeType!: string;

  @Property({ type: 'integer' })
  size!: number;

  @Property({ type: 'string', length: 20 })
  status: DocumentStatus & Opt = 'processing';

  @Property({ type: 'string', length: 20, nullable: true })
  stage?: DocumentStage;

  @Property({ type: 'string', length: 500, nullable: true })
  storageKey?: string;

  @Property({ type: 'string', length: 500, nullable: true })
  error?: string;

  @Property({ type: 'integer' })
  chunkCount: number & Opt = 0;

  @Property({ type: 'datetime' })
  createdAt: Date & Opt = new Date();

  @Property({ type: 'datetime', nullable: true })
  deletedAt?: Date;
}
