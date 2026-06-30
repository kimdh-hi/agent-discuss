import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import type { Room, RoomAgentSpec, RoomTopic, RoomTopicMessage, SourceHit } from '../lib/types';
import type { SearchHit } from '../lib/room-sse';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import MessageMeta from './MessageMeta';
import {
  pendingTopicKey,
  type RoomSendContext,
  useRoomRuntimeStore,
} from './room/room-runtime-store';
import { initialRoomState, toDisplayItems } from './room/room-state';
import { useRoomTypewriterState } from './room/room-typewriter';
import { cancelTopic } from './room/room-topic-api';
import { matchRoomCommands, parseRoomCommand } from './room/parse-room-command';

interface Props {
  room: Room;
}

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

function toSourceHits(hits?: SearchHit[]): SourceHit[] | undefined {
  if (!hits) return undefined;
  return hits.map((h) => ({ filename: h.filename, score: h.score }));
}

export default function RoomDiscussView({ room }: Props) {
  const [agents, setAgents] = useState<RoomAgentSpec[]>([]);
  const [topics, setTopics] = useState<RoomTopic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<RoomTopic | null>(null);
  const [input, setInput] = useState('');
  const [loadingTopic, setLoadingTopic] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const agentColorMap = useRef<Map<string, string>>(new Map());

  const activeKey = selectedTopic ? selectedTopic.id : pendingTopicKey(room.id);

  const entry = useRoomRuntimeStore((s) => s.sessions[activeKey]);
  const init = useRoomRuntimeStore((s) => s.init);
  const hydrate = useRoomRuntimeStore((s) => s.hydrate);
  const send = useRoomRuntimeStore((s) => s.send);
  const discussNew = useRoomRuntimeStore((s) => s.discussNew);
  const reconnect = useRoomRuntimeStore((s) => s.reconnect);
  const stopStream = useRoomRuntimeStore((s) => s.stop);

  const state = entry?.state ?? initialRoomState;
  const { items, streaming, status, error } = state;
  const { items: displayItems } = useRoomTypewriterState(items);

  const getColor = (agentId: string) => {
    if (!agentColorMap.current.has(agentId)) {
      const idx = agentColorMap.current.size % AGENT_COLORS.length;
      agentColorMap.current.set(agentId, AGENT_COLORS[idx]);
    }
    return agentColorMap.current.get(agentId)!;
  };

  const scrollBottom = useCallback(() => {
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }));
  }, []);

  const refreshTopics = useCallback(async () => {
    const list = await apiFetch<RoomTopic[]>(`/rooms/${room.id}/topics`);
    setTopics(list);
    return list;
  }, [room.id]);

  const markTopic = useCallback((topicId: string, patch: Partial<RoomTopic>) => {
    setTopics((prev) => prev.map((topic) => (topic.id === topicId ? { ...topic, ...patch } : topic)));
    setSelectedTopic((prev) => (prev?.id === topicId ? { ...prev, ...patch } : prev));
  }, []);

  const sendCtx = useMemo<RoomSendContext>(
    () => ({
      roomId: room.id,
      onTopicCreated: (topic) => {
        setSelectedTopic(topic);
        setTopics((prev) => upsertTopic(prev, { ...topic, status: 'running' }));
      },
      onTopicStatus: (topicId, patch) => markTopic(topicId, patch),
      onDone: () => {
        void refreshTopics();
      },
    }),
    [room.id, markTopic, refreshTopics],
  );

  useEffect(() => {
    apiFetch<{ room: Room; agents: RoomAgentSpec[] }>(`/rooms/${room.id}`)
      .then((d) => setAgents(d.agents))
      .catch(() => {});
  }, [room.id]);

  useEffect(() => {
    let cancelled = false;
    setTopics([]);
    setSelectedTopic(null);
    setInput('');

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

  useEffect(() => {
    if (!selectedTopic) {
      agentColorMap.current.clear();
      return;
    }
    if (streaming) return;

    let cancelled = false;
    setLoadingTopic(true);
    apiFetch<{ topic: RoomTopic; messages: RoomTopicMessage[] }>(
      `/rooms/${room.id}/topics/${selectedTopic.id}/messages`,
    )
      .then((data) => {
        if (cancelled) return;
        setSelectedTopic(data.topic);
        setTopics((prev) => upsertTopic(prev, data.topic));
        agentColorMap.current.clear();
        init(data.topic.id);
        hydrate(data.topic.id, toDisplayItems(data.messages), data.topic.finalText ?? null);
        scrollBottom();
        if (data.topic.status === 'running') {
          void reconnect(data.topic.id, {
            roomId: room.id,
            onTopicStatus: (topicId, patch) => markTopic(topicId, patch),
            onDone: () => {
              void refreshTopics();
            },
          });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingTopic(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    room.id,
    selectedTopic?.id,
    streaming,
    init,
    hydrate,
    reconnect,
    markTopic,
    refreshTopics,
    scrollBottom,
  ]);

  useEffect(() => {
    scrollBottom();
  }, [displayItems, status, scrollBottom]);

  const runSend = useCallback(
    async (raw: string) => {
      const command = parseRoomCommand(raw);
      if (command.type === 'exit') {
        if (streaming) return;
        setSelectedTopic(null);
        setInput('');
        agentColorMap.current.clear();
        return;
      }

      if (streaming) return;
      setInput('');

      if (command.type === 'new-topic' || !selectedTopic) {
        const message = command.message;
        if (!message) return;
        if (command.type === 'new-topic' && selectedTopic) {
          setSelectedTopic(null);
          agentColorMap.current.clear();
        }
        await discussNew(message, sendCtx);
        return;
      }

      if (!command.message) return;
      init(selectedTopic.id);
      await send(selectedTopic.id, command.message, sendCtx);
    },
    [discussNew, init, selectedTopic, send, sendCtx, streaming],
  );

  const submit = useCallback(() => {
    const raw = input;
    if (!raw.trim()) return;
    void runSend(raw);
  }, [input, runSend]);

  const stop = useCallback(() => {
    const topicId = selectedTopic?.id;
    if (topicId) {
      void cancelTopic(room.id, topicId).catch(() => {});
      stopStream(topicId);
    } else {
      stopStream(pendingTopicKey(room.id));
    }
  }, [room.id, selectedTopic?.id, stopStream]);

  const openNewTopic = () => {
    if (streaming) return;
    setSelectedTopic(null);
    setInput('');
    agentColorMap.current.clear();
  };

  const finalText = useMemo(() => {
    const finalItem = items.find((it) => it.kind === 'final');
    return finalItem && finalItem.kind === 'final' ? finalItem.text : null;
  }, [items]);

  const commandMatches = matchRoomCommands(input);
  const showCommandMenu = commandMatches.length > 0;

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
          ) : displayItems.length === 0 && !finalText ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-zinc-500">
                {selectedTopic ? '이 topic에서 이어서 논의해 보세요.' : '새 topic을 입력하고 토론을 시작하세요.'}
              </p>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-6">
              {displayItems.map((item) =>
                item.kind === 'user' ? (
                  <div key={item.id} className="ml-auto max-w-[82%] rounded-lg bg-zinc-100 px-4 py-2 text-sm text-zinc-900">
                    {item.content}
                  </div>
                ) : item.kind === 'note' ? (
                  <p key={item.id} className="text-center text-[11px] text-zinc-500">
                    - {item.text} -
                  </p>
                ) : item.kind === 'final' ? (
                  <div key={item.id} className="rounded-lg border border-emerald-800 bg-emerald-950/40 px-4 py-3">
                    <p className="mb-2 text-xs font-semibold text-emerald-400">합의 · 결론</p>
                    <div className="prose text-sm text-zinc-200">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.text}</ReactMarkdown>
                    </div>
                  </div>
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
                        <MessageMeta toolCalls={item.toolCalls} sources={toSourceHits(item.sources)} />
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
            <div className="relative flex gap-2">
              {showCommandMenu && (
                <div className="absolute bottom-full left-0 mb-2 w-full overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800 shadow-lg">
                  {commandMatches.map((cmd) => (
                    <button
                      key={cmd.command}
                      type="button"
                      className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-zinc-700"
                      onClick={() => setInput(`${cmd.command} `)}
                    >
                      <span className="text-sm font-medium text-zinc-100">{cmd.command}</span>
                      <span className="truncate text-[11px] text-zinc-500">{cmd.description}</span>
                    </button>
                  ))}
                </div>
              )}
              <input
                className="input-base flex-1"
                placeholder={selectedTopic ? '이 topic에서 이어서 입력하세요' : '새 topic을 입력하세요'}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={streaming}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
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
                  onClick={submit}
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
