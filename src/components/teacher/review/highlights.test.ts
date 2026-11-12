import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addHighlight, parseRuns, plainOf, segmentsOf } from './highlights';
import type { ReviewHighlight } from '../../../types';

const h = (block: string, start: number, end: number, extra: Partial<ReviewHighlight> = {}): ReviewHighlight =>
  ({ id: `${start}-${end}`, block, start, end, color: 'yellow', ...extra });

test('underline markup becomes runs; offsets count the plain text only', () => {
  assert.deepEqual(parseRuns('sh<u>ou</u>ld'), [
    { text: 'sh', underline: false }, { text: 'ou', underline: true }, { text: 'ld', underline: false },
  ]);
  assert.equal(plainOf('sh<u>ou</u>ld <b>x</b>'), 'should <b>x</b>');
});

test('segments split at highlight and underline edges', () => {
  // "should go" with "ou" underlined, highlight over "uld g" (2..7).
  const segments = segmentsOf('sh<u>ou</u>ld go', [h('b', 3, 8)]);
  assert.deepEqual(segments.map(s => [s.text, s.underline, !!s.highlight]), [
    ['sh', false, false], ['o', true, false], ['u', true, true], ['ld g', false, true], ['o', false, false],
  ]);
});

test('a new highlight cuts back overlapping ones and keeps the note on the first piece', () => {
  const start = [h('b', 0, 10, { note: 'keep' }), h('other', 0, 10)];
  const { list, added } = addHighlight(start, 'b', 3, 6, 'green');
  const inBlock = list.filter(x => x.block === 'b').sort((a, b) => a.start - b.start);
  assert.deepEqual(inBlock.map(x => [x.start, x.end, x.color, x.note]), [
    [0, 3, 'yellow', 'keep'], [3, 6, 'green', undefined], [6, 10, 'yellow', undefined],
  ]);
  assert.equal(added.color, 'green');
  assert.ok(list.some(x => x.block === 'other'), 'other blocks are untouched');
});

test('a highlight covering an old one replaces it', () => {
  const { list } = addHighlight([h('b', 2, 4)], 'b', 0, 10, 'pink');
  assert.deepEqual(list.map(x => [x.start, x.end, x.color]), [[0, 10, 'pink']]);
});
