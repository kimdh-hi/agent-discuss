import { Entity, Property } from '@mikro-orm/core';
import { BaseEntity } from './base.entity';

export type RoomTopicStatus = 'open' | 'running' | 'completed' | 'failed';

@Entity({ tableName: 'room_topics' })
export class RoomTopic extends BaseEntity {
  @Property({ type: 'string' })
  roomId!: string;

  @Property({ type: 'string' })
  title!: string;

  @Property({ type: 'string' })
  status: RoomTopicStatus = 'open';

  @Property({ type: 'text', nullable: true })
  finalText?: string | null;

  @Property({ type: 'datetime', nullable: true })
  completedAt?: Date | null;
}
