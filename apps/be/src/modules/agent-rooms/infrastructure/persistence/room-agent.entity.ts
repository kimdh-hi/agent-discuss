import { defineEntity, p } from '@mikro-orm/core';
import { randomUUID } from 'node:crypto';

const RoomAgentSchema = defineEntity({
  name: 'RoomAgent',
  tableName: 'room_agents',
  uniques: [{ properties: ['roomId', 'agentId'] }],
  properties: {
    id: p.uuid().primary().onCreate(() => randomUUID()),
    roomId: p.string(),
    agentId: p.string(),
    createdAt: p.datetime().onCreate(() => new Date()),
  },
});

export class RoomAgent extends RoomAgentSchema.class {}

RoomAgentSchema.setClass(RoomAgent);
