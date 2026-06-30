import { create } from 'zustand';
import { ApiError } from '../../lib/api';
import type { RoomSseEvent } from '../../lib/room-sse';
import { consumeRoomSseStream } from '../../lib/room-sse';
import type { RoomTopic } from '../../lib/types';
import {
  type DisplayItem,
  initialRoomState,
  type RoomAction,
  type RoomDiscussionState,
  roomReducer,
} from './room-state';
import { continueTopic, createTopic, streamTopic } from './room-topic-api';

const STATUS_PHASE_LABELS: Record<string, string> = {
  starting: '토론 시작 중',
  validating: '주제 검토 중',
  defining_agenda: '안건 정리 중',
  moderating: '토론 진행 중',
  pickSpeaker: '다음 발언자 선정 중',
  converging: '결론 정리 중',
  writing_result: '결론 작성 중',
};

function roomStatusLabel(phase: string, detail?: string): string {
  return STATUS_PHASE_LABELS[phase] ?? detail ?? phase;
}

let turnSeq = 0;
const nextId = (prefix: string) => {
  turnSeq += 1;
  return `${prefix}-${turnSeq}`;
};

export const pendingTopicKey = (roomId: string) => `pending:${roomId}`;

export interface RoomSendContext {
  roomId: string;
  onTopicCreated?: (topic: RoomTopic) => void;
  onTopicStatus?: (topicId: string, patch: Partial<RoomTopic>) => void;
  onDone?: (topicId: string) => void;
}

interface RoomRuntimeEntry {
  state: RoomDiscussionState;
  abort: AbortController | null;
}

interface RoomRuntimeStore {
  sessions: Record<string, RoomRuntimeEntry>;
  init: (topicId: string) => void;
  remove: (topicId: string) => void;
  apply: (topicId: string, action: RoomAction) => void;
  hydrate: (topicId: string, items: DisplayItem[], finalText: string | null) => void;
  stop: (topicId: string) => void;
  send: (topicId: string, message: string, ctx: RoomSendContext) => Promise<void>;
  discussNew: (message: string, ctx: RoomSendContext) => Promise<void>;
  reconnect: (topicId: string, ctx: RoomSendContext) => Promise<void>;
}

export const useRoomRuntimeStore = create<RoomRuntimeStore>((set, get) => {
  const apply = (topicId: string, action: RoomAction) => {
    set((s) => {
      const entry = s.sessions[topicId];
      if (!entry) return s;
      return {
        sessions: {
          ...s.sessions,
          [topicId]: { ...entry, state: roomReducer(entry.state, action) },
        },
      };
    });
  };

  const patch = (topicId: string, change: Partial<RoomRuntimeEntry>) => {
    set((s) => {
      const entry = s.sessions[topicId];
      if (!entry) return s;
      return { sessions: { ...s.sessions, [topicId]: { ...entry, ...change } } };
    });
  };

  type KeyRef = { current: string };

  const rekey = (from: string, to: string) => {
    set((s) => {
      const entry = s.sessions[from];
      if (!entry || from === to) return s;
      const next = { ...s.sessions };
      delete next[from];
      next[to] = entry;
      return { sessions: next };
    });
  };

  const onEvent = (keyRef: KeyRef, ctx: RoomSendContext, event: RoomSseEvent) => {
    const topicId = keyRef.current;
    switch (event.type) {
      case 'status':
        if (event.phase === 'pickSpeaker') {
          apply(topicId, {
            type: 'addNote',
            id: nextId('note'),
            text: roomStatusLabel(event.phase, event.detail),
          });
        } else {
          apply(topicId, {
            type: 'setStatus',
            status: roomStatusLabel(event.phase, event.detail),
          });
        }
        break;
      case 'turn':
        if (event.phase === 'start') {
          apply(topicId, {
            type: 'turnStart',
            id: nextId('turn'),
            agentId: event.agentId ?? '',
            agentName: event.agentName ?? (event.role === 'moderator' ? '모더레이터' : '에이전트'),
            round: event.round ?? 0,
            role: event.role ?? 'agent',
          });
        } else {
          apply(topicId, { type: 'turnEnd', agentId: event.agentId ?? '' });
        }
        break;
      case 'content':
        apply(topicId, { type: 'appendContent', agentId: event.agentId ?? '', text: event.text });
        break;
      case 'tool':
        apply(topicId, {
          type: 'attachTool',
          agentId: event.agentId ?? '',
          tool: { name: event.name, args: event.args },
        });
        break;
      case 'source':
        apply(topicId, { type: 'attachSource', agentId: event.agentId ?? '', hits: event.hits });
        break;
      case 'final':
        apply(topicId, { type: 'setFinal', id: nextId('final'), text: event.text });
        ctx.onTopicStatus?.(topicId, { status: 'completed', finalText: event.text });
        break;
      case 'error':
        apply(topicId, { type: 'setError', error: event.message || '오류가 발생했습니다.' });
        ctx.onTopicStatus?.(topicId, { status: 'failed' });
        break;
      case 'done':
        ctx.onTopicStatus?.(topicId, { status: 'completed' });
        ctx.onDone?.(topicId);
        break;
    }
  };

  const consume = async (keyRef: KeyRef, ctx: RoomSendContext, response: Response) => {
    await consumeRoomSseStream(response, (event) => onEvent(keyRef, ctx, event));
  };

  const runStream = async (
    keyRef: KeyRef,
    ctx: RoomSendContext,
    open: (signal: AbortSignal) => Promise<Response>,
  ) => {
    const controller = new AbortController();
    patch(keyRef.current, { abort: controller });
    apply(keyRef.current, { type: 'streamStart' });
    if (keyRef.current !== pendingTopicKey(ctx.roomId)) {
      ctx.onTopicStatus?.(keyRef.current, { status: 'running', finalText: null, completedAt: null });
    }
    try {
      const res = await open(controller.signal);
      await consume(keyRef, ctx, res);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // 사용자 중단: 부분 응답 유지
      } else if (err instanceof ApiError) {
        apply(keyRef.current, { type: 'setError', error: err.message });
        ctx.onTopicStatus?.(keyRef.current, { status: 'failed' });
      } else {
        apply(keyRef.current, { type: 'setError', error: '토론 처리 중 오류가 발생했습니다.' });
        ctx.onTopicStatus?.(keyRef.current, { status: 'failed' });
      }
    } finally {
      patch(keyRef.current, { abort: null });
      apply(keyRef.current, { type: 'streamSettled' });
      ctx.onDone?.(keyRef.current);
    }
  };

  return {
    sessions: {},

    init: (topicId) => {
      set((s) => {
        if (s.sessions[topicId]) return s;
        return { sessions: { ...s.sessions, [topicId]: { state: initialRoomState, abort: null } } };
      });
    },

    remove: (topicId) => {
      set((s) => {
        if (!s.sessions[topicId]) return s;
        const next = { ...s.sessions };
        delete next[topicId];
        return { sessions: next };
      });
    },

    apply,

    hydrate: (topicId, items, finalText) => {
      set((s) => {
        const existing = s.sessions[topicId];
        if (existing && (existing.state.streaming || existing.state.items.length > 0)) return s;
        return {
          sessions: {
            ...s.sessions,
            [topicId]: {
              state: roomReducer(initialRoomState, { type: 'hydrate', items, finalText }),
              abort: null,
            },
          },
        };
      });
    },

    stop: (topicId) => {
      get().sessions[topicId]?.abort?.abort();
    },

    send: async (topicId, message, ctx) => {
      if (!get().sessions[topicId]) return;
      apply(topicId, { type: 'addUser', id: nextId('user'), content: message });
      await runStream({ current: topicId }, ctx, (signal) =>
        continueTopic(ctx.roomId, topicId, message, signal),
      );
    },

    discussNew: async (message, ctx) => {
      const pendingKey = pendingTopicKey(ctx.roomId);
      if (get().sessions[pendingKey]?.state.streaming) return;
      get().remove(pendingKey);
      get().init(pendingKey);
      apply(pendingKey, { type: 'addUser', id: nextId('user'), content: message });

      let topic: RoomTopic;
      try {
        topic = await createTopic(ctx.roomId, message);
      } catch (err) {
        apply(pendingKey, {
          type: 'setError',
          error: err instanceof ApiError ? err.message : '토픽 생성에 실패했습니다.',
        });
        apply(pendingKey, { type: 'streamSettled' });
        return;
      }

      rekey(pendingKey, topic.id);
      get().init(topic.id);
      ctx.onTopicCreated?.(topic);

      const keyRef: KeyRef = { current: topic.id };
      await runStream(keyRef, ctx, (signal) =>
        continueTopic(ctx.roomId, topic.id, message, signal),
      );
    },

    reconnect: async (topicId, ctx) => {
      if (!get().sessions[topicId]) return;
      await runStream({ current: topicId }, ctx, (signal) =>
        streamTopic(ctx.roomId, topicId, signal),
      );
    },
  };
});
