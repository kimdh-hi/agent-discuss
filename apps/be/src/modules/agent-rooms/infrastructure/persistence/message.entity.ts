import { Entity, Property } from '@mikro-orm/core';
import { BaseEntity } from './base.entity';

export type MessageScope = 'agent' | 'room' | 'topic';
export type MessageRole = 'user' | 'agent' | 'moderator';

@Entity({ tableName: 'messages' })
export class Message extends BaseEntity {
  @Property({ type: 'string' })
  scope!: MessageScope;

  @Property({ type: 'string' })
  refId!: string;

  @Property({ type: 'string' })
  role!: MessageRole;

  @Property({ type: 'string', nullable: true })
  agentId?: string;

  @Property({ type: 'integer', nullable: true })
  round?: number;

  @Property({ type: 'text' })
  content!: string;
}
