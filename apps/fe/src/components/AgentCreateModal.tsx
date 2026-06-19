import { useRef, useState } from 'react';
import { apiFetch, apiUpload } from '../lib/api';
import type { Agent } from '../lib/types';

interface Props {
  open: boolean;
  wsId: string;
  onClose: () => void;
  onCreated: (agent: Agent) => void;
}

export default function AgentCreateModal({ open, wsId, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('도움이 되는 어시스턴트');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const agent = await apiFetch<Agent>(`/workspaces/${wsId}/agents`, {
        method: 'POST',
        body: {
          name: name.trim(),
          description: description.trim(),
          instructions: instructions.trim() || '도움이 되는 어시스턴트',
        },
      });
      const files = fileRef.current?.files;
      if (files && files.length > 0) {
        const fd = new FormData();
        for (const f of files) fd.append('files', f, f.name);
        await apiUpload(`/agents/${agent.id}/documents`, fd);
      }
      setName('');
      setDescription('');
      setInstructions('도움이 되는 어시스턴트');
      if (fileRef.current) fileRef.current.value = '';
      onCreated(agent);
    } catch (err) {
      setError(err instanceof Error ? err.message : '에이전트 생성 실패');
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
        <h2 className="mb-4 text-base font-semibold text-zinc-100">새 에이전트</h2>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-400">이름</label>
            <input
              className="input-base"
              placeholder="에이전트 이름"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-400">
              역할 설명 (진행자가 발언 순서를 정할 때 참고)
            </label>
            <input
              className="input-base"
              placeholder="예: 보안 위험 검토가 필요할 때 나선다"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-400">지침 (시스템 프롬프트)</label>
            <textarea
              className="input-base min-h-[80px] resize-none"
              placeholder="에이전트 역할과 지침"
              rows={3}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-400">
              지식 문서 (선택, 여러 개 가능)
            </label>
            <input
              ref={fileRef}
              type="file"
              multiple
              className="block w-full cursor-pointer text-xs text-zinc-400 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-zinc-700 file:px-3 file:py-1.5 file:text-xs file:text-zinc-200 file:transition hover:file:bg-zinc-600"
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              취소
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!name.trim() || loading}
            >
              {loading ? '생성 중…' : '생성'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
