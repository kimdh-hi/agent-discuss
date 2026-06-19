import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage } from '../lib/types';
import MessageMeta from './MessageMeta';

interface Props {
  message: ChatMessage;
}

export default function ChatMessageView({ message }: Props) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-zinc-700 px-4 py-2.5 text-sm leading-6 text-zinc-100">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {message.pending && !message.content ? (
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <span className="inline-flex gap-0.5">
            <span className="animate-bounce [animation-delay:0ms]">●</span>
            <span className="animate-bounce [animation-delay:150ms]">●</span>
            <span className="animate-bounce [animation-delay:300ms]">●</span>
          </span>
          <span>생성 중…</span>
        </div>
      ) : (
        <div className="prose max-w-none text-sm text-zinc-100">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>
      )}

      <MessageMeta toolCalls={message.toolCalls} sources={message.sources} />
    </div>
  );
}
