const COMMAND = '/new';
const EXIT_COMMAND = '/exit';

export type RoomCommand =
  | { type: 'exit' }
  | { type: 'new-topic'; message: string }
  | { type: 'send'; message: string };

export function parseRoomCommand(raw: string): RoomCommand {
  if (raw.startsWith('//')) {
    return { type: 'send', message: raw.slice(1).trim() };
  }
  if (/^\s/.test(raw)) {
    return { type: 'send', message: raw.trim() };
  }
  if (raw.replace(/\s+$/, '') === EXIT_COMMAND || raw.replace(/\s+$/, '') === COMMAND) {
    return { type: 'exit' };
  }
  if (raw.startsWith(`${COMMAND} `)) {
    const message = raw.slice(COMMAND.length).trim();
    if (message.length > 0) return { type: 'new-topic', message };
  }
  return { type: 'send', message: raw.trim() };
}

export interface RoomCommandDef {
  command: string;
  description: string;
}

export const ROOM_COMMANDS: RoomCommandDef[] = [
  { command: COMMAND, description: '새 토픽 시작 · 내용 입력 시 그 내용으로 즉시 시작' },
  { command: EXIT_COMMAND, description: '토픽 나가기 · 진입 화면으로 복귀' },
];

export function matchRoomCommands(raw: string): RoomCommandDef[] {
  if (!raw.startsWith('/') || raw.startsWith('//')) return [];
  if (raw.includes(' ')) return [];
  return ROOM_COMMANDS.filter((c) => c.command.startsWith(raw));
}
