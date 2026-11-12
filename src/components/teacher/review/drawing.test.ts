import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cursorFor, hitsStroke, pathOf, pushPoint } from './drawing';
import type { ReviewStroke } from '../../../types';

test('points too close together are skipped and kept ones are rounded', () => {
  const points: number[] = [];
  assert.equal(pushPoint(points, 10.04, 10.06), true);
  assert.equal(pushPoint(points, 10.5, 10.5), false);
  assert.equal(pushPoint(points, 20, 10), true);
  assert.deepEqual(points, [10, 10.1, 20, 10]);
});

test('paths: a dot, a line and a curve', () => {
  assert.equal(pathOf([5, 5]), 'M5 5l0.01 0');
  assert.equal(pathOf([0, 0, 10, 0]), 'M0 0L10 0');
  assert.equal(pathOf([0, 0, 10, 0, 20, 10]), 'M0 0Q10 0 15 5L20 10');
});

test('the eraser hits a stroke near its line, counting its width', () => {
  const stroke: ReviewStroke = { id: 's', anchor: 'a', tool: 'marker', color: '#ffeb3b', width: 20, points: [0, 0, 100, 0] };
  assert.equal(hitsStroke(stroke, 50, 12, 4), true);
  assert.equal(hitsStroke(stroke, 50, 20, 4), false);
  assert.equal(hitsStroke({ ...stroke, points: [0, 0], width: 4 }, 3, 3, 4), true);
});

test('each tool gets its own pointer, with the hotspot at its tip and the pen in its colour', () => {
  assert.equal(cursorFor('none', '#e53935'), 'auto');
  const pen = cursorFor('pen', '#e53935');
  assert.match(pen, /^url\("data:image\/svg\+xml,.+"\) 2 26, crosshair$/);
  assert.ok(decodeURIComponent(pen).includes('fill="#e53935"'));
  assert.match(cursorFor('eraser', '#e53935'), /\) 7 22, cell$/);
});
