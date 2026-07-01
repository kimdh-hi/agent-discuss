import { useState } from 'react';
import type { SourceHit, ToolCall } from '../lib/types';

interface Props {
  toolCalls?: ToolCall[];
  sources?: SourceHit[];
}

function toolLabel(call: ToolCall): string {
  const query = call.args?.query;
  if (typeof query === 'string' && query.trim()) return `${call.name} · "${query.trim()}"`;
  return call.name;
}

export default function MessageMeta({ toolCalls, sources }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const hasTools = !!toolCalls && toolCalls.length > 0;
  const hasSources = !!sources && sources.length > 0;
  if (!hasTools && !hasSources) return null;

  return (
    <div className="flex flex-col gap-1.5">
      {hasTools &&
        toolCalls!.map((call, i) => (
          <div key={i} className="flex items-center gap-1.5 text-[11px] text-zinc-500">
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              className="h-3 w-3 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6.5 2.5 3 6l3.5 3.5M9.5 6.5 13 10l-3.5 3.5M8 1.5 8 14.5" />
            </svg>
            <span>{toolLabel(call)}</span>
          </div>
        ))}

      {hasSources && (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap gap-1.5">
            {sources!.map((src, i) => {
              const body = src.content ?? src.snippet;
              const isOpen = expanded === i;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={!body}
                  onClick={() => body && setExpanded(isOpen ? null : i)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] transition ${
                    isOpen
                      ? 'border-zinc-500 bg-zinc-700 text-zinc-200'
                      : 'border-zinc-700 bg-zinc-800 text-zinc-400'
                  } ${body ? 'cursor-pointer hover:border-zinc-500 hover:text-zinc-200' : 'cursor-default'}`}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 16 16"
                    className="h-3 w-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 2.5h7l3 3v8h-10zM10 2.5v3h3M5.5 8.5h5M5.5 11h5" />
                  </svg>
                  {src.filename}
                  {typeof src.score === 'number' && (
                    <span className="text-zinc-600">({src.score.toFixed(2)})</span>
                  )}
                </button>
              );
            })}
          </div>
          {expanded !== null && (sources![expanded]?.content ?? sources![expanded]?.snippet) && (
            <div className="whitespace-pre-wrap rounded-lg border border-zinc-700 bg-zinc-900/70 px-3 py-2 text-[11px] leading-relaxed text-zinc-400">
              {sources![expanded]?.content ?? sources![expanded]?.snippet}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
