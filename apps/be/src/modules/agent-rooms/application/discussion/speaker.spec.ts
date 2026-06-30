import { speak } from './speaker';
import { ReplaySubject } from 'rxjs';
import type { RoomAgentSpec, RoomEvent } from './discussion.types';
import type { DiscussionStateType } from './discussion-state';

const agent: RoomAgentSpec = { id: 'a1', name: 'PM', instructions: '제품 관리자', model: 'gpt-4o', hasKnowledge: false };

const config = { moderatorModel: 'gpt-4o', agentDefaultModel: 'gpt-4o' } as never;

function makeState(overrides: Partial<DiscussionStateType> = {}): DiscussionStateType {
  return {
    turn: 1,
    turnLog: [],
    aborted: false,
    nextSpeakerId: 'a1',
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

function makeCtx(agents: RoomAgentSpec[] = [agent]) {
  const events = new ReplaySubject<RoomEvent>(100);
  const abortController = new AbortController();
  return {
    topic: '테스트 주제',
    agents,
    events,
    signal: abortController.signal,
    ragService: { search: jest.fn(), searchMany: jest.fn() } as never,
    keepTurns: 4,
    abortController,
  };
}

function makeStreamLlm(
  parts: Array<{ type: string; text?: string; name?: string; args?: Record<string, unknown>; meta?: unknown }>,
  structuredResult: unknown = null,
) {
  async function* streamGen() {
    for (const part of parts) yield part;
  }
  return {
    stream: jest.fn().mockReturnValue(streamGen()),
    complete: jest.fn(),
    completeStructured: jest.fn().mockResolvedValue(structuredResult),
    accumulatedUsage: jest.fn().mockReturnValue({ inputTokens: 10, outputTokens: 5 }),
    resetUsage: jest.fn(),
  } as never;
}

describe('speaker', () => {
  describe('speak', () => {
    it('텍스트 파트를 모아 entry.content를 구성한다', async () => {
      const ctx = makeCtx();
      const llm = makeStreamLlm([
        { type: 'text', text: '안녕 ' },
        { type: 'text', text: '세계' },
      ]);

      const result = await speak(agent, makeState(), ctx as never, llm, config, '주제');
      expect(result.entry.content).toContain('안녕');
      expect(result.entry.role).toBe('agent');
      expect(result.entry.agentId).toBe('a1');
    });

    it('tool_call 이벤트를 ctx.events로 emit한다', async () => {
      const ctx = makeCtx();
      const events: RoomEvent[] = [];
      ctx.events.subscribe((e) => events.push(e));

      const llm = makeStreamLlm([
        { type: 'tool_call', name: 'search_knowledge_base', args: { query: '검색어' } },
        { type: 'text', text: '결과' },
      ]);

      await speak(agent, makeState(), ctx as never, llm, config, '주제');
      const toolEvents = events.filter((e) => e.type === 'tool');
      expect(toolEvents).toHaveLength(1);
    });

    it('tool_result에 meta(SearchHit 배열)가 있으면 source 이벤트를 emit한다', async () => {
      const ctx = makeCtx();
      const events: RoomEvent[] = [];
      ctx.events.subscribe((e) => events.push(e));

      const hits = [{ documentId: 'd1', filename: 'doc.md', score: 0.9, content: '내용', chunkIndex: 0 }];
      const llm = makeStreamLlm([
        { type: 'tool_result', meta: hits },
        { type: 'text', text: '결과' },
      ]);

      const result = await speak(agent, makeState(), ctx as never, llm, config, '주제');
      const sourceEvents = events.filter((e) => e.type === 'source');
      expect(sourceEvents).toHaveLength(1);
      expect(result.sources).toHaveLength(1);
    });

    it('tool_result meta가 빈 배열이면 source 이벤트를 emit하지 않는다', async () => {
      const ctx = makeCtx();
      const events: RoomEvent[] = [];
      ctx.events.subscribe((e) => events.push(e));

      const llm = makeStreamLlm([
        { type: 'tool_result', meta: [] },
        { type: 'text', text: '결과' },
      ]);

      await speak(agent, makeState(), ctx as never, llm, config, '주제');
      const sourceEvents = events.filter((e) => e.type === 'source');
      expect(sourceEvents).toHaveLength(0);
    });

    it('turn_start와 turn_end 이벤트를 emit한다', async () => {
      const ctx = makeCtx();
      const events: RoomEvent[] = [];
      ctx.events.subscribe((e) => events.push(e));

      const llm = makeStreamLlm([{ type: 'text', text: '발언' }]);
      await speak(agent, makeState(), ctx as never, llm, config, '주제');

      expect(events.some((e) => e.type === 'turn_start')).toBe(true);
      expect(events.some((e) => e.type === 'turn_end')).toBe(true);
    });

    it('발언 후 턴 제어 structured call을 하지 않는다', async () => {
      const ctx = makeCtx();
      const llm = makeStreamLlm([{ type: 'text', text: '일반 발언' }]);

      const result = await speak(agent, makeState(), ctx as never, llm, config, '주제');
      expect(result.entry.content).toBe('일반 발언');
      expect((llm as never as { completeStructured: jest.Mock }).completeStructured).not.toHaveBeenCalled();
    });

    it('llm.stream 첫 번째 메시지가 system 역할이다', async () => {
      const ctx = makeCtx();
      const streamFn = jest.fn().mockReturnValue((async function* () { yield { type: 'text', text: '결과' }; })());
      const llm = {
        stream: streamFn,
        complete: jest.fn(),
        completeStructured: jest.fn(),
        accumulatedUsage: jest.fn(),
        resetUsage: jest.fn(),
      } as never;

      await speak(agent, makeState(), ctx as never, llm, config, '주제');
      const callArgs = streamFn.mock.calls[0]?.[0] as { messages?: Array<{ role: string }> } | undefined;
      expect(callArgs?.messages?.[0]?.role).toBe('system');
    });


    it('자기 발언은 assistant 역할로 전달된다', async () => {
      const state = makeState({
        turnLog: [{ role: 'agent', agentId: 'a1', agentName: 'PM', round: 0, content: '이전 내 발언' }],
      });
      const streamFn = jest.fn().mockReturnValue((async function* () { yield { type: 'text', text: '결과' }; })());
      const llm = {
        stream: streamFn,
        complete: jest.fn(),
        completeStructured: jest.fn(),
        accumulatedUsage: jest.fn(),
        resetUsage: jest.fn(),
      } as never;

      await speak(agent, state, makeCtx() as never, llm, config, '주제');
      const callArgs = streamFn.mock.calls[0]?.[0] as { messages?: Array<{ role: string; content: string }> } | undefined;
      const assistantMsg = callArgs?.messages?.find((m) => m.role === 'assistant');
      expect(assistantMsg).toBeDefined();
      expect(assistantMsg?.content).toContain('이전 내 발언');
    });

    it('타인 발언은 user 역할로 전달된다', async () => {
      const state = makeState({
        turnLog: [{ role: 'agent', agentId: 'a2', agentName: '개발자', round: 0, content: '타인 발언' }],
      });
      const streamFn = jest.fn().mockReturnValue((async function* () { yield { type: 'text', text: '결과' }; })());
      const llm = {
        stream: streamFn,
        complete: jest.fn(),
        completeStructured: jest.fn(),
        accumulatedUsage: jest.fn(),
        resetUsage: jest.fn(),
      } as never;

      await speak(agent, state, makeCtx() as never, llm, config, '주제');
      const callArgs = streamFn.mock.calls[0]?.[0] as { messages?: Array<{ role: string; content: string }> } | undefined;
      const userMsgs = callArgs?.messages?.filter((m) => m.role === 'user') ?? [];
      expect(userMsgs.some((m) => m.content.includes('[개발자]'))).toBe(true);
    });

    it('실질 발언이면 substantive: true를 반환하고 stream을 1회만 호출한다', async () => {
      const ctx = makeCtx();
      const streamFn = jest.fn().mockReturnValue((async function* () {
        yield { type: 'text', text: '새 주장입니다.' };
      })());
      const llm = { stream: streamFn, complete: jest.fn(), completeStructured: jest.fn(), accumulatedUsage: jest.fn(), resetUsage: jest.fn() } as never;

      const result = await speak(agent, makeState(), ctx as never, llm, config, '주제');
      expect(result.substantive).toBe(true);
      expect(streamFn).toHaveBeenCalledTimes(1);
    });

    it('1차 비실질이지만 signal 없음 → 재요청 후 본문 반환 → substantive: true, stream 2회', async () => {
      const ctx = makeCtx();
      const streamFn = jest.fn()
        .mockReturnValueOnce((async function* () {
          yield { type: 'text', text: '' };
        })())
        .mockReturnValueOnce((async function* () {
          yield { type: 'text', text: '재요청 후 실질 발언입니다.' };
        })());
      const llm = { stream: streamFn, complete: jest.fn(), completeStructured: jest.fn(), accumulatedUsage: jest.fn(), resetUsage: jest.fn() } as never;

      const result = await speak(agent, makeState(), ctx as never, llm, config, '주제');
      expect(result.substantive).toBe(true);
      expect(result.entry.content).toContain('재요청 후 실질 발언입니다.');
      expect(streamFn).toHaveBeenCalledTimes(2);
    });

    it('1차·재요청 모두 비실질이면 signal을 폐기한다', async () => {
      const ctx = makeCtx();
      const streamFn = jest.fn()
        .mockReturnValueOnce((async function* () {
          yield { type: 'text', text: '' };
        })())
        .mockReturnValueOnce((async function* () {
          yield { type: 'text', text: '' };
        })());
      const llm = { stream: streamFn, complete: jest.fn(), completeStructured: jest.fn(), accumulatedUsage: jest.fn(), resetUsage: jest.fn() } as never;

      const result = await speak(agent, makeState(), ctx as never, llm, config, '주제');
      expect(result.substantive).toBe(false);
      expect(result.entry.content).toBe('');
      expect(streamFn).toHaveBeenCalledTimes(2);
    });

    it('비실질이면 content 이벤트를 emit하지 않는다', async () => {
      const ctx = makeCtx();
      const events: RoomEvent[] = [];
      ctx.events.subscribe((e) => events.push(e));
      const streamFn = jest.fn()
        .mockReturnValueOnce((async function* () { yield { type: 'text', text: '' }; })())
        .mockReturnValueOnce((async function* () { yield { type: 'text', text: '' }; })());
      const llm = { stream: streamFn, complete: jest.fn(), completeStructured: jest.fn(), accumulatedUsage: jest.fn(), resetUsage: jest.fn() } as never;

      await speak(agent, makeState(), ctx as never, llm, config, '주제');
      expect(events.some((e) => e.type === 'content')).toBe(false);
    });

    it('텍스트 델타를 토큰 단위로 증분 emit한다(한 번에 몰지 않는다)', async () => {
      const ctx = makeCtx();
      const events: RoomEvent[] = [];
      ctx.events.subscribe((e) => events.push(e));

      const llm = makeStreamLlm([
        { type: 'text', text: '저는 ' },
        { type: 'text', text: '성능을 ' },
        { type: 'text', text: '우선해야 한다고 봅니다.' },
      ]);

      const result = await speak(agent, makeState(), ctx as never, llm, config, '주제');
      const contentEvents = events.filter((e) => e.type === 'content') as Array<{ text: string }>;
      expect(contentEvents.length).toBe(3);
      expect(contentEvents.map((e) => e.text).join('')).toBe('저는 성능을 우선해야 한다고 봅니다.');
      expect(result.entry.content).toBe('저는 성능을 우선해야 한다고 봅니다.');
    });

    it('비-signal 중괄호({timeout: 30})는 보류하지 않고 그대로 스트리밍한다', async () => {
      const ctx = makeCtx();
      const events: RoomEvent[] = [];
      ctx.events.subscribe((e) => events.push(e));

      const llm = makeStreamLlm([
        { type: 'text', text: '설정 {timeout: 30} 을 검토해야 합니다.' },
      ]);

      const result = await speak(agent, makeState(), ctx as never, llm, config, '주제');
      const contentEvents = events.filter((e) => e.type === 'content') as Array<{ text: string }>;
      const joined = contentEvents.map((e) => e.text).join('');
      expect(joined).toBe('설정 {timeout: 30} 을 검토해야 합니다.');
      expect(result.entry.content).toBe('설정 {timeout: 30} 을 검토해야 합니다.');
    });

    it('지식을 보유한(hasKnowledge) 에이전트면 knowledgeScope로 RAG 도구를 바인딩한다', async () => {
      const ragAgent: RoomAgentSpec = { ...agent, hasKnowledge: true, knowledgeScope: 'scope-1' };
      const ctx = makeCtx([ragAgent]);
      const streamFn = jest.fn().mockReturnValue((async function* () { yield { type: 'text', text: '결과' }; })());
      const llm = {
        stream: streamFn,
        complete: jest.fn(),
        completeStructured: jest.fn(),
        accumulatedUsage: jest.fn(),
        resetUsage: jest.fn(),
      } as never;

      await speak(ragAgent, makeState(), ctx as never, llm, config, '주제');
      const callArgs = streamFn.mock.calls[0]?.[0] as {
        tools?: Array<{ execute: (args: Record<string, unknown>) => Promise<unknown> }>;
      } | undefined;
      expect(callArgs?.tools).toHaveLength(1);
      const ragSearchMany = (ctx.ragService as unknown as { searchMany: jest.Mock }).searchMany;
      ragSearchMany.mockResolvedValue([]);
      await callArgs?.tools?.[0]?.execute({ queries: ['검색어'] });
      expect(ragSearchMany).toHaveBeenCalledWith('scope-1', ['검색어']);
    });
  });
});
