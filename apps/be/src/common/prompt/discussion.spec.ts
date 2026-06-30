import {
  MODERATOR,
  buildValidateTopicPrompt,
  buildDefineAgendaPrompt,
  buildSpeakSystemPrompt,
  buildResummarizePrompt,
  buildPickSpeakerPrompt,
  buildUpdateIssuesPrompt,
  buildCompactHistoryPrompt,
  buildDraftConclusionPrompt,
  buildWriteResultPrompt,
  buildSpeakRetryPrompt,
} from './discussion';
import type { RoomAgentSpec, Issue } from '../../modules/agent-rooms/application/discussion/discussion.types';

const agent: RoomAgentSpec = {
  id: 'a1',
  name: 'PM',
  instructions: 'PM 역할',
  model: 'gpt-4o',
};

const agents: RoomAgentSpec[] = [
  agent,
  { id: 'a2', name: '개발자', instructions: '개발자 역할', model: 'gpt-4o' },
];

const openIssue: Issue = {
  id: 'issue-1-1',
  title: '성능 이슈',
  status: 'open',
  claims: ['응답이 느리다'],
  risks: [],
  proposals: [],
  lastTouchedTurn: 1,
  revisits: 0,
};

const decidableIssue: Issue = {
  id: 'issue-2-1',
  title: '보안 이슈',
  status: 'decidable',
  claims: ['인증 강화 필요'],
  risks: [],
  proposals: ['JWT 도입'],
  lastTouchedTurn: 2,
  revisits: 1,
};

describe('common/prompt/discussion', () => {
  describe('MODERATOR', () => {
    it('진행자 상수가 정의되어 있다', () => {
      expect(MODERATOR).toBe('진행자');
    });
  });

  describe('buildValidateTopicPrompt', () => {
    it('토픽과 에이전트 이름을 포함한다', () => {
      const result = buildValidateTopicPrompt('AI 도입', ['PM', '개발자']);
      expect(result).toContain('AI 도입');
      expect(result).toContain('PM');
      expect(result).toContain('개발자');
    });

    it('JSON 응답 형식을 지시한다', () => {
      const result = buildValidateTopicPrompt('주제', ['PM']);
      expect(result).toContain('"valid"');
      expect(result).toContain('true');
      expect(result).toContain('false');
      expect(result).toContain('JSON');
    });

    it('인사/테스트/잡문 거부와 정상 주제 허용 예시를 포함한다', () => {
      const result = buildValidateTopicPrompt('hello', ['PM']);
      expect(result).toContain('"hello"');
      expect(result).toContain('"안녕"');
      expect(result).toContain('"test"');
      expect(result).toContain('"valid": false');
      expect(result).toContain('신규 결제 모듈 도입 검토');
      expect(result).toContain('"valid": true');
    });
  });

  describe('buildDefineAgendaPrompt', () => {
    it('토픽과 참가자 목록을 포함한다', () => {
      const result = buildDefineAgendaPrompt('AI 도입', agents);
      expect(result).toContain('AI 도입');
      expect(result).toContain('PM');
      expect(result).toContain('개발자');
    });

    it('discussionType 선택지를 포함한다', () => {
      const result = buildDefineAgendaPrompt('주제', agents);
      expect(result).toContain('decision');
      expect(result).toContain('review');
      expect(result).toContain('brainstorm');
      expect(result).toContain('risk_check');
    });
  });

  describe('buildSpeakSystemPrompt', () => {
    it('에이전트 이름과 역할 지침을 포함한다', () => {
      const result = buildSpeakSystemPrompt(agent, '주제', agents);
      expect(result).toContain('PM');
      expect(result).toContain('PM 역할');
    });

    it('참가자 목록 전체를 포함한다', () => {
      const result = buildSpeakSystemPrompt(agent, '주제', agents);
      expect(result).toContain('a1');
      expect(result).toContain('a2');
      expect(result).toContain('개발자');
    });

    it('수렴 압력 hint가 있으면 포함한다', () => {
      const result = buildSpeakSystemPrompt(agent, '주제', agents, [], [], null, '마무리 압박');
      expect(result).toContain('마무리 압박');
    });

    it('수렴 압력 hint가 없으면 압박 문구가 없다', () => {
      const result = buildSpeakSystemPrompt(agent, '주제', agents);
      expect(result).not.toContain('[중요]');
    });

    it('역할 규칙을 포함하고 턴 제어 필드는 노출하지 않는다', () => {
      const result = buildSpeakSystemPrompt(agent, '주제', agents);
      expect(result).toContain('자신의 역할 렌즈');
      expect(result).toContain('한 턴에는 새 주장 1개');
      expect(result).toContain('반복하지 마세요');
      expect(result).toContain('조기 결론');
      expect(result).toContain('의견 본문만 포함');
      expect(result).not.toContain('signal_turn');
      expect(result).not.toContain('yieldTo');
      expect(result).not.toContain('passReason');
      expect(result).not.toContain('done=true');
    });

    it('입력에 없는 상태·수치를 임의 생성하지 말라는 지시를 포함한다', () => {
      const result = buildSpeakSystemPrompt(agent, '주제', agents);
      expect(result).toContain('임의로 만들지 말고');
      expect(result).toContain('확인 필요');
    });

    it('발언 길이를 고정된 문장 수로 제한하지 않는다', () => {
      const result = buildSpeakSystemPrompt(agent, '주제', agents);
      expect(result).not.toContain('3-5문장');
      expect(result).toContain('논점의 복잡도');
      expect(result).toContain('1-2문장');
      expect(result).toContain('더 길게 설명');
    });

    it('이미 형성된 쟁점과 결론 후보가 있으면 반복 방지를 유도한다', () => {
      const candidate = {
        recommendation: '도입한다',
        conditions: ['성능 검증'],
        risks: ['전환 비용'],
        verification: ['부하 테스트'],
        isCommitted: false,
      };
      const result = buildSpeakSystemPrompt(agent, '주제', agents, [openIssue], [], candidate);
      expect(result).toContain('이미 제기된 쟁점');
      expect(result).toContain('성능 이슈');
      expect(result).toContain('현재 결론 후보');
      expect(result).toContain('같은 내용을 반복하지 말고');
      expect(result).not.toContain('done=true');
    });
  });

  describe('buildSpeakRetryPrompt', () => {
    it('재요청도 고정된 문장 수를 요구하지 않는다', () => {
      const result = buildSpeakRetryPrompt();
      expect(result).not.toContain('3-5문장');
      expect(result).toContain('논점의 복잡도');
    });
  });

  describe('buildResummarizePrompt', () => {
    it('maxChars 목표 글자수를 포함한다', () => {
      const result = buildResummarizePrompt('기존 요약 텍스트', 500);
      expect(result).toContain('500');
    });

    it('원본 텍스트를 포함한다', () => {
      const result = buildResummarizePrompt('기존 요약 텍스트', 500);
      expect(result).toContain('기존 요약 텍스트');
    });

    it('구조화 섹션 키워드와 보존 지시를 포함한다', () => {
      const result = buildResummarizePrompt('텍스트', 1000);
      expect(result).toContain('[결정]');
      expect(result).toContain('[근거]');
      expect(result).toContain('[열린 쟁점]');
      expect(result).toContain('[미해결 질문]');
    });
  });

  describe('buildPickSpeakerPrompt', () => {
    it('토픽과 에이전트 목록을 포함한다', () => {
      const result = buildPickSpeakerPrompt('주제', agents, '맥락', [], 'a1');
      expect(result).toContain('주제');
      expect(result).toContain('a1');
      expect(result).toContain('a2');
    });

    it('열린 쟁점 목록을 포함한다', () => {
      const result = buildPickSpeakerPrompt('주제', agents, '맥락', [openIssue], null);
      expect(result).toContain('성능 이슈');
    });

    it('lastSpeakerId가 null이면 "없음"을 표시한다', () => {
      const result = buildPickSpeakerPrompt('주제', agents, '맥락', [], null);
      expect(result).toContain('없음');
    });

    it('서로 다른 역할 관점의 새 기여를 우선 지명하도록 지시한다', () => {
      const result = buildPickSpeakerPrompt('주제', agents, '맥락', [openIssue], 'a1');
      expect(result).toContain('서로 다른 역할 관점');
      expect(result).toContain('새 기여');
    });

    it('포화 참가자는 새 공백을 메울 때만 재지명하도록 지시한다', () => {
      const result = buildPickSpeakerPrompt('주제', agents, '맥락', [openIssue], 'a1');
      expect(result).toContain('포화 참가자');
      expect(result).toContain('검증 공백');
    });

    it('선택지, 현재 결론 후보, 수렴 압력을 포함한다', () => {
      const result = buildPickSpeakerPrompt(
        '주제',
        agents,
        '맥락',
        [openIssue],
        'a1',
        ['offset 유지', 'cursor 전환'],
        {
          recommendation: 'cursor 전환',
          conditions: ['호환 기간'],
          risks: ['직접 이동 제한'],
          verification: ['중복 메시지 테스트'],
          isCommitted: false,
        },
        '후반부',
      );
      expect(result).toContain('offset 유지');
      expect(result).toContain('cursor 전환');
      expect(result).toContain('중복 메시지 테스트');
      expect(result).toContain('후반부');
    });
  });

  describe('buildUpdateIssuesPrompt', () => {
    it('발언과 턴 번호를 포함한다', () => {
      const result = buildUpdateIssuesPrompt('주제', '발언 내용', 3, []);
      expect(result).toContain('발언 내용');
      expect(result).toContain('턴 3');
    });

    it('status 분류 규칙 4종을 포함한다', () => {
      const result = buildUpdateIssuesPrompt('주제', '발언', 1, []);
      expect(result).toContain('open');
      expect(result).toContain('decidable');
      expect(result).toContain('needs_verification');
      expect(result).toContain('out_of_scope');
    });

    it('revisits/lastTouchedTurn 갱신 지시를 포함한다', () => {
      const result = buildUpdateIssuesPrompt('주제', '발언', 2, [openIssue]);
      expect(result).toContain('revisits');
      expect(result).toContain('lastTouchedTurn');
    });

    it('newClaims/repeatClaims 의미 설명을 포함한다', () => {
      const result = buildUpdateIssuesPrompt('주제', '발언', 1, []);
      expect(result).toContain('newClaims');
      expect(result).toContain('repeatClaims');
    });

    it('inconsistencies kind 3종을 포함한다', () => {
      const result = buildUpdateIssuesPrompt('주제', '발언', 1, []);
      expect(result).toContain('arithmetic');
      expect(result).toContain('unit');
      expect(result).toContain('contradiction');
    });

    it('decisionCandidate.isCommitted 판단 기준을 포함한다', () => {
      const result = buildUpdateIssuesPrompt('주제', '발언', 1, []);
      expect(result).toContain('isCommitted');
    });

    it('새 주장/반복/범위외/발명 금지 규칙을 포함한다', () => {
      const result = buildUpdateIssuesPrompt('주제', '발언', 1, []);
      expect(result).toContain('새 주장, 제약, 반례');
      expect(result).toContain('repeatClaims');
      expect(result).toContain('out_of_scope');
      expect(result).toContain('발명하지 않는다');
    });

    it('기존 쟁점 목록을 포함한다', () => {
      const result = buildUpdateIssuesPrompt('주제', '발언', 2, [openIssue]);
      expect(result).toContain('성능 이슈');
    });

    it('토픽과 기존 결론 후보를 포함한다', () => {
      const result = buildUpdateIssuesPrompt('cursor 전환', '발언', 1, [], {
        recommendation: 'cursor 전환',
        conditions: ['정렬 키 고정'],
        risks: [],
        verification: ['중복 조회 검증'],
        isCommitted: false,
      });
      expect(result).toContain('cursor 전환');
      expect(result).toContain('정렬 키 고정');
      expect(result).toContain('중복 조회 검증');
      expect(result).toContain('삭제하라는 뜻이 아니다');
    });
  });

  describe('buildCompactHistoryPrompt', () => {
    it('entries를 포함하고 요약 지시를 포함한다', () => {
      const result = buildCompactHistoryPrompt('턴1: PM 발언\n턴2: 개발자 발언', 1500);
      expect(result).toContain('턴1: PM 발언');
      expect(result).toContain('턴2: 개발자 발언');
    });

    it('maxChars 값을 프롬프트에 포함한다', () => {
      const result = buildCompactHistoryPrompt('발언', 2000);
      expect(result).toContain('2000');
    });

    it('구조화 섹션 키워드를 포함한다', () => {
      const result = buildCompactHistoryPrompt('발언', 1500);
      expect(result).toContain('[결정]');
      expect(result).toContain('[근거]');
      expect(result).toContain('[열린 쟁점]');
      expect(result).toContain('[미해결 질문]');
    });
  });

  describe('buildDraftConclusionPrompt', () => {
    it('토픽과 discussionType을 포함한다', () => {
      const result = buildDraftConclusionPrompt('AI 도입', '맥락', ['결론'], 'decision');
      expect(result).toContain('AI 도입');
      expect(result).toContain('decision');
    });

    it('outputContract 항목을 포함한다', () => {
      const result = buildDraftConclusionPrompt('주제', '맥락', ['핵심 결론', '실행 항목'], 'brainstorm');
      expect(result).toContain('핵심 결론');
      expect(result).toContain('실행 항목');
    });

    it('isCommitted 판단 기준을 포함한다', () => {
      const result = buildDraftConclusionPrompt('주제', '맥락', ['결론'], 'decision');
      expect(result).toContain('isCommitted');
      expect(result).toContain('true');
      expect(result).toContain('false');
    });

    it('미해소 모순을 verification에 편입하라는 지시를 포함한다', () => {
      const result = buildDraftConclusionPrompt('주제', '맥락', ['결론'], 'decision');
      expect(result).toContain('verification');
      expect(result).toContain('미해소 모순');
    });

    it('현재 결론 후보를 포함한다', () => {
      const result = buildDraftConclusionPrompt('주제', '맥락', ['결론'], 'decision', {
        recommendation: 'cursor 전환',
        conditions: ['호환 API 유지'],
        risks: ['직접 이동 제한'],
        verification: ['중복 메시지 없음'],
        isCommitted: true,
      });
      expect(result).toContain('cursor 전환');
      expect(result).toContain('호환 API 유지');
      expect(result).toContain('중복 메시지 없음');
    });
  });

  describe('buildWriteResultPrompt', () => {
    it('토픽과 outputContract를 포함한다', () => {
      const result = buildWriteResultPrompt('AI 도입', '맥락', null, [], ['결론']);
      expect(result).toContain('AI 도입');
      expect(result).toContain('결론');
      expect(result).toContain('필수 항목 반영');
    });

    it('candidate가 있으면 권고안 정보를 포함한다', () => {
      const candidate = {
        recommendation: '도입 권고',
        conditions: ['예산 확보'],
        risks: ['일정 지연'],
        verification: [],
        isCommitted: true,
      };
      const result = buildWriteResultPrompt('주제', '맥락', candidate, [], ['결론']);
      expect(result).toContain('도입 권고');
      expect(result).toContain('예산 확보');
    });

    it('decidable 쟁점만 결론 쟁점에 포함한다', () => {
      const result = buildWriteResultPrompt('주제', '맥락', null, [openIssue, decidableIssue], ['결론']);
      expect(result).toContain('보안 이슈');
      expect(result).not.toContain('성능 이슈');
    });

    it('실제 논의 내용만 반영하고 추측을 금지한다', () => {
      const result = buildWriteResultPrompt('주제', '맥락', null, [decidableIssue], ['결론']);
      expect(result).toContain('실제 논의에 나온 내용');
      expect(result).toContain('추측하거나 발명하지 마세요');
      expect(result).toContain('검증 필요');
      expect(result).toContain('보류');
    });

    it('decision 유형이면 Go/No-Go 단언 지시를 포함한다', () => {
      const result = buildWriteResultPrompt('릴리즈 점검', '맥락', null, [], ['결론'], 'decision');
      expect(result).toContain('Go 또는 No-Go');
      expect(result).toContain('단언');
      expect(result).toContain('첫 줄');
      expect(result).toContain('판정: No-Go');
      expect(result).toContain('P0 > 0');
      expect(result).toContain('E2E');
    });

    it('brainstorm 유형이면 Go/No-Go 단언 지시를 포함하지 않는다', () => {
      const result = buildWriteResultPrompt('아이디어 논의', '맥락', null, [], ['결론'], 'brainstorm');
      expect(result).not.toContain('Go 또는 No-Go');
    });

    it('discussionType 미전달(기본값 brainstorm)이면 단언 지시가 없다', () => {
      const result = buildWriteResultPrompt('주제', '맥락', null, [], ['결론']);
      expect(result).not.toContain('Go 또는 No-Go');
    });
  });

  describe('buildDraftConclusionPrompt — decision 단언 지시', () => {
    it('decision 유형이면 Go/No-Go 단언 지시와 차단 사유 조건을 포함한다', () => {
      const result = buildDraftConclusionPrompt('릴리즈 점검', '맥락', ['결론'], 'decision');
      expect(result).toContain('Go 또는 No-Go');
      expect(result).toContain('단언');
      expect(result).toContain('차단 사유');
      expect(result).toContain('논의에 나오지 않은');
      expect(result).toContain('P0 > 0');
      expect(result).toContain('E2E');
    });

    it('brainstorm 유형이면 단언 지시를 포함하지 않는다', () => {
      const result = buildDraftConclusionPrompt('아이디어 논의', '맥락', ['결론'], 'brainstorm');
      expect(result).not.toContain('Go 또는 No-Go');
    });
  });

  describe('buildUpdateIssuesPrompt — 재진술 규칙 보강', () => {
    it('동일 화자 재진술은 newClaims=0 규칙을 포함한다', () => {
      const result = buildUpdateIssuesPrompt('주제', '발언', 1, []);
      expect(result).toContain('재진술');
      expect(result).toContain('newClaims=0');
    });

    it('전체 요약·3버킷 재진술은 repeatClaims 처리 규칙을 포함한다', () => {
      const result = buildUpdateIssuesPrompt('주제', '발언', 1, []);
      expect(result).toContain('전체 요약');
      expect(result).toContain('repeatClaims');
    });
  });
});
