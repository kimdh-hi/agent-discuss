import type { DiscussionSnapshot } from './discussion';

export type RoomTopicStatus = 'open' | 'running' | 'completed' | 'failed';
export type RoomTopicMessageRole = 'user' | 'agent' | 'moderator';

export interface MutableRoomTopic {
  status: RoomTopicStatus;
  finalText?: string | null;
  completedAt?: Date | null;
  runState?: DiscussionSnapshot | null;
}

export function startRoomTopicRun(topic: MutableRoomTopic): void {
  topic.status = 'running';
  topic.finalText = null;
  topic.completedAt = null;
}

export function markRoomTopicFailed(topic: MutableRoomTopic): void {
  topic.status = 'failed';
}

export function completeRoomTopic(topic: MutableRoomTopic, finalText: string | null, now = new Date()): void {
  topic.status = 'completed';
  topic.finalText = finalText;
  topic.completedAt = now;
}

export function saveRoomTopicState(topic: MutableRoomTopic, snapshot: DiscussionSnapshot): void {
  topic.runState = snapshot;
}
