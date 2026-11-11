/** Page numbers to show: always first and last, the neighbours of the current page, and gaps between. */
export function pageList(page: number, count: number): (number | 'gap')[] {
  const pages = new Set([1, count, page - 1, page, page + 1].filter(p => p >= 1 && p <= count));
  const sorted = [...pages].sort((a, b) => a - b);
  return sorted.flatMap((p, i) => (i > 0 && p - sorted[i - 1] > 1 ? ['gap' as const, p] : [p]));
}
