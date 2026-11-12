import type { DrawTool, ReviewStroke } from '../../../types';

export type DrawMode = 'none' | DrawTool | 'eraser';

export const PEN_COLORS = [
  { value: '#e53935', label: 'Đỏ' },
  { value: '#1e66f5', label: 'Xanh dương' },
  { value: '#10a35a', label: 'Xanh lá' },
  { value: '#222b43', label: 'Đen' },
];
export const MARKER_COLORS = [
  { value: '#ffeb3b', label: 'Vàng' },
  { value: '#69f0ae', label: 'Xanh lá' },
  { value: '#ff80ab', label: 'Hồng' },
  { value: '#4fc3f7', label: 'Xanh dương' },
];
/** Stroke widths (px at 100% zoom) for the small, medium and large sizes. */
export const SIZES: Record<DrawTool, [number, number, number]> = { pen: [2, 4, 7], marker: [12, 20, 30] };

/** Points closer than this (px at 100% zoom) to the last kept one are skipped, which keeps strokes small. */
const MIN_STEP = 1.5;

const round = (n: number) => Math.round(n * 10) / 10;

/** Adds a point to a stroke's flat point list unless it is too close to the previous one. Returns whether it was kept. */
export function pushPoint(points: number[], x: number, y: number): boolean {
  const n = points.length;
  if (n >= 2 && Math.hypot(x - points[n - 2], y - points[n - 1]) < MIN_STEP) return false;
  points.push(round(x), round(y));
  return true;
}

/** A smooth SVG path through the points (quadratic curves through the midpoints). A single point becomes a dot. */
export function pathOf(points: number[]): string {
  if (points.length < 2) return '';
  const [x0, y0] = points;
  if (points.length < 4) return `M${x0} ${y0}l0.01 0`;
  if (points.length < 6) return `M${x0} ${y0}L${points[2]} ${points[3]}`;
  let d = `M${x0} ${y0}`;
  for (let i = 2; i < points.length - 2; i += 2) {
    const mx = round((points[i] + points[i + 2]) / 2), my = round((points[i + 1] + points[i + 3]) / 2);
    d += `Q${points[i]} ${points[i + 1]} ${mx} ${my}`;
  }
  return `${d}L${points[points.length - 2]} ${points[points.length - 1]}`;
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Whether a point (in the stroke's own coordinates) touches the stroke, with some slack for the eraser. */
export function hitsStroke(stroke: ReviewStroke, x: number, y: number, slack: number): boolean {
  const reach = stroke.width / 2 + slack;
  const p = stroke.points;
  if (p.length < 4) return Math.hypot(x - p[0], y - p[1]) <= reach;
  for (let i = 0; i < p.length - 2; i += 2) {
    if (distanceToSegment(x, y, p[i], p[i + 1], p[i + 2], p[i + 3]) <= reach) return true;
  }
  return false;
}

/** Icon shapes (24×24) and where their tip sits, for the mouse pointer of each tool. */
const CURSOR_ICONS: Record<Exclude<DrawMode, 'none'>, { paths: string[]; tip: [number, number] }> = {
  pen: {
    paths: ['M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z', 'm15 5 4 4'],
    tip: [2, 22],
  },
  marker: {
    paths: ['m9 11-6 6v3h9l3-3', 'm22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4'],
    tip: [3, 20],
  },
  eraser: {
    paths: ['M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21', 'm5.082 11.09 8.828 8.828'],
    tip: [6, 19],
  },
};
const CURSOR_SIZE = 28;

/**
 * A CSS cursor that looks like the tool: a pen or marker filled with its colour, or an eraser.
 * The hotspot is the tip, so the stroke starts right where the pen point is.
 */
export function cursorFor(mode: DrawMode, color: string): string {
  if (mode === 'none') return 'auto';
  const icon = CURSOR_ICONS[mode];
  const fill = mode === 'eraser' ? '#ffc1cc' : color;
  // White outlines first (all), then the dark shapes, so the icon reads on any background.
  const outline = icon.paths.map(d => `<path d="${d}" stroke="#fff" stroke-width="4"/>`).join('');
  const body = icon.paths.map((d, i) => `<path d="${d}" fill="${i === 0 ? fill : 'none'}" stroke="#222b43" stroke-width="1.6"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CURSOR_SIZE}" height="${CURSOR_SIZE}" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">${outline}${body}</svg>`;
  const k = CURSOR_SIZE / 24;
  const [x, y] = icon.tip.map(n => Math.round(n * k));
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${x} ${y}, ${mode === 'eraser' ? 'cell' : 'crosshair'}`;
}

let counter = 0;
export const newStrokeId = () => `st-${Date.now().toString(36)}-${(counter++).toString(36)}`;
