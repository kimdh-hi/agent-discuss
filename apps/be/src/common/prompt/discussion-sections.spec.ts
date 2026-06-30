import type {
  DecisionCandidate,
  Inconsistency,
  Issue,
  RoomAgentSpec,
} from '../../modules/agent-rooms/application/discussion/discussion.types';
import {
  renderAgentsForModerator,
  renderBulletList,
  renderCsv,
  renderDecisionCandidate,
  renderOpenIssueClaims,
  renderOpenIssueTitles,
  renderOptionalLabel,
  renderOptionalSection,
  renderOptions,
  renderPickSpeakerDecisionCandidateSection,
  renderParticipantsForSpeaker,
  renderSpeakDecisionCandidateSection,
  renderSpeakDiscussionState,
  renderSpeakInconsistenciesSection,
  renderSpeakOpenIssuesSection,
  renderSpeakPressure,
  renderUnresolvedInconsistencies,
  renderUnresolvedInconsistencySummary,
} from './discussion-sections';

const candidate: DecisionCandidate = {
  recommendation: 'cursor 전환',
  conditions: ['호환 기간'],
  risks: ['직접 이동 제한'],
  verification: ['중복 메시지 테스트'],
  isCommitted: false,
};

const openIssue: Issue = {
  id: 'issue-1',
  title: '성능 이슈',
  status: 'open',
  claims: ['응답이 느리다'],
  risks: [],
  proposals: [],
  lastTouchedTurn: 1,
  revisits: 0,
};

const closedIssue: Issue = {
  ...openIssue,
  id: 'issue-2',
  title: '완료된 이슈',
  status: 'decidable',
};

const unresolved: Inconsistency = {
  id: 'inc-1',
  description: '10kg을 10ton으로 계산했다',
  kind: 'unit',
  turn: 2,
  resolved: false,
};

const resolved: Inconsistency = {
  ...unresolved,
  id: 'inc-2',
  description: '해결된 모순',
  resolved: true,
};

const agents: RoomAgentSpec[] = [
  { id: 'a1', name: 'PM', instructions: 'PM 역할', model: 'gpt-4o', description: '제품 관점' },
  { id: 'a2', name: '개발자', instructions: '개발자 역할', model: 'gpt-4o' },
];

describe('discussion prompt sections', () => {
  it('CSV를 렌더링하고 빈 배열이면 fallback을 사용한다', () => {
    expect(renderCsv(['a', 'b'])).toBe('a, b');
    expect(renderCsv([])).toBe('없음');
    expect(renderCsv([], '')).toBe('');
  });

  it('bullet list를 렌더링하고 빈 목록이면 fallback을 사용한다', () => {
    expect(renderBulletList(['a', 'b'], (item) => `- ${item}`)).toBe('- a\n- b');
    expect(renderBulletList([], (item) => `- ${item}`)).toBe('없음');
  });

  it('내용이 있을 때만 optional section을 만든다', () => {
    expect(renderOptionalSection('제목', '본문')).toBe('\n\n제목:\n본문');
    expect(renderOptionalSection('제목', '')).toBe('');
  });

  it('내용이 있을 때만 label section을 만든다', () => {
    expect(renderOptionalLabel('수렴 압력', '후반부')).toBe('\n\n수렴 압력: 후반부');
    expect(renderOptionalLabel('수렴 압력', '')).toBe('');
  });

  it('decisionCandidate가 null이면 emptyText를 사용한다', () => {
    expect(renderDecisionCandidate(null)).toBe('없음');
    expect(renderDecisionCandidate(null, { emptyText: '' })).toBe('');
  });

  it('decisionCandidate 기본 정보를 렌더링한다', () => {
    const result = renderDecisionCandidate(candidate);
    expect(result).toContain('- 권고: cursor 전환');
    expect(result).toContain('- 조건: 호환 기간');
    expect(result).toContain('- 리스크: 직접 이동 제한');
    expect(result).toContain('- 검증: 중복 메시지 테스트');
    expect(result).not.toContain('확정성');
  });

  it('옵션으로 확정성과 후속 지시를 포함한다', () => {
    const result = renderDecisionCandidate(candidate, {
      includeCommitment: true,
      tailInstruction: 'done=true로 설정하세요.',
    });
    expect(result).toContain('- 확정성: uncommitted');
    expect(result).toContain('done=true로 설정하세요.');
  });

  it('옵션으로 빈 배열 표시 문구를 바꿀 수 있다', () => {
    const result = renderDecisionCandidate({
      recommendation: '도입',
      conditions: [],
      risks: [],
      verification: [],
      isCommitted: true,
    }, { emptyListText: '' });
    expect(result).toContain('- 조건: ');
    expect(result).not.toContain('- 조건: 없음');
  });

  it('decisionCandidate 내부 빈 배열은 없음으로 표시한다', () => {
    const result = renderDecisionCandidate({
      recommendation: '도입',
      conditions: [],
      risks: [],
      verification: [],
      isCommitted: true,
    });
    expect(result).toContain('- 조건: 없음');
    expect(result).toContain('- 리스크: 없음');
    expect(result).toContain('- 검증: 없음');
  });

  it('참가자 목록을 speaker와 moderator 용도별로 렌더링한다', () => {
    expect(renderParticipantsForSpeaker(agents)).toContain('- a1: PM (제품 관점)');
    expect(renderParticipantsForSpeaker(agents)).toContain('- a2: 개발자 ()');
    expect(renderAgentsForModerator(agents)).toContain('- id="a1" name="PM"');
  });

  it('선택지가 있을 때만 핵심 선택지 섹션을 렌더링한다', () => {
    expect(renderOptions([])).toBe('');
    expect(renderOptions(['offset 유지'])).toContain('핵심 선택지');
    expect(renderOptions(['offset 유지'])).toContain('- offset 유지');
  });

  it('열린 쟁점만 렌더링한다', () => {
    const claims = renderOpenIssueClaims([openIssue, closedIssue]);
    expect(claims).toContain('성능 이슈');
    expect(claims).not.toContain('완료된 이슈');
    expect(renderOpenIssueTitles([openIssue, closedIssue])).toBe('성능 이슈');
  });

  it('speaker용 열린 쟁점 섹션은 내용과 반복 금지 지시를 함께 렌더링한다', () => {
    const section = renderSpeakOpenIssuesSection([openIssue, closedIssue]);
    expect(section).toContain('이미 제기된 쟁점과 주장');
    expect(section).toContain('성능 이슈');
    expect(section).toContain('반복하지 마세요');
    expect(renderSpeakOpenIssuesSection([])).toBe('');
  });

  it('미해소 모순만 렌더링한다', () => {
    const details = renderUnresolvedInconsistencies([unresolved, resolved]);
    expect(details).toContain('10kg을 10ton으로 계산했다');
    expect(details).not.toContain('해결된 모순');
    expect(renderUnresolvedInconsistencySummary([unresolved, resolved])).toBe('10kg을 10ton으로 계산했다');
  });

  it('speaker용 미해소 모순 섹션은 내용과 검증 지시를 함께 렌더링한다', () => {
    const section = renderSpeakInconsistenciesSection([unresolved, resolved]);
    expect(section).toContain('미해소 모순');
    expect(section).toContain('10kg을 10ton으로 계산했다');
    expect(section).toContain('검증 필요성');
    expect(renderSpeakInconsistenciesSection([])).toBe('');
  });

  it('speaker용 결론 후보 섹션은 후보가 있을 때만 반복 방지 지시를 포함한다', () => {
    const section = renderSpeakDecisionCandidateSection(candidate);
    expect(section).toContain('현재 결론 후보');
    expect(section).toContain('cursor 전환');
    expect(section).toContain('같은 내용을 반복하지 말고');
    expect(section).not.toContain('signal_turn');
    expect(section).not.toContain('done=true');
    expect(renderSpeakDecisionCandidateSection(null)).toBe('');
  });

  it('moderator 지명용 결론 후보 없음 포맷은 기존 한 줄 형식을 유지한다', () => {
    expect(renderPickSpeakerDecisionCandidateSection(null)).toBe('\n\n현재 결론 후보: 없음');
    expect(renderPickSpeakerDecisionCandidateSection(candidate)).toContain('- 확정성: uncommitted');
  });

  it('speaker용 압력은 명시 hint가 있을 때만 렌더링한다', () => {
    expect(renderSpeakPressure('')).toBe('');
    expect(renderSpeakPressure('직접 지정')).toContain('직접 지정');
  });

  it('speaker용 토론 상태 섹션을 한 번에 렌더링한다', () => {
    const section = renderSpeakDiscussionState({
      issues: [openIssue],
      inconsistencies: [unresolved],
      decisionCandidate: candidate,
      convergePressureHint: '마무리',
    });
    expect(section).toContain('이미 제기된 쟁점');
    expect(section).toContain('미해소 모순');
    expect(section).toContain('현재 결론 후보');
    expect(section).toContain('[중요]');
  });
});
