import type { SearchHit } from '../../lib/room-sse';
import type { RoomTopicMessage } from '../../lib/types';

export interface RoomToolCall {
  name: string;
  args: Record<string, unknown>;
}

export type DisplayItem =
  | { kind: 'user'; id: string; content: string }
  | { kind: 'note'; id: string; text: string }
  | { kind: 'final'; id: string; text: string; streaming?: boolean }
  | {
      kind: 'turn';
      id: string;
      agentId: string;
      agentName: string;
      round: number;
      role: string;
      content: string;
      done: boolean;
      toolCalls?: RoomToolCall[];
      sources?: SearchHit[];
      timestamp?: string;
    };

export interface RoomDiscussionState {
  items: DisplayItem[];
  status: string | null;
  streaming: boolean;
  error: string | null;
}

export const initialRoomState: RoomDiscussionState = {
  items: [],
  status: null,
  streaming: false,
  error: null,
};

export type RoomAction =
  | { type: 'hydrate'; items: DisplayItem[]; finalText: string | null }
  | { type: 'streamStart' }
  | { type: 'addUser'; id: string; content: string }
  | {
      type: 'turnStart';
      id: string;
      agentId: string;
      agentName: string;
      round: number;
      role: string;
    }
  | { type: 'appendContent'; agentId: string; text: string }
  | { type: 'attachTool'; agentId: string; tool: RoomToolCall }
  | { type: 'attachSource'; agentId: string; hits: SearchHit[] }
  | { type: 'turnEnd'; agentId: string }
  | { type: 'addNote'; id: string; text: string }
  | { type: 'setStatus'; status: string | null }
  | { type: 'setFinal'; id: string; text: string }
  | { type: 'setError'; error: string | null }
  | { type: 'streamSettled' }
  | { type: 'reset' };

function lastOpenTurnIndex(items: DisplayItem[]): number {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.kind === 'turn' && !item.done) return i;
  }
  return -1;
}

function updateOpenTurn(
  items: DisplayItem[],
  updater: (turn: Extract<DisplayItem, { kind: 'turn' }>) => DisplayItem,
): DisplayItem[] {
  const idx = lastOpenTurnIndex(items);
  if (idx === -1) return items;
  const next = [...items];
  const item = next[idx];
  if (item.kind === 'turn') next[idx] = updater(item);
  return next;
}

export function toDisplayItems(messages: RoomTopicMessage[]): DisplayItem[] {
  return messages.flatMap<DisplayItem>((m) => {
    if (m.role === 'user') return [{ kind: 'user', id: m.id, content: m.content }];
    return [
      {
        kind: 'turn',
        id: m.id,
        agentId: m.agentId ?? '',
        agentName: m.agentName ?? (m.role === 'moderator' ? '모더레이터' : '에이전트'),
        round: m.round ?? 0,
        role: m.role,
        content: m.content,
        done: true,
        timestamp: m.createdAt,
      },
    ];
  });
}

export function roomReducer(state: RoomDiscussionState, action: RoomAction): RoomDiscussionState {
  switch (action.type) {
    case 'hydrate': {
      const finalItem = action.finalText
        ? ({ kind: 'final', id: 'final-hydrate', text: action.finalText } as const)
        : null;
      return {
        ...initialRoomState,
        items: finalItem ? [...action.items, finalItem] : action.items,
      };
    }
    case 'streamStart':
      return { ...state, streaming: true, error: null, status: null };
    case 'addUser':
      return {
        ...state,
        items: [...state.items, { kind: 'user', id: action.id, content: action.content }],
      };
    case 'turnStart':
      return {
        ...state,
        status: null,
        items: [
          ...state.items,
          {
            kind: 'turn',
            id: action.id,
            agentId: action.agentId,
            agentName: action.agentName,
            round: action.round,
            role: action.role,
            content: '',
            done: false,
          },
        ],
      };
    case 'appendContent':
      return {
        ...state,
        items: updateOpenTurn(state.items, (t) => ({ ...t, content: t.content + action.text })),
      };
    case 'attachTool':
      return {
        ...state,
        items: updateOpenTurn(state.items, (t) => ({
          ...t,
          toolCalls: [...(t.toolCalls ?? []), action.tool],
        })),
      };
    case 'attachSource':
      return {
        ...state,
        items: updateOpenTurn(state.items, (t) => ({ ...t, sources: action.hits })),
      };
    case 'turnEnd':
      return { ...state, items: updateOpenTurn(state.items, (t) => ({ ...t, done: true })) };
    case 'addNote':
      return {
        ...state,
        items: [...state.items, { kind: 'note', id: action.id, text: action.text }],
      };
    case 'setStatus':
      return { ...state, status: action.status };
    case 'setFinal':
      return {
        ...state,
        items: [...state.items, { kind: 'final', id: action.id, text: action.text }],
        status: null,
      };
    case 'setError':
      return { ...state, error: action.error };
    case 'streamSettled':
      return {
        ...state,
        streaming: false,
        status: null,
        items: state.items.map((it) =>
          it.kind === 'turn' && !it.done ? { ...it, done: true } : it,
        ),
      };
    case 'reset':
      return initialRoomState;
    default:
      return state;
  }
}
