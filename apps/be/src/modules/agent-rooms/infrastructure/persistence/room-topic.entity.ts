import { defineEntity, p } from '@mikro-orm/core';
import { randomUUID } from 'node:crypto';
import type { DiscussionSnapshot } from '../../domain/discussion';

export type RoomTopicStatus = 'open' | 'running' | 'completed' | 'failed';

const RoomTopicSchema = defineEntity({
  name: 'RoomTopic',
  tableName: 'room_topics',
  properties: {
    id: p.uuid().primary().onCreate(() => randomUUID()),
    roomId: p.string(),
    title: p.string(),
    status: p.string().$type<RoomTopicStatus>().default('open'),
    finalText: p.text().nullable(),
    completedAt: p.datetime().nullable(),
    runState: p.json<DiscussionSnapshot>().nullable(),
    createdAt: p.datetime().onCreate(() => new Date()),
  },
});

export class RoomTopic extends RoomTopicSchema.class {}

RoomTopicSchema.setClass(RoomTopic);
