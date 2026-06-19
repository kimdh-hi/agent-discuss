import { useCallback, useRef, useState } from 'react';
import { apiStream, parseSse, ApiError } from '../lib/api';
import type { Agent, ChatMessage } from '../lib/types';
import ChatInput from './ChatInput';
import ChatMessageView from './ChatMessageView';
import DocsModal from './DocsModal';

const PENDING_ID = '__pending__';

interface Props {
  agent: Agent;
  wsId: string;
}

export default function AgentChatView({ agent, wsId: _wsId }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [docsOpen, setDocsOpen] = useState(false);
  const abortRef = useRef<(() => void) | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollBottom = () => {
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    });
  };

  const send = useCallback(
    async (text: string) => {
      setError(null);
      setStreaming(true);
      setMessages((prev) => [
        ...prev,
        { id: `u-${Date.now()}`, role: 'user', content: text },
        { id: PENDING_ID, role: 'assistant', content: '', pending: true },
      ]);
      scrollBottom();

      let aborted = false;
      const controller = new AbortController();
      abortRef.current = () => {
        aborted = true;
        controller.abort();
      };

      try {
        const res = await fetch(`/api/agents/${agent.id}/query`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('rai.token') ?? ''}`,
          },
          body: JSON.stringify({ message: text }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { message?: string };
          throw new ApiError(res.status, data.message ?? '요청 실패');
        }

        for await (const { event, data } of parseSse(res)) {
          if (event === 'content') {
            setStatus(null);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === PENDING_ID
                  ? { ...m, content: m.content + ((data.text as string) ?? '') }
                  : m,
              ),
            );
            scrollBottom();
          } else if (event === 'source') {
            const hits = (data.hits as Array<{ filename: string; score: number }>) ?? [];
            setMessages((prev) =>
              prev.map((m) =>
                m.id === PENDING_ID ? { ...m, sources: hits } : m,
              ),
            );
          } else if (event === 'tool') {
            const name = String(data.name ?? '');
            const args = (data.args as Record<string, unknown>) ?? {};
            setStatus(`${name} 실행 중…`);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === PENDING_ID
                  ? { ...m, toolCalls: [...(m.toolCalls ?? []), { name, args }] }
                  : m,
              ),
            );
          } else if (event === 'done') {
            // finalize
          } else if (event === 'error') {
            setError(String(data.message ?? '오류가 발생했습니다.'));
          }
        }
      } catch (err) {
        if (!aborted) {
          setError(err instanceof ApiError ? err.message : '응답 처리 중 오류가 발생했습니다.');
        }
      } finally {
        setStreaming(false);
        setStatus(null);
        abortRef.current = null;
        setMessages((prev) =>
          prev
            .filter((m) => !(m.id === PENDING_ID && m.content === ''))
            .map((m) => (m.id === PENDING_ID ? { ...m, id: `a-${Date.now()}`, pending: false } : m)),
        );
      }
    },
    [agent.id],
  );

  const stop = useCallback(() => {
    abortRef.current?.();
  }, []);

  const composer = (
    <div>
      {error && (
        <div
          role="alert"
          className="mb-2 rounded-xl border border-red-900 bg-red-950 px-4 py-2 text-sm text-red-400"
        >
          {error}
        </div>
      )}
      <ChatInput onSend={send} onStop={stop} streaming={streaming} />
    </div>
  );

  return (
    <div className="relative flex h-full flex-1 flex-col bg-zinc-900">
      {/* 헤더 */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">{agent.name}</h2>
          <p className="mt-0.5 text-[11px] text-zinc-500">{agent.model}</p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm gap-1.5 text-xs"
          onClick={() => setDocsOpen(true)}
          title="지식 문서 관리"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 2.5h7l3 3v8h-10zM10 2.5v3h3M5.5 8.5h5M5.5 11h5" />
          </svg>
          지식 문서
        </button>
      </div>

      {messages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center pb-20">
          <h3 className="text-2xl font-semibold tracking-tight text-zinc-200">
            무엇을 도와드릴까요?
          </h3>
          <p className="mt-2 text-sm text-zinc-500">{agent.name}에게 무엇이든 물어보세요</p>
          <div className="mt-8 w-full max-w-2xl px-4">{composer}</div>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
              {messages.map((m) => (
                <ChatMessageView key={m.id} message={m} />
              ))}
              {status && (
                <p role="status" className="animate-pulse text-xs text-zinc-500">
                  {status}
                </p>
              )}
              <div ref={bottomRef} />
            </div>
          </div>
          <div className="px-4 pb-5">
            <div className="mx-auto w-full max-w-2xl">{composer}</div>
          </div>
        </>
      )}

      <DocsModal
        open={docsOpen}
        agentId={agent.id}
        onClose={() => setDocsOpen(false)}
      />
    </div>
  );
}
