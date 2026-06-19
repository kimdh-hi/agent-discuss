import {
  buildDiscussionContext,
  entriesNeedingSummary,
  lastSummarizedTurn,
} from './discussion-context';
import { TurnEntry } from './orchestrator.types';

function turn(round: number, content = `발언 ${round}`): TurnEntry {
  return {
    role: 'agent',
    agentId: `agent-${round}`,
    agentName: `에이전트 ${round}`,
    round,
    content,
  };
}

describe('discussion context', () => {
  it('keeps only recent turns as raw turn log when a memory summary exists', () => {
    const turnLog = [turn(1, '오래된 원문'), turn(2), turn(3), turn(4), turn(5)];

    const context = buildDiscussionContext({
      turnLog,
      historySummary: '오래된 발언은 요약됨',
      summarizedUntilTurn: 1,
    });

    expect(context.text).toContain('[요약된 이전 토론]');
    expect(context.text).toContain('오래된 발언은 요약됨');
    expect(context.text).toContain('[최근 발언 원문]');
    expect(context.text).not.toContain('오래된 원문');
    expect(context.text).toContain('(R2) 에이전트 2: 발언 2');
    expect(context.text).toContain('(R5) 에이전트 5: 발언 5');
  });

  it('selects only uncompacted entries outside the recent turn window', () => {
    const turnLog = [turn(1), turn(2), turn(3), turn(4), turn(5), turn(6)];

    expect(entriesNeedingSummary({ turnLog, summarizedUntilTurn: 0 }).map((t) => t.round)).toEqual([1, 2]);
    expect(entriesNeedingSummary({ turnLog, summarizedUntilTurn: 1 }).map((t) => t.round)).toEqual([2]);
  });

  it('does not mutate the full turn log used for persistence', () => {
    const turnLog = [turn(1), turn(2), turn(3), turn(4), turn(5)];
    const snapshot = turnLog.slice();

    buildDiscussionContext({ turnLog, historySummary: '요약', summarizedUntilTurn: 1 });

    expect(turnLog).toEqual(snapshot);
    expect(lastSummarizedTurn([turn(1), turn(2)], 0)).toBe(2);
  });
});
