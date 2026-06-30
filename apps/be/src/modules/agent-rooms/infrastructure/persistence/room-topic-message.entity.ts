import { defineEntity, p } from '@mikro-orm/core';
import { randomUUID } from 'node:crypto';
import type { RoomTopicMessageRole } from '../../domain/room';

const RoomTopicMessageSchema = defineEntity({
  name: 'RoomTopicMessage',
  tableName: 'room_topic_messages',
  properties: {
    id: p.uuid().primary().onCreate(() => randomUUID()),
    topicId: p.uuid(),
    role: p.string().$type<RoomTopicMessageRole>(),
    agentId: p.string().nullable(),
    round: p.integer().nullable(),
    content: p.text(),
    createdAt: p.datetime().onCreate(() => new Date()),
  },
});

export class RoomTopicMessage extends RoomTopicMessageSchema.class {}

RoomTopicMessageSchema.setClass(RoomTopicMessage);
