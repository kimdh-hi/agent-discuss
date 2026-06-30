jest.mock('@langchain/langgraph', () => ({
  ...jest.requireActual('@langchain/langgraph'),
  StateGraph: jest.fn(),
}));

jest.mock('./topic-setup', () => ({
  validateTopic: jest.fn(),
  rejectTopic: jest.fn(),
  defineAgenda: jest.fn(),
}));

jest.mock('./convergence-policy', () => ({ computeMaxTurns: jest.fn(() => 10) }));

import { DiscussionService } from './discussion.service';
import { StateGraph } from '@langchain/langgraph';
import * as topicSetup from './topic-setup';
import type { RoomAgentSpec } from './discussion.types';

const mockAgents: RoomAgentSpec[] = [
  { id: 'a1', name: 'PM', instructions: '제품 관리자', model: 'gpt-4o' },
  { id: 'a2', name: '개발자', instructions: '개발자', model: 'gpt-4o' },
];

const mockRagService = { search: jest.fn(), searchMany: jest.fn() };
const mockLlm = {
  stream: jest.fn(),
  complete: jest.fn(),
  completeStructured: jest.fn(),
};

function makeService() {
  jest.clearAllMocks();
  const discussionConfig = {
    moderatorModel: 'gpt-4o-mini',
    agentDefaultModel: 'gpt-4o-mini',
  };

  const capturedNodes: Record<string, (s: unknown) => unknown> = {};
  const mockInvoke = jest.fn().mockResolvedValue({ turnLog: [] });
  const mockGetState = jest.fn().mockResolvedValue({ values: {} });
  const mockInstance = {
    addNode: jest.fn().mockImplementation((name: string, fn: (s: unknown) => unknown) => {
      capturedNodes[name] = fn;
      return mockInstance;
    }),
    addEdge: jest.fn().mockReturnThis(),
    compile: jest.fn().mockReturnValue({ invoke: mockInvoke, getState: mockGetState }),
  };
  (StateGraph as jest.Mock).mockImplementation(() => mockInstance);

  const checkpointer = { getTuple: jest.fn(), put: jest.fn() };
  const store = { search: jest.fn(), put: jest.fn(), get: jest.fn() };

  const turnService = {
    speak: jest.fn(),
    updateIssues: jest.fn(),
    compactHistory: jest.fn(),
  };
  const routingService = {
    moderate: jest.fn(),
  };
  const conclusionWriterService = {
    finalizeIfReady: jest.fn(),
  };
  return {
    service: new DiscussionService(
      discussionConfig as never,
      turnService as never,
      routingService as never,
      conclusionWriterService as never,
      checkpointer as never,
      store as never,
    ),
    capturedNodes,
    mockInvoke,
    mockGetState,
    mockInstance,
    turnService,
    routingService,
    topicSetupService: topicSetup,
    conclusionWriterService,
  };
}

describe('DiscussionService', () => {
  describe('run', () => {
    it('subject, completion을 반환한다', async () => {
      const { service } = makeService();
      const result = await service.run('테스트 주제', mockAgents, {
        llm: mockLlm as never,
        ragService: mockRagService as never,
      });

      expect(result).toHaveProperty('subject');
      expect(result).toHaveProperty('completion');
    });

    it('completion은 Promise를 반환한다', async () => {
      const { service } = makeService();
      const result = await service.run('테스트', mockAgents, {
        llm: mockLlm as never,
        ragService: mockRagService as never,
      });

      expect(result.completion).toBeInstanceOf(Promise);
    });

    it('caller가 제공한 llm이 ctx에 주입된다', async () => {
      const { service, capturedNodes, topicSetupService } = makeService();
      await service.run('테스트', mockAgents, {
        llm: mockLlm as never,
        ragService: mockRagService as never,
      });

      const mockState = { turnLog: [], outputContract: [] } as never;
      await capturedNodes['validateTopic'](mockState);
      expect(topicSetupService.validateTopic).toHaveBeenCalledWith(
        expect.objectContaining({ llm: mockLlm }),
      );
    });

    it('그래프가 컴파일되어 invoke된다', async () => {
      const { service, mockInstance, mockInvoke } = makeService();
      await service.run('테스트', mockAgents, {
        llm: mockLlm as never,
        ragService: mockRagService as never,
      });

      expect(mockInstance.compile).toHaveBeenCalledTimes(1);
      await Promise.resolve();
      expect(mockInvoke).toHaveBeenCalledTimes(1);
    });

    it('8개의 노드가 그래프에 등록된다', async () => {
      const { service, mockInstance } = makeService();
      await service.run('테스트', mockAgents, {
        llm: mockLlm as never,
        ragService: mockRagService as never,
      });

      expect(mockInstance.addNode).toHaveBeenCalledTimes(8);
      const nodeNames = mockInstance.addNode.mock.calls.map((c: unknown[]) => c[0]);
      expect(nodeNames).toEqual(expect.arrayContaining([
        'validateTopic', 'rejectTopic', 'defineAgenda', 'moderate', 'speak',
        'updateIssues', 'compactHistory', 'finalizeIfReady',
      ]));
    });

    it('speak 노드 ends에 moderate가 포함된다', async () => {
      const { service, mockInstance } = makeService();
      await service.run('테스트', mockAgents, {
        llm: mockLlm as never,
        ragService: mockRagService as never,
      });

      const speakCall = mockInstance.addNode.mock.calls.find((c: unknown[]) => c[0] === 'speak');
      const opts = speakCall?.[2] as { ends?: string[] } | undefined;
      expect(opts?.ends).toContain('moderate');
      expect(opts?.ends).toContain('updateIssues');
    });

    it('ctx에 llm/config/initialTurn/skipGate/maxTurns가 포함된다', async () => {
      const { service, capturedNodes, topicSetupService } = makeService();

      await service.run('테스트', mockAgents, {
        llm: mockLlm as never,
        ragService: mockRagService as never,
        initialTurn: 5,
        skipGate: true,
      });

      const mockState = { turnLog: [], outputContract: [] } as never;
      await capturedNodes['validateTopic'](mockState);
      expect(topicSetupService.validateTopic).toHaveBeenCalledWith(
        expect.objectContaining({
          initialTurn: 5,
          skipGate: true,
          maxTurns: 10,
          topic: '테스트',
        }),
      );
    });

    it('signal이 제공되면 subject와 completion을 반환한다', async () => {
      const { service } = makeService();
      const abortController = new AbortController();
      const result = await service.run('테스트', mockAgents, {
        llm: mockLlm as never,
        ragService: mockRagService as never,
        signal: abortController.signal,
      });

      expect(result.subject).toBeDefined();
      expect(result.completion).toBeInstanceOf(Promise);
    });

    it('그래프 실패 시 error와 done 이벤트를 emit하고 새 turnLog는 반환하지 않는다', async () => {
      const { service, mockInvoke } = makeService();
      mockInvoke.mockRejectedValueOnce(new Error('graph error'));

      const initialLog = [
        { role: 'agent' as const, agentId: 'a1', agentName: 'PM', round: 0, content: '이전' },
      ];
      const events: unknown[] = [];

      const result = await service.run('에러 유발', mockAgents, {
        llm: mockLlm as never,
        ragService: mockRagService as never,
        initialTurnLog: initialLog,
      });

      result.subject.subscribe((e) => events.push(e));
      const { turnLog: entries, snapshot } = await result.completion;

      expect(Array.isArray(entries)).toBe(true);
      expect(entries).toEqual([]);
      expect(snapshot).toBeDefined();
      expect(snapshot.turn).toBe(1);
      const types = events.map((e: unknown) => (e as { type: string }).type);
      expect(types).toContain('error');
      expect(types).toContain('done');
    });

    it('subject는 status 이벤트를 emit한다', async () => {
      const { service } = makeService();
      const events: unknown[] = [];

      const result = await service.run('테스트', mockAgents, {
        llm: mockLlm as never,
        ragService: mockRagService as never,
      });

      result.subject.subscribe((e) => events.push(e));
      await result.completion;

      const types = events.map((e: unknown) => (e as { type: string }).type);
      expect(types).toContain('status');
    });

    it('moderatorModel은 첫 번째 에이전트 모델로 도출된다', async () => {
      const { service, capturedNodes, topicSetupService } = makeService();

      await service.run('테스트', mockAgents, {
        llm: mockLlm as never,
        ragService: mockRagService as never,
      });

      const mockState = { turnLog: [], outputContract: [] } as never;
      await capturedNodes['validateTopic'](mockState);
      expect(topicSetupService.validateTopic).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({ moderatorModel: 'gpt-4o' }),
        }),
      );
    });

    it('model 미지정 에이전트는 agentDefaultModel로 폴백해 도출한다', async () => {
      const { service, capturedNodes, topicSetupService } = makeService();
      const noModelAgents = [
        { id: 'a1', name: 'PM', instructions: '제품 관리자', model: undefined },
      ] as unknown as RoomAgentSpec[];

      await service.run('테스트', noModelAgents, {
        llm: mockLlm as never,
        ragService: mockRagService as never,
      });

      const mockState = { turnLog: [], outputContract: [] } as never;
      await capturedNodes['validateTopic'](mockState);
      expect(topicSetupService.validateTopic).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({ moderatorModel: 'gpt-4o-mini' }),
        }),
      );
    });

    it('completion은 { turnLog, snapshot } 구조를 반환한다', async () => {
      const { service, mockInvoke } = makeService();
      mockInvoke.mockResolvedValueOnce({
        turnLog: [{ role: 'agent', agentId: 'a1', agentName: 'PM', round: 1, content: '발언' }],
        historySummary: '요약',
        summarizedUntilTurn: 1,
        issues: [],
        inconsistencies: [],
        decisionCandidate: null,
        discussionType: 'brainstorm',
        outputContract: [],
        options: ['cursor 전환'],
        turn: 3,
      });

      const result = await service.run('테스트', mockAgents, {
        llm: mockLlm as never,
        ragService: mockRagService as never,
      });

      const { turnLog, snapshot } = await result.completion;
      expect(turnLog).toHaveLength(1);
      expect(snapshot.historySummary).toBe('요약');
      expect(snapshot.turn).toBe(3);
      expect(snapshot.discussionType).toBe('brainstorm');
      expect(snapshot.options).toEqual(['cursor 전환']);
    });

    it('completion은 initialTurnLog 이후 이번 run에서 생성된 turnLog만 반환한다', async () => {
      const { service, mockInvoke } = makeService();
      const initialLog = [
        { role: 'agent' as const, agentId: 'a1', agentName: 'PM', round: 1, content: '이전 발언' },
        { role: 'moderator' as const, agentName: '진행자', round: 1, content: '이전 결론' },
      ];
      const newEntry = { role: 'agent' as const, agentId: 'a2', agentName: '개발자', round: 2, content: '새 발언' };
      mockInvoke.mockResolvedValueOnce({
        turnLog: [...initialLog, newEntry],
        historySummary: '',
        turn: 2,
      });

      const result = await service.run('테스트', mockAgents, {
        llm: mockLlm as never,
        ragService: mockRagService as never,
        initialTurnLog: initialLog,
      });

      const { turnLog } = await result.completion;
      expect(turnLog).toEqual([newEntry]);
    });

    it('initialSnapshot이 있으면 graph.invoke 초기 상태에 포함된다', async () => {
      const { service, mockInvoke } = makeService();
      mockInvoke.mockResolvedValueOnce({ turnLog: [], historySummary: '' });

      const snapshot = {
        historySummary: '이전 요약',
        summarizedUntilTurn: 5,
        issues: [{ id: 'i1', title: '쟁점', status: 'open' as const, claims: [], risks: [], proposals: [], lastTouchedTurn: 1, revisits: 0 }],
        inconsistencies: [],
        decisionCandidate: null,
        discussionType: 'decision' as const,
        outputContract: ['권고안'],
        options: ['offset 유지', 'cursor 전환'],
        turn: 5,
        participantStats: { a1: { turns: 2, newClaims: 1, repeatClaims: 3 } },
        droughtCount: 2,
      };

      await service.run('테스트', mockAgents, {
        llm: mockLlm as never,
        ragService: mockRagService as never,
        initialSnapshot: snapshot,
      });

      const invokeArg = mockInvoke.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(invokeArg['historySummary']).toBe('이전 요약');
      expect(invokeArg['summarizedUntilTurn']).toBe(5);
      expect(invokeArg['discussionType']).toBe('decision');
      expect(invokeArg['outputContract']).toEqual(['권고안']);
      expect(invokeArg['options']).toEqual(['offset 유지', 'cursor 전환']);
      expect(invokeArg['participantStats']).toEqual({ a1: { turns: 2, newClaims: 1, repeatClaims: 3 } });
      expect(invokeArg['droughtCount']).toBe(2);
    });

    it('initialSnapshot의 turn으로 initialTurn을 계산한다', async () => {
      const { service, capturedNodes, topicSetupService } = makeService();

      const snapshot = {
        historySummary: '',
        summarizedUntilTurn: 0,
        issues: [],
        inconsistencies: [],
        decisionCandidate: null,
        discussionType: 'brainstorm' as const,
        outputContract: [],
        options: [],
        turn: 7,
      };

      await service.run('테스트', mockAgents, {
        llm: mockLlm as never,
        ragService: mockRagService as never,
        initialSnapshot: snapshot,
      });

      const mockState = { turnLog: [], outputContract: [] } as never;
      await capturedNodes['validateTopic'](mockState);
      expect(topicSetupService.validateTopic).toHaveBeenCalledWith(
        expect.objectContaining({ initialTurn: 7 }),
      );
    });

    it('initialSnapshot이 없으면 initialTurnLog의 agent 발언 수로 initialTurn과 초기 turn을 맞춘다', async () => {
      const { service, capturedNodes, topicSetupService, mockInvoke } = makeService();
      const initialLog = [
        { role: 'agent' as const, agentId: 'a1', agentName: 'PM', round: 1, content: '이전 발언 1' },
        { role: 'moderator' as const, agentName: '진행자', round: 1, content: '이전 정리' },
        { role: 'agent' as const, agentId: 'a2', agentName: '개발자', round: 2, content: '이전 발언 2' },
      ];

      await service.run('테스트', mockAgents, {
        llm: mockLlm as never,
        ragService: mockRagService as never,
        initialTurnLog: initialLog,
      });

      const mockState = { turnLog: [], outputContract: [] } as never;
      await capturedNodes['validateTopic'](mockState);
      expect(topicSetupService.validateTopic).toHaveBeenCalledWith(
        expect.objectContaining({ initialTurn: 2 }),
      );
      const invokeArg = mockInvoke.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(invokeArg['turn']).toBe(2);
    });

    it('graph 결과에 필드가 없으면 기본값으로 채운 snapshot을 반환한다', async () => {
      const { service, mockInvoke } = makeService();
      mockInvoke.mockResolvedValueOnce({});

      const result = await service.run('테스트', mockAgents, {
        llm: mockLlm as never,
        ragService: mockRagService as never,
      });

      const { turnLog, snapshot } = await result.completion;
      expect(turnLog).toEqual([]);
      expect(snapshot.historySummary).toBe('');
      expect(snapshot.issues).toEqual([]);
      expect(snapshot.discussionType).toBe('brainstorm');
      expect(snapshot.options).toEqual([]);
      expect(snapshot.turn).toBe(0);
    });

    it('체크포인트가 있으면 빈 입력으로 invoke하고 체크포인트 turnLog 이후만 반환한다', async () => {
      const { service, mockInvoke, mockGetState } = makeService();
      const checkpointLog = [
        { role: 'agent' as const, agentId: 'a1', agentName: 'PM', round: 1, content: '체크포인트 발언1' },
        { role: 'moderator' as const, agentName: '진행자', round: 1, content: '체크포인트 결론' },
      ];
      const newEntry = { role: 'agent' as const, agentId: 'a2', agentName: '개발자', round: 2, content: '재개 후 새 발언' };
      mockGetState.mockResolvedValueOnce({ values: { turnLog: checkpointLog } });
      mockInvoke.mockResolvedValueOnce({ turnLog: [...checkpointLog, newEntry], turn: 2 });

      const result = await service.run('테스트', mockAgents, {
        llm: mockLlm as never,
        ragService: mockRagService as never,
        threadId: 'topic-1',
        initialTurnLog: [],
      });

      const { turnLog } = await result.completion;
      expect(turnLog).toEqual([newEntry]);
      const invokeArg = mockInvoke.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(invokeArg).toEqual({});
      const invokeConfig = mockInvoke.mock.calls[0]?.[1] as { configurable?: { thread_id?: string } };
      expect(invokeConfig.configurable?.thread_id).toBe('topic-1');
    });

    it('threadId가 있어도 체크포인트가 없으면 시드 경로(initialGraphState)로 invoke한다', async () => {
      const { service, mockInvoke, mockGetState } = makeService();
      mockGetState.mockResolvedValueOnce({ values: {} });
      mockInvoke.mockResolvedValueOnce({ turnLog: [], historySummary: '' });

      const result = await service.run('테스트', mockAgents, {
        llm: mockLlm as never,
        ragService: mockRagService as never,
        threadId: 'legacy-topic',
        historySummary: '레거시 요약',
      });
      await result.completion;

      const invokeArg = mockInvoke.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(invokeArg['historySummary']).toBe('레거시 요약');
    });

    it('에러 폴백 시 initialSnapshot이 있으면 그 값을 사용한다', async () => {
      const { service, mockInvoke } = makeService();
      mockInvoke.mockRejectedValueOnce(new Error('graph error'));

      const savedSnap = {
        historySummary: '저장된 요약', summarizedUntilTurn: 3,
        issues: [], inconsistencies: [], decisionCandidate: null,
        discussionType: 'decision' as const, outputContract: ['권고'], options: ['cursor 전환'], turn: 5,
      };

      const result = await service.run('테스트', mockAgents, {
        llm: mockLlm as never,
        ragService: mockRagService as never,
        initialSnapshot: savedSnap,
      });

      const { snapshot } = await result.completion;
      expect(snapshot.historySummary).toBe('저장된 요약');
      expect(snapshot.turn).toBe(5);
      expect(snapshot.discussionType).toBe('decision');
    });
  });
});
