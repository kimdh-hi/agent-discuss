import { Entity, Property, Unique } from '@mikro-orm/core';
import { BaseEntity } from './base.entity';

@Entity({ tableName: 'room_agents' })
@Unique({ properties: ['roomId', 'agentId'] })
export class RoomAgent extends BaseEntity {
  @Property({ type: 'string' })
  roomId!: string;

  @Property({ type: 'string' })
  agentId!: string;
}
