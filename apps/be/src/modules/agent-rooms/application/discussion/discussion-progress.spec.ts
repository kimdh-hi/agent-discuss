import { calibrateClaimProgress, isSimilarIdea } from './discussion-progress';
import type { DiscussionStateType } from './discussion-state';
import type { DecisionCandidate, Issue } from './discussion.types';
import type { ClaimExtraction } from './parsers';

function makeState(overrides: Partial<DiscussionStateType> = {}): DiscussionStateType {
  return {
    turn: 4,
    turnLog: [],
    aborted: false,
    nextSpeakerId: null,
    historySummary: '',
    summarizedUntilTurn: 0,
    brief: null,
    discussionType: 'decision',
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

const framedCandidate: DecisionCandidate = {
  recommendation: '채팅 메시지 조회를 cursor 기반 페이지네이션으로 전환한다',
  conditions: ['기존 offset API와 호환 기간을 둔다'],
  risks: ['클라이언트 전환 시 중복 또는 누락 메시지가 발생할 수 있다'],
  verification: ['동일 createdAt에서 id 보조 정렬로 중복/누락을 검증한다'],
  isCommitted: false,
};

const feedbackIssue: Issue = {
  id: 'feedback',
  title: '사용자 피드백 루프',
  status: 'open',
  claims: ['사용자 피드백을 수집하고 반영하는 과정은 중요하다'],
  risks: [],
  proposals: [],
  lastTouchedTurn: 2,
  revisits: 0,
};

function makeExtraction(overrides: Partial<ClaimExtraction> = {}): ClaimExtraction {
  return {
    issues: [],
    newClaims: 0,
    repeatClaims: 0,
    decisionCandidate: null,
    inconsistencies: [],
    ...overrides,
  };
}

describe('discussion progress calibration', () => {
  it('표현만 바뀐 같은 의견은 유사한 아이디어로 본다', () => {
    expect(isSimilarIdea(
      '사용자 피드백을 수집하고 반영하는 과정은 중요하다',
      '사용자 피드백을 체계적으로 수집하고 이를 반영하는 과정이 중요합니다',
    )).toBe(true);
  });

  it('이미 결론 프레임이 있으면 같은 피드백 루프 변주는 repeat로 보정한다', () => {
    const extraction = makeExtraction({
      issues: [{
        ...feedbackIssue,
        claims: ['사용자 피드백을 체계적으로 수집하고 이를 반영하는 과정이 중요합니다'],
        lastTouchedTurn: 4,
      }],
      newClaims: 2,
      repeatClaims: 0,
    });

    const result = calibrateClaimProgress(
      extraction,
      makeState({ issues: [feedbackIssue], decisionCandidate: framedCandidate }),
    );

    expect(result).toEqual({ newClaims: 0, repeatClaims: 2 });
  });

  it('결론 후보의 비어 있던 risk bucket을 채우면 progress로 인정한다', () => {
    const candidateWithoutRisk = { ...framedCandidate, risks: [] };
    const extraction = makeExtraction({
      decisionCandidate: {
        ...candidateWithoutRisk,
        risks: ['커서 토큰이 노출되면 구현 세부사항이 클라이언트 계약으로 굳을 수 있다'],
      },
      newClaims: 0,
      repeatClaims: 1,
    });

    const result = calibrateClaimProgress(
      extraction,
      makeState({ decisionCandidate: candidateWithoutRisk }),
    );

    expect(result.newClaims).toBe(1);
    expect(result.repeatClaims).toBe(1);
  });

  it('추출기가 구조화 아이디어를 주지 못한 경우에는 repeat로 보정한다', () => {
    const result = calibrateClaimProgress(
      makeExtraction({ newClaims: 1, repeatClaims: 0 }),
      makeState(),
    );

    expect(result).toEqual({ newClaims: 0, repeatClaims: 1 });
  });

  it('주요 쟁점과 무관한 새 issue는 progress로 인정하지 않는다', () => {
    const result = calibrateClaimProgress(
      makeExtraction({
        issues: [{
          id: 'push',
          title: '푸시 알림 과부하',
          status: 'open',
          claims: ['푸시 알림 빈도 제어가 필요하다'],
          risks: [],
          proposals: [],
          lastTouchedTurn: 4,
          revisits: 0,
        }],
        newClaims: 1,
        repeatClaims: 0,
      }),
      makeState({
        brief: {
          objective: 'SSE 스트림 설계',
          deliverable: 'SSE 계약',
          inScope: ['SSE'],
          outOfScope: [],
          requiredDimensions: ['topic/event mapping', 'done/error 이벤트', 'reconnect/retry'],
          rolePlan: [],
        },
      }),
    );

    expect(result).toEqual({ newClaims: 0, repeatClaims: 1 });
  });
});
