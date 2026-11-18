import React from 'react';

function renderInline(text: string): React.ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return tokens.map((token, idx) => {
    if (token.startsWith('**') && token.endsWith('**')) {
      return (
        <strong key={idx} className="font-semibold text-slate-900 dark:text-white">
          {token.slice(2, -2)}
        </strong>
      );
    }
    if (token.startsWith('`') && token.endsWith('`')) {
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#141925] text-blue-700 dark:text-blue-300 font-mono text-[0.85em]"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={idx}>{token}</React.Fragment>;
  });
}

export const MarkdownContent: React.FC<{ content: string }> = ({ content }) => {
  const lines = content.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let inCode = false;
  let codeLines: string[] = [];
  let listItems: { ordered: boolean; text: string }[] = [];

  const flushList = (keyBase: number) => {
    if (listItems.length === 0) return;
    const isOrdered = listItems[0].ordered;
    const Tag = isOrdered ? 'ol' : 'ul';
    blocks.push(
      <Tag
        key={`list_${keyBase}`}
        className={`my-2 space-y-1 pl-5 ${isOrdered ? 'list-decimal' : 'list-disc'} text-slate-700 dark:text-slate-200`}
      >
        {listItems.map((item, i) => (
          <li key={i} className="leading-relaxed">
            {renderInline(item.text)}
          </li>
        ))}
      </Tag>
    );
    listItems = [];
  };

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trimEnd();
    if (line.trim().startsWith('```')) {
      flushList(idx);
      if (inCode) {
        blocks.push(
          <pre
            key={`code_${idx}`}
            className="my-2.5 p-3.5 rounded-xl bg-[#0B1018] text-slate-100 font-mono text-xs overflow-x-auto border border-white/[0.08]"
          >
            <code>{codeLines.join('\n')}</code>
          </pre>
        );
        codeLines = [];
        inCode = false;
      } else {
        inCode = true;
      }
      return;
    }

    if (inCode) {
      codeLines.push(rawLine);
      return;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      flushList(idx);
      return;
    }

    if (trimmed.startsWith('### ')) {
      flushList(idx);
      blocks.push(
        <h4 key={`h4_${idx}`} className="text-sm font-semibold text-slate-900 dark:text-white mt-3 mb-1">
          {renderInline(trimmed.slice(4))}
        </h4>
      );
      return;
    }

    if (trimmed.startsWith('## ')) {
      flushList(idx);
      blocks.push(
        <h3 key={`h3_${idx}`} className="text-base font-semibold text-slate-900 dark:text-white mt-3.5 mb-1.5">
          {renderInline(trimmed.slice(3))}
        </h3>
      );
      return;
    }

    if (trimmed.startsWith('# ')) {
      flushList(idx);
      blocks.push(
        <h2 key={`h2_${idx}`} className="text-lg font-bold text-slate-900 dark:text-white mt-3.5 mb-1.5">
          {renderInline(trimmed.slice(2))}
        </h2>
      );
      return;
    }

    const bulletMatch = trimmed.match(/^[-*]\s+(.*)$/);
    if (bulletMatch) {
      if (listItems.length > 0 && listItems[0].ordered) flushList(idx);
      listItems.push({ ordered: false, text: bulletMatch[1] });
      return;
    }

    const orderedMatch = trimmed.match(/^\d+\.\s+(.*)$/);
    if (orderedMatch) {
      if (listItems.length > 0 && !listItems[0].ordered) flushList(idx);
      listItems.push({ ordered: true, text: orderedMatch[1] });
      return;
    }

    flushList(idx);
    blocks.push(
      <p key={`p_${idx}`} className="leading-relaxed text-slate-700 dark:text-slate-200 my-1.5">
        {renderInline(trimmed)}
      </p>
    );
  });

  flushList(lines.length + 1);
  if (inCode && codeLines.length > 0) {
    blocks.push(
      <pre
        key="code_end"
        className="my-2.5 p-3.5 rounded-xl bg-[#0B1018] text-slate-100 font-mono text-xs overflow-x-auto border border-white/[0.08]"
      >
        <code>{codeLines.join('\n')}</code>
      </pre>
    );
  }

  return <div className="text-sm space-y-1">{blocks}</div>;
};
