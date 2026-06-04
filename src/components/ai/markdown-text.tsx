'use client';

import { cn } from '@/lib/utils';

interface Props { content: string; className?: string; }

/**
 * Renderiza markdown básico sem dependências externas.
 * Suporta: **bold**, *italic*, `code`, ## heading, - lists, linha em branco.
 */
export function MarkdownText({ content, className }: Props) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];
  let key = 0;

  function flushList() {
    if (listItems.length === 0) return;
    elements.push(
      <ul key={key++} className="my-1 space-y-0.5 pl-4">
        {listItems.map((item, i) => (
          <li key={i} className="text-sm list-disc">{inline(item)}</li>
        ))}
      </ul>
    );
    listItems = [];
  }

  function inline(text: string): React.ReactNode[] {
    const parts: React.ReactNode[] = [];
    // Process bold, italic, code in order
    const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)/g;
    let last = 0, m;
    while ((m = regex.exec(text)) !== null) {
      if (m.index > last) parts.push(text.slice(last, m.index));
      if (m[1]) parts.push(<strong key={m.index} className="font-semibold text-zinc-100">{m[2]}</strong>);
      else if (m[3]) parts.push(<em key={m.index} className="italic text-zinc-300">{m[4]}</em>);
      else if (m[5]) parts.push(<code key={m.index} className="bg-zinc-800 text-[#E09B5A] px-1 py-0.5 rounded text-[11px] font-mono">{m[6]}</code>);
      last = m.index + m[0].length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
  }

  for (const line of lines) {
    // Headings
    if (/^#{1,3}\s/.test(line)) {
      flushList();
      const level = (line.match(/^#+/) ?? [''])[0].length;
      const text = line.replace(/^#+\s/, '');
      const cls = level === 1 ? 'text-base font-bold text-zinc-100 mt-3 mb-1'
                : level === 2 ? 'text-sm font-semibold text-zinc-200 mt-2 mb-0.5'
                : 'text-sm font-medium text-zinc-300 mt-1';
      elements.push(<p key={key++} className={cls}>{inline(text)}</p>);
    }
    // List items
    else if (/^[-*•]\s/.test(line)) {
      listItems.push(line.replace(/^[-*•]\s/, ''));
    }
    // Numbered list
    else if (/^\d+\.\s/.test(line)) {
      listItems.push(line.replace(/^\d+\.\s/, ''));
    }
    // Empty line
    else if (line.trim() === '') {
      flushList();
      elements.push(<div key={key++} className="h-2" />);
    }
    // Regular paragraph
    else {
      flushList();
      elements.push(<p key={key++} className="text-sm leading-relaxed">{inline(line)}</p>);
    }
  }
  flushList();

  return <div className={cn('text-zinc-300 space-y-0', className)}>{elements}</div>;
}
