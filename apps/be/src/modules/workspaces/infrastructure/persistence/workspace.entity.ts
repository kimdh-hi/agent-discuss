import { defineEntity, p } from '@mikro-orm/core';
import { randomUUID } from 'node:crypto';

const WorkspaceSchema = defineEntity({
  name: 'Workspace',
  tableName: 'workspaces',
  properties: {
    id: p.uuid().primary().onCreate(() => randomUUID()),
    name: p.string(),
    ownerUserId: p.string(),
    createdAt: p.datetime().onCreate(() => new Date()),
  },
});

export class Workspace extends WorkspaceSchema.class {}

WorkspaceSchema.setClass(Workspace);
