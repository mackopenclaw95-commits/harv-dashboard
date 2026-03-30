"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownMessageProps {
  content: string;
}

export function MarkdownMessage({ content }: MarkdownMessageProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Headings
        h1: ({ children }) => (
          <h1 className="text-lg font-bold mt-3 mb-1.5 first:mt-0">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-base font-bold mt-3 mb-1 first:mt-0">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-sm font-semibold mt-2 mb-1 first:mt-0">{children}</h3>
        ),
        // Paragraphs
        p: ({ children }) => (
          <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
        ),
        // Lists
        ul: ({ children }) => (
          <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>
        ),
        li: ({ children }) => (
          <li className="leading-relaxed">{children}</li>
        ),
        // Bold & italic
        strong: ({ children }) => (
          <strong className="font-semibold text-foreground">{children}</strong>
        ),
        em: ({ children }) => (
          <em className="italic">{children}</em>
        ),
        // Code
        code: ({ className, children }) => {
          const isBlock = className?.includes("language-");
          if (isBlock) {
            return (
              <code className="block bg-black/20 rounded-lg p-3 my-2 text-xs font-mono overflow-x-auto whitespace-pre">
                {children}
              </code>
            );
          }
          return (
            <code className="bg-white/[0.08] rounded px-1.5 py-0.5 text-xs font-mono">
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre className="my-2">{children}</pre>
        ),
        // Links
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
          >
            {children}
          </a>
        ),
        // Blockquotes
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-primary/30 pl-3 my-2 italic text-muted-foreground">
            {children}
          </blockquote>
        ),
        // Horizontal rule
        hr: () => <hr className="border-white/[0.08] my-3" />,
        // Tables
        table: ({ children }) => (
          <div className="overflow-x-auto my-2">
            <table className="w-full text-xs border-collapse">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="border-b border-white/[0.1]">{children}</thead>
        ),
        th: ({ children }) => (
          <th className="text-left px-2 py-1 font-semibold">{children}</th>
        ),
        td: ({ children }) => (
          <td className="px-2 py-1 border-t border-white/[0.04]">{children}</td>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
