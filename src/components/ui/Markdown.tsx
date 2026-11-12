import type { ReactNode } from 'react';

/**
 * Renders the small Markdown subset AI answers use: headings, bold/italic/code, bullet and numbered
 * lists (with indentation), quotes, horizontal rules and paragraphs. Only React elements are created,
 * never HTML from the text, so nothing in the answer can inject markup or scripts.
 */
export function Markdown({ text, className = '' }: { text: string; className?: string }) {
  return <div className={`md ${className}`}>{renderBlocks(text)}</div>;
}

type ListItem = { depth: number; ordered: boolean; content: string };

function renderBlocks(text: string): ReactNode[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: ListItem[] = [];
  let quote: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) out.push(<p key={out.length}>{inline(paragraph.join(' '))}</p>);
    paragraph = [];
  };
  const flushList = () => {
    if (list.length) out.push(<div key={out.length}>{renderList(list)}</div>);
    list = [];
  };
  const flushQuote = () => {
    if (quote.length) out.push(<blockquote key={out.length}>{inline(quote.join(' '))}</blockquote>);
    quote = [];
  };
  const flushAll = () => { flushParagraph(); flushList(); flushQuote(); };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) { flushAll(); continue; }

    const heading = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*$/.exec(line);
    if (heading) {
      flushAll();
      const level = Math.min(4, heading[1].length + 1); // # -> h2 ... keeps the page's own h1 unique
      const Tag = `h${level}` as 'h2' | 'h3' | 'h4';
      out.push(<Tag key={out.length}>{inline(heading[2])}</Tag>);
      continue;
    }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) { flushAll(); out.push(<hr key={out.length} />); continue; }

    const item = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (item) {
      flushParagraph(); flushQuote();
      list.push({ depth: Math.floor(item[1].replace(/\t/g, '    ').length / 2), ordered: /\d/.test(item[2]), content: item[3] });
      continue;
    }
    const quoted = /^\s*>\s?(.*)$/.exec(line);
    if (quoted) { flushParagraph(); flushList(); quote.push(quoted[1]); continue; }

    // A line continuing the last list item (indented text under a bullet).
    if (list.length && /^\s+/.test(raw)) { list[list.length - 1].content += ` ${line.trim()}`; continue; }
    flushList(); flushQuote();
    paragraph.push(line.trim());
  }
  flushAll();
  return out;
}

/** Nests list items by indentation; each run of same-depth items becomes one <ul>/<ol>. */
function renderList(items: ListItem[]): ReactNode {
  const base = Math.min(...items.map(i => i.depth));
  const groups: { item: ListItem; children: ListItem[] }[] = [];
  const ordered = items[0]?.ordered;
  for (const item of items) {
    const parent = groups[groups.length - 1];
    // Deeper items nest; so do bullets written straight under a numbered heading ("1. **Tổng quan:**" then "* ...").
    if (parent && (item.depth > base || (ordered && !item.ordered))) parent.children.push(item);
    else groups.push({ item, children: [] });
  }
  const Tag = groups[0]?.item.ordered ? 'ol' : 'ul';
  return <Tag>{groups.map((g, i) => <li key={i}>{inline(g.item.content)}{g.children.length > 0 && renderList(g.children)}</li>)}</Tag>;
}

/** **bold**, __bold__, *italic*, _italic_ and `code`. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(\*\*|__)(.+?)\1|`([^`]+)`|(?<![\w*])([*_])(?!\s)(.+?)(?<!\s)\4(?![\w*])/g;
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    if (m[2] !== undefined) out.push(<strong key={m.index}>{inline(m[2])}</strong>);
    else if (m[3] !== undefined) out.push(<code key={m.index}>{m[3]}</code>);
    else out.push(<em key={m.index}>{inline(m[5])}</em>);
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
