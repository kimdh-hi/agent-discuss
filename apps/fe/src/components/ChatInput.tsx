import { useEffect, useRef, useState } from 'react';

interface Props {
  onSend: (text: string) => void;
  onStop: () => void;
  streaming: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export default function ChatInput({ onSend, onStop, streaming, disabled, placeholder }: Props) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!disabled) textareaRef.current?.focus();
  }, [disabled]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 208)}px`;
  }, [text]);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || streaming || disabled) return;
    onSend(trimmed);
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="relative rounded-3xl border border-zinc-700 bg-zinc-800 shadow-[0_4px_16px_rgba(0,0,0,0.3)] transition-colors focus-within:border-zinc-500">
      <textarea
        ref={textareaRef}
        aria-label="메시지 입력"
        className="block max-h-52 w-full resize-none border-0 bg-transparent px-4 pb-1 pt-3.5 text-[15px] leading-6 text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
        placeholder={placeholder ?? '무엇이든 물어보세요'}
        rows={1}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
      />

      <div className="flex items-center justify-end gap-1 px-2.5 pb-2.5 pt-1">
        {streaming ? (
          <button
            type="button"
            aria-label="중단"
            title="중단"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-900 transition hover:bg-white"
            onClick={onStop}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              className="h-3 w-3"
              fill="currentColor"
            >
              <rect x="3" y="3" width="10" height="10" rx="1.5" />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            aria-label="전송"
            title="전송"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-900 transition hover:bg-white disabled:bg-zinc-700 disabled:text-zinc-500"
            disabled={!text.trim() || disabled}
            onClick={submit}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
