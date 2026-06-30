import { Entity, Property } from '@mikro-orm/core';
import { BaseEntity } from './base.entity';

@Entity({ tableName: 'rooms' })
export class Room extends BaseEntity {
  @Property({ type: 'string' })
  workspaceId!: string;

  @Property({ type: 'string' })
  name!: string;
}
