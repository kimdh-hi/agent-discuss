import { buildDiscussionContext, buildDiscussionMessages } from './discussion-context';
import type { TurnEntry, Issue, Inconsistency } from './discussion.types';
import { DISCUSSION_LIMITS } from './discussion-limits';

const makeEntry = (role: 'agent' | 'moderator', name: string, content: string, round = 0, agentId?: string): TurnEntry => ({
  role, agentName: name, round, content, agentId,
});

describe('buildDiscussionContext', () => {
  it('turnLog와 historySummary가 모두 없으면 빈 문자열을 반환한다', () => {
    expect(buildDiscussionContext([], '')).toBe('');
  });

  it('historySummary만 있으면 요약만 포함한다', () => {
    const result = buildDiscussionContext([], '이전 요약');
    expect(result).toContain('[이전 논의 요약]');
    expect(result).toContain('이전 요약');
    expect(result).not.toContain('[최근 발언]');
  });

  it('turnLog만 있으면 최근 발언만 포함한다', () => {
    const log = [makeEntry('agent', 'PM', '의견 1')];
    const result = buildDiscussionContext(log, '');
    expect(result).toContain('[최근 발언]');
    expect(result).not.toContain('[이전 논의 요약]');
  });

  it('둘 다 있으면 요약과 최근 발언을 모두 포함한다', () => {
    const log = [makeEntry('agent', 'PM', '의견 1')];
    const result = buildDiscussionContext(log, '이전 요약');
    expect(result).toContain('[이전 논의 요약]');
    expect(result).toContain('[최근 발언]');
  });

  it(`최근 ${DISCUSSION_LIMITS.compactKeepTurns}개 턴만 포함한다`, () => {
    const many = Array.from({ length: DISCUSSION_LIMITS.compactKeepTurns + 5 }, (_, i) =>
      makeEntry('agent', 'PM', `발언 ${i}`, i),
    );
    const result = buildDiscussionContext(many, '');
    // 마지막 발언은 포함, 초반 발언은 포함 안 됨
    expect(result).toContain(`발언 ${many.length - 1}`);
    expect(result).not.toContain('발언 0');
  });

  it('keepTurns 인자를 명시하면 해당 값으로 윈도우를 조정한다', () => {
    const many = Array.from({ length: 10 }, (_, i) => makeEntry('agent', 'PM', `발언 ${i}`, i));
    const result = buildDiscussionContext(many, '', 2);
    expect(result).toContain('발언 9');
    expect(result).toContain('발언 8');
    expect(result).not.toContain('발언 7');
  });
});

describe('buildDiscussionMessages', () => {
  it('빈 입력이면 빈 배열을 반환한다', () => {
    const msgs = buildDiscussionMessages([], '', 'a1', [], []);
    expect(msgs).toHaveLength(0);
  });

  it('historySummary가 있으면 선두 user 메시지로 포함한다', () => {
    const msgs = buildDiscussionMessages([], '이전 요약', 'a1', [], []);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.role).toBe('user');
    expect(msgs[0]?.content).toContain('이전 요약');
  });

  it('자기 발언(currentAgentId 일치)은 assistant 역할로 매핑한다', () => {
    const log = [makeEntry('agent', 'PM', '내 발언', 1, 'a1')];
    const msgs = buildDiscussionMessages(log, '', 'a1', [], []);
    const assistantMsg = msgs.find((m) => m.role === 'assistant');
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg?.content).toBe('내 발언');
  });

  it('타인 발언은 user 역할로 [이름]: ... 형식으로 매핑한다', () => {
    const log = [makeEntry('agent', '개발자', '타인 발언', 1, 'a2')];
    const msgs = buildDiscussionMessages(log, '', 'a1', [], []);
    const userMsg = msgs.find((m) => m.role === 'user');
    expect(userMsg).toBeDefined();
    expect(userMsg?.content).toContain('[개발자]');
    expect(userMsg?.content).toContain('타인 발언');
  });

  it('moderator 발언은 user 역할로 [진행자]: ... 형식으로 매핑한다', () => {
    const log = [makeEntry('moderator', '진행자', '진행자 발언', 1)];
    const msgs = buildDiscussionMessages(log, '', 'a1', [], []);
    const userMsg = msgs.find((m) => m.role === 'user');
    expect(userMsg).toBeDefined();
    expect(userMsg?.content).toContain('[진행자]');
  });

  it('열린 쟁점이 있으면 컨텍스트 메시지에 포함된다', () => {
    const issues: Issue[] = [{
      id: 'i1', title: '주요 쟁점', status: 'open',
      claims: ['주장 A'], risks: [], proposals: [], lastTouchedTurn: 1, revisits: 0,
    }];
    const msgs = buildDiscussionMessages([], '요약', 'a1', issues, []);
    expect(msgs[0]?.content).toContain('[열린 쟁점]');
    expect(msgs[0]?.content).toContain('주요 쟁점');
  });

  it('미해소 모순이 있으면 컨텍스트 메시지에 포함된다', () => {
    const inconsistencies: Inconsistency[] = [{
      id: 'c1', description: '수치 불일치', kind: 'arithmetic', turn: 1, resolved: false,
    }];
    const msgs = buildDiscussionMessages([], '요약', 'a1', [], inconsistencies);
    expect(msgs[0]?.content).toContain('[미해소 모순]');
    expect(msgs[0]?.content).toContain('수치 불일치');
  });

  it('keepTurns 인자로 윈도우를 제어한다', () => {
    const log = Array.from({ length: 10 }, (_, i) =>
      makeEntry('agent', 'PM', `발언 ${i}`, i, 'a2'),
    );
    const msgs = buildDiscussionMessages(log, '', 'a1', [], [], 2);
    const turnMsgs = msgs.filter((m) => m.role === 'user' && m.content.includes('[PM]'));
    expect(turnMsgs).toHaveLength(2);
    expect(turnMsgs[0]?.content).toContain('발언 8');
    expect(turnMsgs[1]?.content).toContain('발언 9');
  });

  it('system 역할 메시지는 생성하지 않는다', () => {
    const log = [makeEntry('agent', 'PM', '발언', 1, 'a1')];
    const msgs = buildDiscussionMessages(log, '요약', 'a1', [], []);
    expect(msgs.every((m) => m.role !== 'system')).toBe(true);
  });
});
