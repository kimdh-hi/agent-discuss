import { defineEntity, p } from '@mikro-orm/core';
import { randomUUID } from 'node:crypto';

const AgentSchema = defineEntity({
  name: 'Agent',
  tableName: 'agents',
  properties: {
    id: p.uuid().primary().onCreate(() => randomUUID()),
    workspaceId: p.string(),
    name: p.string(),
    instructions: p.text(),
    description: p.text().nullable(),
    model: p.string(),
    tools: p.json<string[]>().nullable(),
    maxToolIterations: p.integer().nullable(),
    createdAt: p.datetime().onCreate(() => new Date()),
  },
});

export class Agent extends AgentSchema.class {}

AgentSchema.setClass(Agent);
