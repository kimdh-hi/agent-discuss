import {
  assessContribution,
  effectiveProgressForAssessment,
  isSubstantiveText,
} from './substantive';
import type { DiscussionStateType } from './discussion-state';

function makeState(overrides: Partial<DiscussionStateType> = {}): DiscussionStateType {
  return {
    turn: 1,
    turnLog: [],
    aborted: false,
    nextSpeakerId: null,
    historySummary: '',
    summarizedUntilTurn: 0,
    brief: null,
    discussionType: 'brainstorm',
    outputContract: [],
    options: [],
    issues: [],
    inconsistencies: [],
    participantStats: {},
    decisionCandidate: null,
    droughtCount: 0,
    barrenStreak: 0,
    terminalReason: null,
    ...overrides,
  };
}

describe('isSubstantiveText', () => {
  it('빈 문자열은 false이다', () => {
    expect(isSubstantiveText('')).toBe(false);
  });

  it('공백만 있으면 false이다', () => {
    expect(isSubstantiveText('   \n  ')).toBe(false);
  });

  it('실질 내용이 있으면 true이다', () => {
    expect(isSubstantiveText('cursor 기반 전환에 앞서 호환 기간을 먼저 정해야 합니다.')).toBe(true);
  });

  it('단순 숫자만 있어도 true이다', () => {
    expect(isSubstantiveText('42')).toBe(true);
  });
});

describe('assessContribution', () => {
  const emptyExtraction = {
    issues: [],
    newClaims: 0,
    repeatClaims: 0,
    decisionCandidate: null,
    inconsistencies: [],
  };

  it('공백 발언은 empty로 판정한다', () => {
    expect(assessContribution({
      speech: '   ',
      extraction: emptyExtraction,
      state: makeState(),
      progress: { newClaims: 0, repeatClaims: 0 },
    })).toBe('empty');
  });

  it('추출된 쟁점이 모두 out_of_scope이면 off_topic으로 판정한다', () => {
    const assessment = assessContribution({
      speech: '이번 결론과 무관한 사이드 토픽입니다.',
      extraction: {
        ...emptyExtraction,
        issues: [{
          id: 'issue-1',
          title: '사이드 토픽',
          status: 'out_of_scope' as const,
          claims: ['무관한 주장'],
          risks: [],
          proposals: [],
          lastTouchedTurn: 1,
          revisits: 0,
        }],
      },
      state: makeState(),
      progress: { newClaims: 1, repeatClaims: 0 },
    });

    expect(assessment).toBe('off_topic');
    expect(effectiveProgressForAssessment(assessment, { newClaims: 1, repeatClaims: 0 })).toEqual({
      newClaims: 0,
      repeatClaims: 1,
    });
  });

  it('brief.outOfScope와 겹치면 off_topic으로 판정한다', () => {
    expect(assessContribution({
      speech: '제외 영역에 대한 일반론을 확장합니다.',
      extraction: emptyExtraction,
      state: makeState({
        brief: {
          objective: '목표',
          deliverable: '결론',
          inScope: ['핵심 범위'],
          outOfScope: ['제외 영역'],
          requiredDimensions: [],
          rolePlan: [],
        },
      }),
      progress: { newClaims: 1, repeatClaims: 0 },
    })).toBe('off_topic');
  });

  it('새 claim이 없고 반복 claim이 있으면 repeat로 판정한다', () => {
    expect(assessContribution({
      speech: '이미 나온 결론을 다시 말합니다.',
      extraction: { ...emptyExtraction, repeatClaims: 1 },
      state: makeState(),
      progress: { newClaims: 0, repeatClaims: 1 },
    })).toBe('repeat');
  });

  it('주요 쟁점 기준과 무관한 새 issue는 off_topic으로 판정한다', () => {
    expect(assessContribution({
      speech: '푸시 알림 빈도 제어도 같이 설계해야 합니다.',
      extraction: {
        ...emptyExtraction,
        issues: [{
          id: 'issue-1',
          title: '푸시 알림 빈도',
          status: 'open' as const,
          claims: ['모바일 푸시 알림 과부하를 줄여야 한다'],
          risks: [],
          proposals: [],
          lastTouchedTurn: 1,
          revisits: 0,
        }],
        newClaims: 1,
      },
      state: makeState({
        brief: {
          objective: 'SSE 스트림 설계를 확정한다',
          deliverable: 'SSE 계약',
          inScope: ['SSE 이벤트'],
          outOfScope: [],
          requiredDimensions: ['topic/event mapping', 'done/error 이벤트', 'reconnect/retry'],
          rolePlan: [],
        },
      }),
      progress: { newClaims: 0, repeatClaims: 1 },
    })).toBe('off_topic');
  });

});
