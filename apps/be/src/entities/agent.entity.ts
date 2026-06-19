import { Entity, Property } from '@mikro-orm/core';
import { BaseEntity } from './base.entity';

@Entity({ tableName: 'agents' })
export class Agent extends BaseEntity {
  @Property({ type: 'string' })
  workspaceId!: string;

  @Property({ type: 'string' })
  name!: string;

  @Property({ type: 'text' })
  instructions!: string;

  @Property({ type: 'text', nullable: true })
  description?: string;

  @Property({ type: 'string' })
  model!: string;

  @Property({ type: 'json', nullable: true })
  tools?: string[];

  @Property({ type: 'integer', nullable: true })
  maxToolIterations?: number;
}
