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

let counter = 0;
export const newStrokeId = () => `st-${Date.now().toString(36)}-${(counter++).toString(36)}`;
