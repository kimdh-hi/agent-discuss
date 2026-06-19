import { lastValueFrom, toArray } from 'rxjs';
import { OrchestratorService } from './orchestrator.service';
import { ModeratorService } from './moderator.service';
import { SpeakerService } from './speaker.service';
import { ConvergencePolicyService } from './convergence-policy.service';
import { SpeakerSelectorService } from './speaker-selector.service';
import { ConclusionWriterService } from './conclusion-writer.service';
import { DiscussionGraphFactory } from './discussion-graph';
import { TopicSetupService } from './topic-setup.service';
import { RoutingService } from './routing.service';
import { TurnService } from './turn.service';
import { LedgerService } from './ledger.service';
import { RagService } from '../rag/rag.service';
import { DECISION_CONTRACT } from './prompts';
import { ClaimExtraction, DecisionCandidate, Issue, RoomAgentSpec } from './orchestrator.types';

function agents(n: number): RoomAgentSpec[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `a${i}`,
    name: `에이전트${i}`,
    instructions: 'x',
    model: 'mock',
    description: `역할${i}`,
  }));
}

function issue(id: string): Issue {
  return { id, title: id, status: 'open', claims: [], risks: [], proposals: [], lastTouchedTurn: 0, revisits: 0 };
}

const fullCandidate: DecisionCandidate = {
  recommendation: '권고',
  conditions: ['조건'],
  risks: ['리스크 (후속 과제)'],
  verification: ['검증'],
  isCommitted: true,
};

function buildService(overrides: {
  ledger?: ModeratorService['updateIssues'];
  resolve?: ModeratorService['draftDecision'];
  routeNext?: ModeratorService['pickSpeaker'];
  frameTopic?: ModeratorService['defineAgenda'];
  speak?: jest.Mock;
}): {
  service: OrchestratorService;
  speakAgentCalls: () => number;
  resolveCalls: jest.Mock;
  speak: jest.Mock;
  routeNext: jest.Mock;
} {
  const speak =
    overrides.speak ??
    jest.fn(async (events: any, meta: any) => {
      if (meta.role === 'moderator') {
        events.next({ type: 'final', text: '최종 결론' });
        return { content: '최종 결론', yieldTo: null, passReason: null, done: false };
      }
      return { content: `발언 R${meta.round}`, yieldTo: null, passReason: null, done: false };
    });

  const resolve =
    overrides.resolve ??
    (jest.fn(async () => ({ issues: [issue('i1')], decisionCandidate: fullCandidate })) as any);

  const routeNext =
    overrides.routeNext ?? (jest.fn(async () => ({ next: 'a0', done: false })) as any);

  const moderator = {
    validateTopic: jest.fn(async () => true),
    defineAgenda:
      overrides.frameTopic ??
      jest.fn(async () => ({ discussionType: 'decision', outputContract: [...DECISION_CONTRACT], options: [] })),
    pickSpeaker: routeNext,
    updateIssues:
      overrides.ledger ??
      (jest.fn(
        async (_t, _i, cand, latest): Promise<ClaimExtraction> => ({
          issues: [{ ...issue('i1'), lastTouchedTurn: latest.round }],
          newClaims: 0,
          repeatClaims: 0,
          decisionCandidate: cand,
          inconsistencies: [],
        }),
      ) as any),
    draftDecision: resolve,
    summarizeHistory: jest.fn(async (_t, prev) => prev),
  } as unknown as ModeratorService;

  const speakerSvc = { speak } as unknown as SpeakerService;
  const convergence = new ConvergencePolicyService();
  const selector = new SpeakerSelectorService(moderator, convergence);
  const conclusion = new ConclusionWriterService(moderator, speakerSvc);
  const setup = new TopicSetupService(moderator, speakerSvc);
  const routing = new RoutingService(selector, convergence);
  const turn = new TurnService(speakerSvc, {} as unknown as RagService, convergence);
  const ledger = new LedgerService(moderator);
  const service = new OrchestratorService(
    new DiscussionGraphFactory(),
    setup,
    routing,
    turn,
    ledger,
    conclusion,
  );

  return {
    service,
    speakAgentCalls: () => speak.mock.calls.filter((c) => (c[1] as any).role === 'agent').length,
    resolveCalls: resolve as jest.Mock,
    speak: speak as jest.Mock,
    routeNext: routeNext as jest.Mock,
  };
}

describe('OrchestratorService convergence', () => {
  it('claim drought가 누적되면 maxTurns 전에 자유 토론을 멈추고 resolve로 보낸다', async () => {
    const { service, speakAgentCalls } = buildService({});

    const { turnLog } = service.run('주제', agents(3), { skipGate: true });
    const entries = await turnLog;

    expect(speakAgentCalls()).toBe(3);
    expect(entries.filter((e) => e.role === 'agent')).toHaveLength(3);
    expect(entries.at(-1)?.role).toBe('moderator');
  });

  it('결론이 outputContract를 못 채우면 checkCompletion이 한 턴 더 수렴시킨 뒤 종료한다', async () => {
    const incomplete: DecisionCandidate = { recommendation: '권고', conditions: ['조건'], risks: [], verification: [], isCommitted: true };
    const resolve = jest
      .fn()
      .mockResolvedValueOnce({ issues: [issue('i1')], decisionCandidate: incomplete })
      .mockResolvedValueOnce({ issues: [issue('i1')], decisionCandidate: fullCandidate });

    const { service, speakAgentCalls, resolveCalls } = buildService({ resolve: resolve as any });

    const { turnLog } = service.run('주제', agents(3), { skipGate: true });
    await turnLog;

    expect(resolveCalls).toHaveBeenCalledTimes(2);
    expect(speakAgentCalls()).toBe(4);
  });

  it('같은 쟁점이 반복 갱신(진동)되면 OSCILLATION_LIMIT 도달 시 maxTurns 전에 수렴한다', async () => {
    const ledger = jest.fn(
      async (_t: any, _i: any, cand: any, latest: any): Promise<ClaimExtraction> => ({
        issues: [{ ...issue('i1'), lastTouchedTurn: latest.round }],
        newClaims: 1,
        repeatClaims: 0,
        decisionCandidate: cand,
        inconsistencies: [],
      }),
    );

    const { service, speakAgentCalls } = buildService({ ledger: ledger as any });

    const { turnLog } = service.run('주제', agents(3), { skipGate: true });
    await turnLog;

    expect(speakAgentCalls()).toBe(4);
  });

  it('미해소 수치 모순은 다음 발언자 프롬프트에 노출된다', async () => {
    const ledger = jest.fn(
      async (_t: any, _i: any, cand: any, latest: any): Promise<ClaimExtraction> => ({
        issues: [{ ...issue('i1'), status: 'needs_verification', lastTouchedTurn: latest.round }],
        newClaims: 1,
        repeatClaims: 0,
        decisionCandidate: cand,
        inconsistencies: [
          { id: 'inc1', description: '5억을 50억으로 기재', kind: 'arithmetic', turn: latest.round, resolved: false },
        ],
      }),
    );

    const { service, speak } = buildService({ ledger: ledger as any });

    const { turnLog } = service.run('주제', agents(3), { skipGate: true });
    await turnLog;

    const agentPrompts = speak.mock.calls
      .filter((c) => (c[1] as any).role === 'agent')
      .map((c) => (c[2] as any).system as string);
    expect(agentPrompts.some((sys) => sys.includes('Unresolved numeric inconsistencies'))).toBe(true);
  });

  it('decision 유형의 핵심 선택지(options)는 디렉터 라우팅에 전달된다', async () => {
    const ledger = jest.fn(
      async (_t: any, _i: any, cand: any, latest: any): Promise<ClaimExtraction> => ({
        issues: [{ ...issue('i1'), lastTouchedTurn: latest.round }],
        newClaims: 1,
        repeatClaims: 0,
        decisionCandidate: cand,
        inconsistencies: [],
      }),
    );
    const frameTopic = jest.fn(async () => ({
      discussionType: 'decision' as const,
      outputContract: [...DECISION_CONTRACT],
      options: ['동기 처리', '비동기 큐'],
    }));

    const { service, routeNext } = buildService({ ledger: ledger as any, frameTopic: frameTopic as any });

    const { turnLog } = service.run('주제', agents(3), { skipGate: true });
    await turnLog;

    expect(routeNext).toHaveBeenCalled();
    expect(
      routeNext.mock.calls.some(
        (c) => JSON.stringify(c[6]) === JSON.stringify(['동기 처리', '비동기 큐']),
      ),
    ).toBe(true);
  });

  it('isCommitted가 false인 권고안은 결론 미충족으로 한 턴 더 수렴시킨다', async () => {
    const hedged: DecisionCandidate = {
      recommendation: 'BullMQ 도입을 검토하되 신중히 진행한다',
      conditions: ['조건'],
      risks: [],
      verification: ['검증'],
      isCommitted: false,
    };
    const resolve = jest
      .fn()
      .mockResolvedValueOnce({ issues: [issue('i1')], decisionCandidate: hedged })
      .mockResolvedValueOnce({ issues: [issue('i1')], decisionCandidate: fullCandidate });

    const { service, resolveCalls, speakAgentCalls } = buildService({ resolve: resolve as any });

    const { turnLog } = service.run('주제', agents(3), { skipGate: true });
    await turnLog;

    expect(resolveCalls).toHaveBeenCalledTimes(2);
    expect(speakAgentCalls()).toBe(4);
  });

  it('에이전트별 maxToolIterations를 speaker 옵션으로 전달한다', async () => {
    const { service, speak } = buildService({});
    const roster: RoomAgentSpec[] = [
      { id: 'a0', name: '에이전트0', instructions: 'x', model: 'mock', maxToolIterations: 7 },
    ];

    const { turnLog } = service.run('주제', roster, { skipGate: true });
    await turnLog;

    const agentCall = speak.mock.calls.find((c) => (c[1] as any).role === 'agent');
    expect((agentCall?.[3] as any).maxToolIterations).toBe(7);
  });

  it('시작 전 abort 신호면 발언 없이 done 이벤트로 종료한다', async () => {
    const { service, speakAgentCalls } = buildService({});
    const controller = new AbortController();
    controller.abort();

    const { events, turnLog } = service.run('주제', agents(3), { skipGate: true, signal: controller.signal });
    await turnLog;

    const collected = await lastValueFrom(events.pipe(toArray()));

    expect(speakAgentCalls()).toBe(0);
    expect(collected.some((e) => e.type === 'done')).toBe(true);
    expect(collected.some((e) => e.type === 'error')).toBe(false);
  });

  it('speak 진입 시 abort 신호가 감지되면 즉시 종료하고 해당 턴을 기록하지 않는다', async () => {
    const controller = new AbortController();
    const routeNext = jest.fn(async () => {
      controller.abort();
      return { next: 'a0', done: false };
    });
    const { service, speakAgentCalls } = buildService({ routeNext: routeNext as any });

    const { events, turnLog } = service.run('주제', agents(1), {
      skipGate: true,
      signal: controller.signal,
    });
    const log = await turnLog;

    const collected = await lastValueFrom(events.pipe(toArray()));

    expect(routeNext).toHaveBeenCalledTimes(1);
    expect(speakAgentCalls()).toBe(1);
    expect(log).toHaveLength(1);
    expect(collected.some((e) => e.type === 'done')).toBe(true);
    expect(collected.some((e) => e.type === 'error')).toBe(false);
  });

  it('그래프 실행이 실패하면 error 이벤트를 발행하고 turnLog를 reject한다', async () => {
    const frameTopic = jest.fn(async () => {
      throw new Error('boom');
    });
    const { service } = buildService({ frameTopic: frameTopic as any });

    const { events, turnLog } = service.run('주제', agents(3), { skipGate: true });
    await expect(turnLog).rejects.toThrow('boom');

    const collected = await lastValueFrom(events.pipe(toArray()));

    expect(collected.some((e) => e.type === 'error' && e.message === 'boom')).toBe(true);
  });
});
