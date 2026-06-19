import { buildToolsForAgent } from './agent-tools';
import { RagService } from '../rag/rag.service';

const rag = {} as RagService;

describe('buildToolsForAgent', () => {
  it('tools가 없으면 기본 도구(rag_search)를 제공한다', () => {
    const tools = buildToolsForAgent({ id: 'a0' }, rag);
    expect(tools.map((t) => t.name)).toEqual(['rag_search']);
  });

  it('빈 배열이면 도구를 제공하지 않는다', () => {
    const tools = buildToolsForAgent({ id: 'a0', tools: [] }, rag);
    expect(tools).toHaveLength(0);
  });

  it('명시한 도구 키만 조립하고 알 수 없는 키는 무시한다', () => {
    const tools = buildToolsForAgent({ id: 'a0', tools: ['rag_search', 'unknown'] }, rag);
    expect(tools.map((t) => t.name)).toEqual(['rag_search']);
  });
});
