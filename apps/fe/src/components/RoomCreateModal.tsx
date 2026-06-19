import { useState } from 'react';
import { apiFetch } from '../lib/api';
import type { Agent, Room } from '../lib/types';

interface Props {
  open: boolean;
  wsId: string;
  agents: Agent[];
  onClose: () => void;
  onCreated: (room: Room) => void;
}

export default function RoomCreateModal({ open, wsId, agents, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || selectedIds.size === 0 || loading) return;
    setLoading(true);
    setError(null);
    try {
      const room = await apiFetch<Room>(`/workspaces/${wsId}/rooms`, {
        method: 'POST',
        body: {
          name: name.trim(),
          agentIds: [...selectedIds],
        },
      });
      setName('');
      setSelectedIds(new Set());
      onCreated(room);
    } catch (err) {
      setError(err instanceof Error ? err.message : '룸 생성 실패');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-base font-semibold text-zinc-100">새 룸</h2>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-400">이름</label>
            <input
              className="input-base"
              placeholder="룸 이름"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-400">
              에이전트 선택 (1개 이상)
            </label>
            {agents.length === 0 ? (
              <p className="text-xs text-zinc-500">워크스페이스에 에이전트가 없습니다.</p>
            ) : (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900">
                {agents.map((a) => (
                  <label
                    key={a.id}
                    className="flex cursor-pointer items-center gap-2.5 px-3 py-2 transition hover:bg-zinc-800"
                  >
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-violet-500"
                      checked={selectedIds.has(a.id)}
                      onChange={() => toggle(a.id)}
                    />
                    <span className="text-sm text-zinc-200">{a.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              취소
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!name.trim() || selectedIds.size === 0 || loading}
            >
              {loading ? '생성 중…' : '생성'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
