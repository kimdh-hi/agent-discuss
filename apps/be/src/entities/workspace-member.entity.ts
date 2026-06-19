import { Entity, Property, Unique } from '@mikro-orm/core';
import { BaseEntity } from './base.entity';

export type WorkspaceRole = 'owner' | 'member';

@Entity({ tableName: 'workspace_members' })
@Unique({ properties: ['workspaceId', 'userId'] })
export class WorkspaceMember extends BaseEntity {
  @Property({ type: 'string' })
  workspaceId!: string;

  @Property({ type: 'string' })
  userId!: string;

  @Property({ type: 'string' })
  role: WorkspaceRole = 'member';
}
