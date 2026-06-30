import { renderTurnLog, lastSpeakerId } from './turn-log';
import type { TurnEntry } from './discussion.types';

const entries: TurnEntry[] = [
  { role: 'moderator', agentName: '진행자', round: 0, content: '토론을 시작합니다.' },
  { role: 'agent', agentId: 'agent-1', agentName: 'PM', round: 1, content: 'PM 의견입니다.' },
  { role: 'agent', agentId: 'agent-2', agentName: '백엔드', round: 2, content: '백엔드 의견입니다.' },
];

describe('renderTurnLog', () => {
  it('모든 엔트리를 렌더링한다', () => {
    const result = renderTurnLog(entries);
    expect(result).toContain('[Turn 0] 진행자');
    expect(result).toContain('[Turn 1] PM');
    expect(result).toContain('[Turn 2] 백엔드');
  });

  it('빈 배열이면 빈 문자열을 반환한다', () => {
    expect(renderTurnLog([])).toBe('');
  });
});

describe('lastSpeakerId', () => {
  it('마지막 에이전트 id를 반환한다', () => {
    expect(lastSpeakerId(entries)).toBe('agent-2');
  });

  it('에이전트 엔트리가 없으면 null을 반환한다', () => {
    const moderatorOnly: TurnEntry[] = [
      { role: 'moderator', agentName: '진행자', round: 0, content: '안녕' },
    ];
    expect(lastSpeakerId(moderatorOnly)).toBeNull();
  });

  it('빈 배열이면 null을 반환한다', () => {
    expect(lastSpeakerId([])).toBeNull();
  });
});
