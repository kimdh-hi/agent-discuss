import { defineEntity, p } from '@mikro-orm/core';
import { randomUUID } from 'node:crypto';

export type MessageScope = 'agent' | 'room' | 'topic';
export type MessageRole = 'user' | 'agent' | 'moderator';

const MessageSchema = defineEntity({
  name: 'Message',
  tableName: 'messages',
  properties: {
    id: p.uuid().primary().onCreate(() => randomUUID()),
    scope: p.string().$type<MessageScope>(),
    refId: p.string(),
    role: p.string().$type<MessageRole>(),
    agentId: p.string().nullable(),
    round: p.integer().nullable(),
    content: p.text(),
    createdAt: p.datetime().onCreate(() => new Date()),
  },
});

export class Message extends MessageSchema.class {}

MessageSchema.setClass(Message);
