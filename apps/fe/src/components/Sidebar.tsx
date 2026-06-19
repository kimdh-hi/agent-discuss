import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import type { Agent, Room, User, Workspace } from '../lib/types';
import AgentCreateModal from './AgentCreateModal';
import AgentEditModal from './AgentEditModal';
import RoomCreateModal from './RoomCreateModal';

interface Props {
  workspaces: Workspace[];
  wsId: string;
  user: User;
  onWsChange: (id: string) => void;
  onWorkspaceCreated: (ws: Workspace) => void;
  onSelectAgent: (agent: Agent) => void;
  onAgentUpdated: (agent: Agent) => void;
  onSelectRoom: (room: Room) => void;
  onLogout: () => void;
}

function Icon({ d, className = 'h-4 w-4 shrink-0 text-zinc-400' }: { d: string; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  agent: 'M8 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM3 13.5a5 5 0 0 1 10 0',
  room: 'M2 4.5a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 14 4.5v5A1.5 1.5 0 0 1 12.5 11H9l-3 3v-3H3.5A1.5 1.5 0 0 1 2 9.5z',
  plus: 'M8 3v10M3 8h10',
  trash: 'M3 4.5h10M6.5 4.5v-2h3v2M4.5 4.5l.7 9h5.6l.7-9',
  edit: 'M11 2.5l2.5 2.5-8 8L3 14l1-2.5 8-9z',
  chevronDown: 'M4 6l4 4 4-4',
  logout: 'M10.5 5.5 13.5 8.5l-3 3M13.5 8.5H5.5M5.5 2.5H3A.5.5 0 0 0 2.5 3v10a.5.5 0 0 0 .5.5h2.5',
} as const;

function SectionHeader({
  label,
  onAdd,
  addLabel,
}: {
  label: string;
  onAdd: () => void;
  addLabel: string;
}) {
  return (
    <div className="flex items-center justify-between px-2 pb-1 pt-3">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      <button
        type="button"
        aria-label={addLabel}
        title={addLabel}
        className="rounded p-0.5 text-zinc-500 transition hover:bg-zinc-700 hover:text-zinc-300"
        onClick={onAdd}
      >
        <Icon d={ICONS.plus} className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

const itemBase =
  'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors text-left';
const itemActive = 'bg-zinc-700/70 font-medium text-zinc-50';
const itemInactive = 'text-zinc-300 hover:bg-zinc-700/50';

export default function Sidebar({
  workspaces,
  wsId,
  user,
  onWsChange,
  onWorkspaceCreated,
  onSelectAgent,
  onAgentUpdated,
  onSelectRoom,
  onLogout,
}: Props) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [agentModalOpen, setAgentModalOpen] = useState(false);
  const [agentEditTarget, setAgentEditTarget] = useState<Agent | null>(null);
  const [roomModalOpen, setRoomModalOpen] = useState(false);
  const [wsMenuOpen, setWsMenuOpen] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [creatingWs, setCreatingWs] = useState(false);

  const loadAgents = useCallback(() => {
    if (!wsId) return;
    apiFetch<Agent[] | { items: Agent[] }>(`/workspaces/${wsId}/agents`)
      .then((d) => {
        setAgents(Array.isArray(d) ? d : d.items ?? []);
      })
      .catch(() => {/* ignore */});
  }, [wsId]);

  const loadRooms = useCallback(() => {
    if (!wsId) return;
    apiFetch<Room[] | { items: Room[] }>(`/workspaces/${wsId}/rooms`)
      .then((d) => {
        setRooms(Array.isArray(d) ? d : d.items ?? []);
      })
      .catch(() => {/* ignore */});
  }, [wsId]);

  useEffect(() => {
    setAgents([]);
    setRooms([]);
    setActiveAgentId(null);
    setActiveRoomId(null);
    loadAgents();
    loadRooms();
  }, [loadAgents, loadRooms]);

  const handleDeleteAgent = async (e: React.MouseEvent, agentId: string) => {
    e.stopPropagation();
    if (!confirm('이 에이전트를 삭제할까요?')) return;
    try {
      await apiFetch(`/agents/${agentId}`, { method: 'DELETE' });
      setAgents((prev) => prev.filter((a) => a.id !== agentId));
      if (activeAgentId === agentId) setActiveAgentId(null);
    } catch {/* ignore */}
  };

  const handleCreateWs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWsName.trim() || creatingWs) return;
    setCreatingWs(true);
    try {
      const ws = await apiFetch<Workspace>('/workspaces', {
        method: 'POST',
        body: { name: newWsName.trim() },
      });
      setNewWsName('');
      setWsMenuOpen(false);
      onWorkspaceCreated(ws);
    } catch {/* ignore */} finally {
      setCreatingWs(false);
    }
  };

  const currentWs = workspaces.find((w) => w.id === wsId);

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-700/60 bg-zinc-800">
      {/* 워크스페이스 선택 */}
      <div className="relative border-b border-zinc-700/60 p-2">
        <button
          type="button"
          aria-expanded={wsMenuOpen}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-zinc-700/60"
          onClick={() => setWsMenuOpen((v) => !v)}
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-violet-600 text-[11px] font-bold text-white">
            {(currentWs?.name ?? 'W').slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-100">
            {currentWs?.name ?? '워크스페이스 선택'}
          </span>
          <Icon d={ICONS.chevronDown} className={`h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform ${wsMenuOpen ? 'rotate-180' : ''}`} />
        </button>

        {wsMenuOpen && (
          <div className="absolute left-2 right-2 top-full z-30 mt-1 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 py-1 shadow-xl">
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                type="button"
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-zinc-800 ${ws.id === wsId ? 'font-medium text-zinc-50' : 'text-zinc-300'}`}
                onClick={() => {
                  onWsChange(ws.id);
                  setWsMenuOpen(false);
                }}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-violet-600/80 text-[10px] font-bold text-white">
                  {ws.name.slice(0, 1).toUpperCase()}
                </span>
                {ws.name}
              </button>
            ))}
            <div className="my-1 border-t border-zinc-800" />
            <form onSubmit={(e) => void handleCreateWs(e)} className="flex items-center gap-1.5 px-2 pb-1">
              <input
                className="input-base h-7 flex-1 px-2 py-1 text-xs"
                placeholder="새 워크스페이스 이름"
                value={newWsName}
                onChange={(e) => setNewWsName(e.target.value)}
              />
              <button
                type="submit"
                className="btn btn-primary h-7 rounded-md px-2 text-xs"
                disabled={!newWsName.trim() || creatingWs}
              >
                추가
              </button>
            </form>
          </div>
        )}
      </div>

      {/* 에이전트 섹션 */}
      <div className="px-2">
        <SectionHeader
          label="에이전트"
          addLabel="새 에이전트"
          onAdd={() => setAgentModalOpen(true)}
        />
        <ul className="space-y-px">
          {agents.length === 0 && (
            <li className="px-2 py-1 text-[11px] text-zinc-500">아직 에이전트가 없습니다.</li>
          )}
          {agents.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                className={`${itemBase} pr-1 ${activeAgentId === a.id ? itemActive : itemInactive}`}
                onClick={() => {
                  setActiveAgentId(a.id);
                  setActiveRoomId(null);
                  onSelectAgent(a);
                }}
              >
                <Icon d={ICONS.agent} className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                <span className="min-w-0 flex-1 truncate">{a.name}</span>
                <button
                  type="button"
                  aria-label={`${a.name} 편집`}
                  className="hidden shrink-0 rounded p-0.5 text-zinc-500 transition hover:bg-zinc-600/60 hover:text-zinc-300 group-hover:block"
                  onClick={(e) => { e.stopPropagation(); setAgentEditTarget(a); }}
                >
                  <Icon d={ICONS.edit} className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  aria-label={`${a.name} 삭제`}
                  className="hidden shrink-0 rounded p-0.5 text-zinc-500 transition hover:bg-red-900/50 hover:text-red-400 group-hover:block"
                  onClick={(e) => void handleDeleteAgent(e, a.id)}
                >
                  <Icon d={ICONS.trash} className="h-3 w-3" />
                </button>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* 룸 섹션 */}
      <div className="px-2">
        <SectionHeader
          label="룸"
          addLabel="새 룸"
          onAdd={() => setRoomModalOpen(true)}
        />
        <ul className="space-y-px">
          {rooms.length === 0 && (
            <li className="px-2 py-1 text-[11px] text-zinc-500">아직 룸이 없습니다.</li>
          )}
          {rooms.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className={`${itemBase} ${activeRoomId === r.id ? itemActive : itemInactive}`}
                onClick={() => {
                  setActiveRoomId(r.id);
                  setActiveAgentId(null);
                  onSelectRoom(r);
                }}
              >
                <Icon d={ICONS.room} className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                <span className="min-w-0 flex-1 truncate">{r.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* 하단: 사용자 */}
      <div className="mt-auto border-t border-zinc-700/60 p-2">
        <div className="flex items-center gap-2 rounded-lg px-2 py-1.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-600 text-[11px] font-semibold text-white">
            {user.email.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-zinc-400">{user.email}</span>
          <button
            type="button"
            aria-label="로그아웃"
            title="로그아웃"
            className="shrink-0 rounded p-1 text-zinc-500 transition hover:bg-zinc-700 hover:text-zinc-300"
            onClick={onLogout}
          >
            <Icon d={ICONS.logout} className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <AgentCreateModal
        open={agentModalOpen}
        wsId={wsId}
        onClose={() => setAgentModalOpen(false)}
        onCreated={(agent) => {
          setAgents((prev) => [...prev, agent]);
          setAgentModalOpen(false);
          setActiveAgentId(agent.id);
          setActiveRoomId(null);
          onSelectAgent(agent);
        }}
      />

      {agentEditTarget && (
        <AgentEditModal
          agent={agentEditTarget}
          onClose={() => setAgentEditTarget(null)}
          onUpdated={(updated) => {
            setAgents((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
            setAgentEditTarget(null);
            onAgentUpdated(updated);
          }}
        />
      )}

      <RoomCreateModal
        open={roomModalOpen}
        wsId={wsId}
        agents={agents}
        onClose={() => setRoomModalOpen(false)}
        onCreated={(room) => {
          setRooms((prev) => [...prev, room]);
          setRoomModalOpen(false);
          setActiveRoomId(room.id);
          setActiveAgentId(null);
          onSelectRoom(room);
        }}
      />
    </aside>
  );
}
