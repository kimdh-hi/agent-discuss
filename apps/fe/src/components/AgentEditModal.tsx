import { useEffect, useRef, useState } from 'react';
import { apiFetch, apiUpload } from '../lib/api';
import type { Agent, Document } from '../lib/types';

interface Props {
  agent: Agent;
  onClose: () => void;
  onUpdated: (agent: Agent) => void;
}

type Tab = 'settings' | 'docs';

const STATUS_LABEL: Record<string, string> = {
  processing: '처리 중',
  ready: '완료',
  failed: '실패',
};

function TrashIcon() {
  return (
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
      <path d="M3 4.5h10M6.5 4.5v-2h3v2M4.5 4.5l.7 9h5.6l.7-9M6.5 7v4M9.5 7v4" />
    </svg>
  );
}

export default function AgentEditModal({ agent, onClose, onUpdated }: Props) {
  const [tab, setTab] = useState<Tab>('settings');

  const [name, setName] = useState(agent.name);
  const [description, setDescription] = useState(agent.description ?? '');
  const [instructions, setInstructions] = useState(agent.instructions);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [docs, setDocs] = useState<Document[]>([]);
  const [uploading, setUploading] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadDocs = () => {
    apiFetch<{ items: Document[] }>(`/agents/${agent.id}/documents`)
      .then((d) => {
        setDocs(d.items);
        if (d.items.some((doc) => doc.status === 'processing')) {
          pollRef.current = setTimeout(loadDocs, 1500);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (tab === 'docs') loadDocs();
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await apiFetch<Agent>(`/agents/${agent.id}`, {
        method: 'PATCH',
        body: { name: name.trim(), description: description.trim(), instructions: instructions.trim() },
      });
      onUpdated(updated);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '에이전트 수정 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async () => {
    const files = fileRef.current?.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setDocsError(null);
    try {
      const fd = new FormData();
      for (const f of files) fd.append('files', f, f.name);
      await apiUpload(`/agents/${agent.id}/documents`, fd);
      if (fileRef.current) fileRef.current.value = '';
      loadDocs();
    } catch (err) {
      setDocsError(err instanceof Error ? err.message : '업로드 실패');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    if (!confirm('이 문서를 삭제할까요?')) return;
    setDocsError(null);
    try {
      await apiFetch(`/agents/${agent.id}/documents/${docId}`, { method: 'DELETE' });
      setDocs((prev) => prev.filter((d) => d.id !== docId));
    } catch (err) {
      setDocsError(err instanceof Error ? err.message : '삭제 실패');
    }
  };

  const tabCls = (t: Tab) =>
    `px-4 py-2 text-sm font-medium transition border-b-2 ${
      tab === t
        ? 'border-violet-500 text-zinc-100'
        : 'border-transparent text-zinc-400 hover:text-zinc-200'
    }`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="card flex w-full max-w-lg flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 탭 헤더 */}
        <div className="flex border-b border-zinc-700 px-4 pt-4">
          <h2 className="mr-4 self-center text-sm font-semibold text-zinc-300">{agent.name}</h2>
          <button type="button" className={tabCls('settings')} onClick={() => setTab('settings')}>
            설정
          </button>
          <button type="button" className={tabCls('docs')} onClick={() => setTab('docs')}>
            지식 문서
            {docs.length > 0 && (
              <span className="ml-1.5 rounded-full bg-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-300">
                {docs.length}
              </span>
            )}
          </button>
        </div>

        {/* 설정 탭 */}
        {tab === 'settings' && (
          <form onSubmit={(e) => void handleSave(e)} className="flex flex-col gap-3 p-5">
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
                className="input-base min-h-[140px] resize-none"
                placeholder="에이전트 역할과 지침"
                rows={6}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
              />
            </div>
            {saveError && <p className="text-xs text-red-400">{saveError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                취소
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!name.trim() || saving}
              >
                {saving ? '저장 중…' : '저장'}
              </button>
            </div>
          </form>
        )}

        {/* 문서 탭 */}
        {tab === 'docs' && (
          <div className="flex flex-col gap-3 p-5">
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                multiple
                className="block flex-1 cursor-pointer text-xs text-zinc-400 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-zinc-700 file:px-3 file:py-1.5 file:text-xs file:text-zinc-200 file:transition hover:file:bg-zinc-600"
              />
              <button
                type="button"
                className="btn btn-secondary shrink-0 text-xs"
                disabled={uploading}
                onClick={() => void handleUpload()}
              >
                {uploading ? '업로드 중…' : '업로드'}
              </button>
            </div>

            {docsError && <p className="text-xs text-red-400">{docsError}</p>}

            <div className="max-h-72 overflow-y-auto">
              {docs.length === 0 ? (
                <p className="py-8 text-center text-xs text-zinc-500">
                  임베딩된 문서가 없습니다.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {docs.map((doc) => (
                    <li
                      key={doc.id}
                      className="flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-200">
                          {doc.filename}
                        </p>
                        <p className="text-[11px] text-zinc-500">
                          {STATUS_LABEL[doc.status] ?? doc.status}
                          {doc.status === 'ready' && ` · ${doc.chunkCount} chunks`}
                          {doc.status === 'failed' && doc.error && ` · ${doc.error}`}
                          {doc.status === 'processing' && (
                            <span className="ml-1 animate-pulse">…</span>
                          )}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label="삭제"
                        className="btn btn-danger btn-sm shrink-0 px-2"
                        onClick={() => void handleDeleteDoc(doc.id)}
                      >
                        <TrashIcon />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex justify-end">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                닫기
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
