import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, apiStreamGet, parseSse, ApiError } from '../lib/api';
import type { Room, RoomAgentSpec, RoomTopic, RoomTopicMessage, RoomTurn, SourceHit } from '../lib/types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import MessageMeta from './MessageMeta';

interface Props {
  room: Room;
}

type DisplayItem =
  | { kind: 'user'; id: string; content: string }
  | { kind: 'note'; id: string; text: string }
  | ({ kind: 'turn'; id: string } & RoomTurn);

const AGENT_COLORS = [
  'border-violet-500',
  'border-sky-500',
  'border-emerald-500',
  'border-amber-500',
  'border-rose-500',
];

function upsertTopic(topics: RoomTopic[], topic: RoomTopic): RoomTopic[] {
  const next = [topic, ...topics.filter((item) => item.id !== topic.id)];
  return next.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function topicStatusLabel(status: RoomTopic['status']): string {
  if (status === 'running') return '진행 중';
  if (status === 'completed') return '완료';
  if (status === 'failed') return '실패';
  return '열림';
}

function formatTopicTime(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function toDisplayItems(messages: RoomTopicMessage[]): DisplayItem[] {
  return messages.flatMap<DisplayItem>((message) => {
    if (message.role === 'user') {
      return [{ kind: 'user', id: message.id, content: message.content }];
    }
    if (message.role === 'agent') {
      return [{
        kind: 'turn',
        id: message.id,
        agentId: message.agentId ?? '',
        agentName: message.agentName ?? '에이전트',
        round: message.round ?? 0,
        role: message.role,
        content: message.content,
        done: true,
      }];
    }
    return [];
  });
}

export default function RoomDiscussView({ room }: Props) {
  const [agents, setAgents] = useState<RoomAgentSpec[]>([]);
  const [topics, setTopics] = useState<RoomTopic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<RoomTopic | null>(null);
  const [input, setInput] = useState('');
  const [items, setItems] = useState<DisplayItem[]>([]);
  const [finalText, setFinalText] = useState<string | null>(null);
  const [loadingTopic, setLoadingTopic] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const agentColorMap = useRef<Map<string, string>>(new Map());

  const getColor = (agentId: string) => {
    if (!agentColorMap.current.has(agentId)) {
      const idx = agentColorMap.current.size % AGENT_COLORS.length;
      agentColorMap.current.set(agentId, AGENT_COLORS[idx]);
    }
    return agentColorMap.current.get(agentId)!;
  };

  const scrollBottom = () => {
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }));
  };

  const refreshTopics = useCallback(async () => {
    const list = await apiFetch<RoomTopic[]>(`/rooms/${room.id}/topics`);
    setTopics(list);
    return list;
  }, [room.id]);

  useEffect(() => {
    apiFetch<{ room: Room; agents: RoomAgentSpec[] }>(`/rooms/${room.id}`)
      .then((d) => setAgents(d.agents))
      .catch(() => {});
  }, [room.id]);

  useEffect(() => {
    let cancelled = false;
    setTopics([]);
    setSelectedTopic(null);
    setItems([]);
    setFinalText(null);
    setInput('');
    setError(null);

    apiFetch<RoomTopic[]>(`/rooms/${room.id}/topics`)
      .then((list) => {
        if (cancelled) return;
        setTopics(list);
        setSelectedTopic(list[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setTopics([]);
      });

    return () => {
      cancelled = true;
    };
  }, [room.id]);

  const markTopic = useCallback((topicId: string, patch: Partial<RoomTopic>) => {
    setTopics((prev) => prev.map((topic) => (topic.id === topicId ? { ...topic, ...patch } : topic)));
    setSelectedTopic((prev) => (prev?.id === topicId ? { ...prev, ...patch } : prev));
  }, []);

  const consumeStream = useCallback(
    async (res: Response, activeTopic: RoomTopic | null) => {
      for await (const { event, data } of parseSse(res)) {
        if (event === 'turn') {
          if (data.phase === 'start') {
            setItems((prev) => [
              ...prev,
              {
                kind: 'turn',
                id: `turn-${Date.now()}-${prev.length}`,
                agentId: String(data.agentId ?? ''),
                agentName: String(data.agentName ?? ''),
                round: Number(data.round ?? 0),
                role: String(data.role ?? ''),
                content: '',
                done: false,
              },
            ]);
          } else if (data.phase === 'end') {
            setItems((prev) =>
              prev.map((item, i) =>
                item.kind === 'turn' && i === prev.length - 1 && item.agentId === data.agentId
                  ? { ...item, done: true }
                  : item,
              ),
            );
          }
        } else if (event === 'content') {
          setItems((prev) => {
            let idx = -1;
            for (let i = prev.length - 1; i >= 0; i--) {
              const item = prev[i];
              if (item.kind === 'turn' && item.agentId === data.agentId && !item.done) {
                idx = i;
                break;
              }
            }
            if (idx === -1) return prev;
            const updated = [...prev];
            const item = updated[idx];
            if (item.kind === 'turn') {
              updated[idx] = { ...item, content: item.content + String(data.text ?? '') };
            }
            return updated;
          });
          scrollBottom();
        } else if (event === 'tool') {
          const name = String(data.name ?? '');
          const args = (data.args as Record<string, unknown>) ?? {};
          setItems((prev) => {
            let idx = -1;
            for (let i = prev.length - 1; i >= 0; i--) {
              const item = prev[i];
              if (item.kind === 'turn' && item.agentId === data.agentId && !item.done) {
                idx = i;
                break;
              }
            }
            if (idx === -1) return prev;
            const updated = [...prev];
            const item = updated[idx];
            if (item.kind === 'turn') {
              updated[idx] = { ...item, toolCalls: [...(item.toolCalls ?? []), { name, args }] };
            }
            return updated;
          });
        } else if (event === 'source') {
          const hits = (data.hits as SourceHit[]) ?? [];
          setItems((prev) => {
            let idx = -1;
            for (let i = prev.length - 1; i >= 0; i--) {
              const item = prev[i];
              if (item.kind === 'turn' && item.agentId === data.agentId && !item.done) {
                idx = i;
                break;
              }
            }
            if (idx === -1) return prev;
            const updated = [...prev];
            const item = updated[idx];
            if (item.kind === 'turn') {
              updated[idx] = { ...item, sources: hits };
            }
            return updated;
          });
        } else if (event === 'status') {
          const phase = String(data.phase ?? '');
          const detail = String(data.detail ?? phase);
          if (phase === 'pickSpeaker') {
            setItems((prev) => [
              ...prev,
              { kind: 'note', id: `note-${Date.now()}-${prev.length}`, text: detail },
            ]);
            scrollBottom();
          } else {
            setStatus(detail);
          }
        } else if (event === 'final') {
          const text = String(data.text ?? '');
          setFinalText(text);
          if (activeTopic) markTopic(activeTopic.id, { status: 'completed', finalText: text });
          setStatus(null);
          scrollBottom();
        } else if (event === 'error') {
          setError(String(data.message ?? '오류가 발생했습니다.'));
          if (activeTopic) markTopic(activeTopic.id, { status: 'failed' });
          setStatus(null);
        } else if (event === 'done') {
          if (activeTopic) markTopic(activeTopic.id, { status: 'completed' });
          setStatus(null);
        }
      }
    },
    [markTopic],
  );

  const start = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    setError(null);
    setStatus(null);
    setStreaming(true);
    setInput('');

    let aborted = false;
    const controller = new AbortController();
    abortRef.current = () => {
      aborted = true;
      controller.abort();
    };

    let activeTopic: RoomTopic | null = selectedTopic;
    try {
      if (!activeTopic) {
        activeTopic = await apiFetch<RoomTopic>(`/rooms/${room.id}/topics`, {
          method: 'POST',
          body: { title: text },
        });
        setSelectedTopic(activeTopic);
        setTopics((prev) => upsertTopic(prev, activeTopic!));
        setItems([]);
      }

      setFinalText(null);
      markTopic(activeTopic.id, { status: 'running', finalText: null, completedAt: null });
      setItems((prev) => [...prev, { kind: 'user', id: `user-${Date.now()}`, content: text }]);
      scrollBottom();

      const res = await fetch(`/api/rooms/${room.id}/topics/${activeTopic.id}/discuss`, {
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

      await consumeStream(res, activeTopic);
    } catch (err) {
      if (!aborted) {
        setError(err instanceof ApiError ? err.message : '응답 처리 중 오류가 발생했습니다.');
        if (activeTopic) markTopic(activeTopic.id, { status: 'failed' });
      }
    } finally {
      setStreaming(false);
      setStatus(null);
      abortRef.current = null;
      void refreshTopics();
    }
  }, [consumeStream, input, markTopic, refreshTopics, room.id, selectedTopic, streaming]);

  const reconnect = useCallback(
    async (topic: RoomTopic) => {
      setError(null);
      setStatus(null);
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = () => controller.abort();

      try {
        const res = await apiStreamGet(
          `/rooms/${room.id}/topics/${topic.id}/stream`,
          controller.signal,
        );
        await consumeStream(res, topic);
      } catch {
        // 재연결 실패/중단 시 무시 — 아래 finally에서 최신 상태로 갱신
      } finally {
        setStreaming(false);
        setStatus(null);
        abortRef.current = null;
        void refreshTopics();
      }
    },
    [consumeStream, refreshTopics, room.id],
  );

  useEffect(() => {
    if (!selectedTopic) {
      setItems([]);
      setFinalText(null);
      agentColorMap.current.clear();
      return;
    }
    if (streaming) return;

    let cancelled = false;
    setLoadingTopic(true);
    setError(null);
    apiFetch<{ topic: RoomTopic; messages: RoomTopicMessage[] }>(
      `/rooms/${room.id}/topics/${selectedTopic.id}/messages`,
    )
      .then((data) => {
        if (cancelled) return;
        setSelectedTopic(data.topic);
        setTopics((prev) => upsertTopic(prev, data.topic));
        setItems(toDisplayItems(data.messages));
        setFinalText(data.topic.finalText ?? null);
        agentColorMap.current.clear();
        scrollBottom();
        if (data.topic.status === 'running') {
          void reconnect(data.topic);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Topic을 불러오지 못했습니다.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingTopic(false);
      });

    return () => {
      cancelled = true;
    };
  }, [room.id, selectedTopic?.id, streaming, reconnect]);

  useEffect(() => () => abortRef.current?.(), []);

  const stop = useCallback(() => {
    const topicId = selectedTopic?.id;
    if (topicId) {
      void apiFetch(`/rooms/${room.id}/topics/${topicId}/cancel`, { method: 'POST' }).catch(() => {});
    }
    abortRef.current?.();
  }, [room.id, selectedTopic?.id]);

  const openNewTopic = () => {
    if (streaming) return;
    setSelectedTopic(null);
    setItems([]);
    setFinalText(null);
    setInput('');
    setError(null);
    agentColorMap.current.clear();
  };

  return (
    <div className="flex h-full flex-1 bg-zinc-900">
      <aside className="flex w-72 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950/60">
        <div className="border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-zinc-100">Topics</h2>
            <button type="button" className="btn btn-secondary btn-sm text-xs" onClick={openNewTopic} disabled={streaming}>
              새 topic
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {topics.length === 0 ? (
            <p className="px-2 py-4 text-xs text-zinc-500">아직 저장된 topic이 없습니다.</p>
          ) : (
            <div className="space-y-1">
              {topics.map((topic) => {
                const active = selectedTopic?.id === topic.id;
                return (
                  <button
                    key={topic.id}
                    type="button"
                    className={`w-full rounded-lg px-3 py-2 text-left transition ${
                      active ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                    }`}
                    disabled={streaming}
                    onClick={() => setSelectedTopic(topic)}
                  >
                    <span className="line-clamp-2 text-sm font-medium">{topic.title}</span>
                    <span className="mt-1 flex items-center justify-between gap-2 text-[11px] text-zinc-500">
                      <span>{formatTopicTime(topic.createdAt)}</span>
                      <span>{topicStatusLabel(topic.status)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-zinc-800 px-6 py-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">{room.name}</h2>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                {selectedTopic ? selectedTopic.title : '새 topic'} · 참여 에이전트 {agents.length}명
              </p>
            </div>
          </div>
          {agents.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {agents.map((a) => (
                <span
                  key={a.id}
                  className="inline-flex items-center gap-1 rounded-full bg-zinc-700/60 px-2 py-0.5 text-[11px] text-zinc-300"
                >
                  <svg aria-hidden="true" viewBox="0 0 16 16" className="h-2.5 w-2.5 shrink-0 text-zinc-400" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM3 13.5a5 5 0 0 1 10 0" />
                  </svg>
                  {a.name}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingTopic ? (
            <div className="flex h-full items-center justify-center">
              <p className="animate-pulse text-sm text-zinc-500">Topic을 불러오는 중…</p>
            </div>
          ) : items.length === 0 && !finalText ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-zinc-500">
                {selectedTopic ? '이 topic에서 이어서 논의해 보세요.' : '새 topic을 입력하고 토론을 시작하세요.'}
              </p>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-6">
              {items.map((item) =>
                item.kind === 'user' ? (
                  <div key={item.id} className="ml-auto max-w-[82%] rounded-lg bg-zinc-100 px-4 py-2 text-sm text-zinc-900">
                    {item.content}
                  </div>
                ) : item.kind === 'note' ? (
                  <p key={item.id} className="text-center text-[11px] text-zinc-500">
                    - {item.text} -
                  </p>
                ) : (
                  <div
                    key={item.id}
                    className={`rounded-lg border-l-4 bg-zinc-800/60 px-4 py-3 ${getColor(item.agentId)}`}
                  >
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="text-xs font-semibold text-zinc-200">{item.agentName}</span>
                      {item.round > 0 && (
                        <span className="rounded bg-zinc-700/70 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                          T{item.round}
                        </span>
                      )}
                    </div>
                    {item.content ? (
                      <div className="prose text-sm text-zinc-300">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="animate-pulse text-xs text-zinc-500">생성 중…</p>
                    )}
                    {((item.toolCalls && item.toolCalls.length > 0) ||
                      (item.sources && item.sources.length > 0)) && (
                      <div className="mt-2">
                        <MessageMeta toolCalls={item.toolCalls} sources={item.sources} />
                      </div>
                    )}
                  </div>
                ),
              )}

              {status && (
                <p role="status" className="animate-pulse text-center text-xs text-zinc-500">
                  - {status} -
                </p>
              )}

              {finalText && (
                <div className="rounded-lg border border-emerald-800 bg-emerald-950/40 px-4 py-3">
                  <p className="mb-2 text-xs font-semibold text-emerald-400">합의 · 결론</p>
                  <div className="prose text-sm text-zinc-200">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{finalText}</ReactMarkdown>
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className="border-t border-zinc-800 px-4 py-4">
          <div className="mx-auto w-full max-w-2xl">
            {error && (
              <p role="alert" className="mb-2 text-xs text-red-400">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <input
                className="input-base flex-1"
                placeholder={selectedTopic ? '이 topic에서 이어서 입력하세요' : '새 topic을 입력하세요'}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={streaming}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) void start();
                }}
              />
              {streaming ? (
                <button type="button" className="btn btn-secondary shrink-0" onClick={stop}>
                  중단
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary shrink-0"
                  disabled={!input.trim()}
                  onClick={() => void start()}
                >
                  {selectedTopic ? '이어가기' : '시작'}
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
