import { defineEntity, p } from '@mikro-orm/core';
import { randomUUID } from 'node:crypto';

const RoomSchema = defineEntity({
  name: 'Room',
  tableName: 'rooms',
  properties: {
    id: p.uuid().primary().onCreate(() => randomUUID()),
    workspaceId: p.string(),
    name: p.string(),
    createdAt: p.datetime().onCreate(() => new Date()),
  },
});

export class Room extends RoomSchema.class {}

RoomSchema.setClass(Room);
