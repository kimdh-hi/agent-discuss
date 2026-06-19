import { ReplaySubject } from 'rxjs';
import { lastValueFrom, toArray } from 'rxjs';
import { SpeakerService } from './speaker.service';
import { LlmService } from '../llm/llm.service';
import { DiscussionConfig } from './discussion-config';
import { prompts } from './prompts';
import { RoomEvent, RoomAgentSpec } from './orchestrator.types';

function agent(): RoomAgentSpec {
  return { id: 'a0', name: '에이전트0', instructions: 'x', model: 'mock', description: '역할' };
}

describe('SpeakerService (mock provider)', () => {
  const original = process.env.LLM_PROVIDER;
  beforeAll(() => {
    process.env.LLM_PROVIDER = 'mock';
  });
  afterAll(() => {
    process.env.LLM_PROVIDER = original;
  });

  function build(): SpeakerService {
    return new SpeakerService(new LlmService(), new DiscussionConfig());
  }

  it('signal_turn 도구 호출로 done/yield를 캡처하고 제어 메타를 스트림에 노출하지 않는다', async () => {
    const speaker = build();
    const events = new ReplaySubject<RoomEvent>();

    const result = await speaker.speak(
      events,
      { role: 'agent', agentId: 'a0', agentName: '에이전트0', round: 1 },
      prompts.agent('주제', agent(), [agent()], ''),
      {},
    );
    events.complete();

    const collected = await lastValueFrom(events.pipe(toArray()));
    const contentText = collected
      .filter((e): e is Extract<RoomEvent, { type: 'content' }> => e.type === 'content')
      .map((e) => e.text)
      .join('');

    expect(result.content).toBe('모의 발언입니다.');
    expect(result.done).toBe(true);
    expect(contentText).not.toContain('control');
    expect(contentText).not.toContain('signal_turn');
    expect(collected.some((e) => e.type === 'tool' && e.name === 'signal_turn')).toBe(false);
    expect(collected.some((e) => e.type === 'turn_end')).toBe(true);
  });
});
