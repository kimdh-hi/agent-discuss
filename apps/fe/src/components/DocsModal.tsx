import { useEffect, useRef, useState } from 'react';
import { apiFetch, apiUpload } from '../lib/api';
import type { Document } from '../lib/types';

interface Props {
  open: boolean;
  agentId: string;
  onClose: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  processing: '처리 중',
  ready: '완료',
  failed: '실패',
};

export default function DocsModal({ open, agentId, onClose }: Props) {
  const [docs, setDocs] = useState<Document[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = () => {
    apiFetch<{ items: Document[] }>(`/agents/${agentId}/documents`)
      .then((d) => {
        setDocs(d.items);
        if (d.items.some((doc) => doc.status === 'processing')) {
          pollRef.current = setTimeout(load, 1500);
        }
      })
      .catch(() => {/* ignore */});
  };

  useEffect(() => {
    if (!open) return;
    load();
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, agentId]);

  if (!open) return null;

  const handleUpload = async () => {
    const files = fileRef.current?.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      for (const f of files) fd.append('files', f, f.name);
      await apiUpload(`/agents/${agentId}/documents`, fd);
      if (fileRef.current) fileRef.current.value = '';
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '업로드 실패');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm('이 문서를 삭제할까요?')) return;
    try {
      await apiFetch(`/agents/${agentId}/documents/${docId}`, { method: 'DELETE' });
      setDocs((prev) => prev.filter((d) => d.id !== docId));
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제 실패');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="card flex w-full max-w-lg flex-col gap-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-zinc-100">지식 문서 관리</h2>

        {/* 업로드 */}
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

        {error && <p className="text-xs text-red-400">{error}</p>}

        {/* 문서 목록 */}
        <div className="max-h-64 overflow-y-auto">
          {docs.length === 0 ? (
            <p className="py-6 text-center text-xs text-zinc-500">문서 없음</p>
          ) : (
            <ul className="space-y-1.5">
              {docs.map((doc) => (
                <li
                  key={doc.id}
                  className="flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-200">{doc.filename}</p>
                    <p className="text-[11px] text-zinc-500">
                      {STATUS_LABEL[doc.status] ?? doc.status}
                      {doc.status === 'ready' && ` · ${doc.chunkCount} chunks`}
                      {doc.status === 'failed' && doc.error && ` · ${doc.error}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="삭제"
                    className="btn btn-danger btn-sm shrink-0 px-2"
                    onClick={() => void handleDelete(doc.id)}
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
                      <path d="M3 4.5h10M6.5 4.5v-2h3v2M4.5 4.5l.7 9h5.6l.7-9M6.5 7v4M9.5 7v4" />
                    </svg>
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
    </div>
  );
}
