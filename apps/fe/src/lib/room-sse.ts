export interface SearchHit {
  documentId: string;
  filename: string;
  score: number;
  content?: string;
  snippet?: string;
}

export interface RoomStatusEvent {
  type: 'status';
  phase: string;
  detail?: string;
}

export interface RoomTurnEvent {
  type: 'turn';
  phase: 'start' | 'end';
  agentId?: string;
  agentName?: string;
  round?: number;
  role?: 'moderator' | 'agent';
}

export interface RoomContentEvent {
  type: 'content';
  agentId?: string;
  text: string;
}

export interface RoomToolEvent {
  type: 'tool';
  agentId?: string;
  name: string;
  args: Record<string, unknown>;
}

export interface RoomSourceEvent {
  type: 'source';
  agentId?: string;
  hits: SearchHit[];
}

export interface RoomFinalEvent {
  type: 'final';
  text: string;
}

export interface RoomErrorEvent {
  type: 'error';
  message: string;
  code?: string;
}

export interface RoomDoneEvent {
  type: 'done';
  ok: true;
}

export type RoomSseEvent =
  | RoomStatusEvent
  | RoomTurnEvent
  | RoomContentEvent
  | RoomToolEvent
  | RoomSourceEvent
  | RoomFinalEvent
  | RoomErrorEvent
  | RoomDoneEvent;

const KNOWN_TYPES = new Set([
  'status',
  'turn',
  'content',
  'tool',
  'source',
  'final',
  'error',
  'done',
]);

function toEvent(name: string | undefined, json: unknown): RoomSseEvent | null {
  if (!json || typeof json !== 'object') return null;
  const obj = json as Record<string, unknown>;
  const type = typeof obj.type === 'string' ? obj.type : name;
  if (typeof type !== 'string' || !KNOWN_TYPES.has(type)) return null;
  return { ...obj, type } as RoomSseEvent;
}

export function parseRoomSseLine(line: string): RoomSseEvent | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) return null;
  const payload = trimmed.slice(5).trim();
  let json: unknown;
  try {
    json = JSON.parse(payload);
  } catch {
    return null;
  }
  return toEvent(undefined, json);
}

export async function consumeRoomSseStream(
  response: Response,
  onEvent: (event: RoomSseEvent) => void,
): Promise<void> {
  const body = response.body;
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let pendingEventName: string | undefined;

  const handleLine = (line: string): boolean => {
    const trimmed = line.trim();
    if (trimmed.startsWith('event:')) {
      pendingEventName = trimmed.slice(6).trim();
      return false;
    }
    if (trimmed.startsWith('data:')) {
      const payload = trimmed.slice(5).trim();
      let json: unknown;
      try {
        json = JSON.parse(payload);
      } catch {
        pendingEventName = undefined;
        return false;
      }
      const event = toEvent(pendingEventName, json);
      pendingEventName = undefined;
      if (event) {
        onEvent(event);
        if (event.type === 'done') return true;
      }
    }
    return false;
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (handleLine(line)) return;
    }
  }
  if (buffer) handleLine(buffer);
}
