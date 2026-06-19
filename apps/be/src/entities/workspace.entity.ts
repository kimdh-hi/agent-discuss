import { Entity, Property } from '@mikro-orm/core';
import { BaseEntity } from './base.entity';

@Entity({ tableName: 'workspaces' })
export class Workspace extends BaseEntity {
  @Property({ type: 'string' })
  name!: string;

  @Property({ type: 'string' })
  ownerUserId!: string;
}
