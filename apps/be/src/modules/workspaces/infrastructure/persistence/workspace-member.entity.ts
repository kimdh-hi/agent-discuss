import { defineEntity, p } from '@mikro-orm/core';
import { randomUUID } from 'node:crypto';

export type WorkspaceRole = 'owner' | 'member';

const WorkspaceMemberSchema = defineEntity({
  name: 'WorkspaceMember',
  tableName: 'workspace_members',
  uniques: [{ properties: ['workspaceId', 'userId'] }],
  properties: {
    id: p.uuid().primary().onCreate(() => randomUUID()),
    workspaceId: p.string(),
    userId: p.string(),
    role: p.string().$type<WorkspaceRole>().default('member'),
    createdAt: p.datetime().onCreate(() => new Date()),
  },
});

export class WorkspaceMember extends WorkspaceMemberSchema.class {}

WorkspaceMemberSchema.setClass(WorkspaceMember);
