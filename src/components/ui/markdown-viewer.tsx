'use client';

import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FileText, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Mermaid diagram renderer
// ---------------------------------------------------------------------------
function MermaidBlock({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function render() {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          themeVariables: {
            background: '#0f172a',
            primaryColor: '#1e40af',
            primaryTextColor: '#e2e8f0',
            lineColor: '#64748b',
            edgeLabelBackground: '#1e293b',
          },
        });
        const id = `mermaid-${Math.random().toString(36).slice(2)}`;
        const { svg } = await mermaid.render(id, code.trim());
        // Strip any script tags that could appear in SVG (defense-in-depth)
        const sanitized = svg.replace(/<script[\s\S]*?<\/script>/gi, '');
        if (!cancelled) setSvg(sanitized);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Mermaid render error');
      }
    }
    render();
    return () => { cancelled = true; };
  }, [code]);

  if (error) {
    return (
      <div className="rounded-lg border border-rose-700/50 bg-rose-950/30 p-3 text-xs text-rose-400 font-mono my-4">
        ⚠ Mermaid 渲染失败: {error}
      </div>
    );
  }
  if (!svg) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-slate-700/60 bg-slate-900/50 py-8 text-xs text-slate-500 animate-pulse my-4">
        正在渲染图表...
      </div>
    );
  }
  return (
    <div
      className="overflow-x-auto rounded-lg border border-slate-700/60 bg-slate-900/50 p-4 flex justify-center my-4"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

// ---------------------------------------------------------------------------
// Custom component map — no prose, full control
// ---------------------------------------------------------------------------
const components: React.ComponentProps<typeof ReactMarkdown>['components'] = {
  // Headings
  h1: ({ children }) => (
    <h1 className="text-lg font-bold text-slate-100 mt-8 mb-3 pb-2 border-b border-slate-700/60 first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-base font-semibold text-slate-100 mt-7 mb-2.5 first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-semibold text-slate-200 mt-5 mb-2 first:mt-0">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-sm font-medium text-slate-300 mt-4 mb-1.5 first:mt-0">
      {children}
    </h4>
  ),

  // Paragraph
  p: ({ children }) => (
    <p className="text-sm text-slate-300 leading-7 my-3 first:mt-0">
      {children}
    </p>
  ),

  // Lists
  ul: ({ children }) => (
    <ul className="my-3 space-y-1.5 pl-5 list-disc marker:text-slate-500">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-3 space-y-1.5 pl-5 list-decimal marker:text-slate-500">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="text-sm text-slate-300 leading-6 pl-1">
      {children}
    </li>
  ),

  // Inline code & code blocks
  code: ({ className, children, ...props }: any) => {
    const isBlock = !!(props as any).node?.position;
    const lang = /language-(\w+)/.exec(className ?? '')?.[1] ?? '';
    const code = String(children ?? '').replace(/\n$/, '');

    // mermaid block
    if (lang === 'mermaid') return <MermaidBlock code={code} />;

    // fenced code block (has a language class or multi-line)
    if (className || code.includes('\n')) {
      return (
        <code className="block font-mono text-xs text-slate-300 leading-6 whitespace-pre-wrap">
          {children}
        </code>
      );
    }

    // inline code
    return (
      <code className="font-mono text-xs text-cyan-300 bg-slate-800/80 px-1.5 py-0.5 rounded">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-4 rounded-lg border border-slate-700/60 bg-slate-900/70 p-4 overflow-x-auto">
      {children}
    </pre>
  ),

  // Blockquote
  blockquote: ({ children }) => (
    <blockquote className="my-4 border-l-2 border-slate-600 pl-4 text-sm text-slate-400 italic">
      {children}
    </blockquote>
  ),

  // HR
  hr: () => <hr className="my-6 border-slate-700/60" />,

  // Links
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2"
    >
      {children}
    </a>
  ),

  // Strong / Em
  strong: ({ children }) => (
    <strong className="font-semibold text-slate-100">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic text-slate-300">{children}</em>
  ),

  // Table
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto rounded-lg border border-slate-700/60">
      <table className="w-full text-xs border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-slate-800/60">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="px-3 py-2 text-left font-semibold text-slate-200 border-b border-slate-700/60">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 text-slate-300 border-b border-slate-700/40">
      {children}
    </td>
  ),
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
interface MarkdownViewerProps {
  content: string;
  className?: string;
}

export function MarkdownViewer({ content, className }: MarkdownViewerProps) {
  const [tab, setTab] = useState<'preview' | 'raw'>('preview');

  return (
    <div className={cn('rounded-xl border border-slate-700/80 bg-slate-950/80 overflow-hidden', className)}>
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-slate-700/80 px-3 py-1.5 bg-slate-900/60">
        <button
          onClick={() => setTab('preview')}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            tab === 'preview'
              ? 'bg-slate-700 text-slate-100'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          )}
        >
          <Eye className="h-3 w-3" />
          预览
        </button>
        <button
          onClick={() => setTab('raw')}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            tab === 'raw'
              ? 'bg-slate-700 text-slate-100'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          )}
        >
          <FileText className="h-3 w-3" />
          原始
        </button>
      </div>

      {/* Content */}
      <div className="px-5 py-4 max-h-[520px] overflow-y-auto">
        {tab === 'preview' ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={components}
          >
            {content}
          </ReactMarkdown>
        ) : (
          <pre className="font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
            {content}
          </pre>
        )}
      </div>
    </div>
  );
}
