import type { HighlightColor, ReviewHighlight } from '../../../types';

/** A run of text that is underlined or not (questions mark underlined parts with <u>…</u>). */
export interface Run { text: string; underline: boolean }

/** Splits stored markup into runs; only <u> counts, any other tag text stays literal. */
export function parseRuns(markup: string): Run[] {
  const runs: Run[] = [];
  for (const part of markup.split(/(<u>[\s\S]*?<\/u>)/gi)) {
    const underlined = /^<u>([\s\S]*?)<\/u>$/i.exec(part);
    const text = underlined ? underlined[1] : part.replace(/<\/?u>/gi, '');
    if (text) runs.push({ text, underline: !!underlined });
  }
  return runs;
}

export const plainOf = (markup: string) => parseRuns(markup).map(r => r.text).join('');

/** A piece of text to draw: its runs' underline plus the highlight covering it, if any. */
export interface Segment { text: string; underline: boolean; highlight?: ReviewHighlight; start: number }

/** Cuts the runs at every highlight edge, so each piece has one underline state and at most one highlight. */
export function segmentsOf(markup: string, highlights: ReviewHighlight[]): Segment[] {
  const runs = parseRuns(markup);
  const sorted = [...highlights].sort((a, b) => a.start - b.start);
  const cuts = new Set<number>();
  let pos = 0;
  for (const run of runs) { cuts.add(pos); pos += run.text.length; }
  cuts.add(pos);
  for (const h of sorted) { cuts.add(Math.max(0, Math.min(pos, h.start))); cuts.add(Math.max(0, Math.min(pos, h.end))); }
  const edges = [...cuts].sort((a, b) => a - b);

  const segments: Segment[] = [];
  let runStart = 0;
  for (const run of runs) {
    const runEnd = runStart + run.text.length;
    for (let i = 0; i < edges.length - 1; i++) {
      const from = Math.max(edges[i], runStart);
      const to = Math.min(edges[i + 1], runEnd);
      if (to <= from) continue;
      const highlight = sorted.find(h => h.start <= from && h.end >= to);
      segments.push({ text: run.text.slice(from - runStart, to - runStart), underline: run.underline, highlight, start: from });
    }
    runStart = runEnd;
  }
  return segments;
}

let counter = 0;
export const newHighlightId = () => `hl-${Date.now().toString(36)}-${(counter++).toString(36)}`;

/**
 * Adds a highlight over [start, end) in a block. Existing highlights there are cut back (or split)
 * so ranges never overlap; a note stays with the first remaining piece.
 */
export function addHighlight(list: ReviewHighlight[], block: string, start: number, end: number, color: HighlightColor, note?: string): { list: ReviewHighlight[]; added: ReviewHighlight } {
  const added: ReviewHighlight = { id: newHighlightId(), block, start, end, color, ...(note ? { note } : {}) };
  const next: ReviewHighlight[] = [];
  for (const h of list) {
    if (h.block !== block || h.end <= start || h.start >= end) { next.push(h); continue; }
    if (h.start < start) next.push({ ...h, end: start });
    if (h.end > end) next.push({ ...h, id: h.start < start ? newHighlightId() : h.id, start: end, ...(h.start < start ? { note: undefined } : {}) });
  }
  next.push(added);
  return { list: next.filter(h => h.end > h.start), added };
}

/** Character offset of a DOM position inside a block element, counting only its text. */
export function offsetIn(block: Element, node: Node, offset: number) {
  const range = document.createRange();
  range.selectNodeContents(block);
  range.setEnd(node, offset);
  return range.toString().length;
}

/** For a selection, the [start, end) in every block element it touches. */
export function selectionBlocks(root: Element, range: Range): { block: string; start: number; end: number }[] {
  const result: { block: string; start: number; end: number }[] = [];
  root.querySelectorAll<HTMLElement>('[data-block]').forEach(el => {
    if (!range.intersectsNode(el)) return;
    const length = (el.textContent ?? '').length;
    const start = el.contains(range.startContainer) ? offsetIn(el, range.startContainer, range.startOffset) : 0;
    const end = el.contains(range.endContainer) ? offsetIn(el, range.endContainer, range.endOffset) : length;
    // Trim spaces at the edges so a double-click on a word does not mark the space after it.
    const text = el.textContent ?? '';
    let s = Math.max(0, Math.min(start, length)), e = Math.max(0, Math.min(end, length));
    while (s < e && /\s/.test(text[s])) s++;
    while (e > s && /\s/.test(text[e - 1])) e--;
    if (e > s) result.push({ block: el.dataset.block!, start: s, end: e });
  });
  return result;
}
