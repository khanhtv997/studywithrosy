import test from 'node:test';
import assert from 'node:assert/strict';
import { pageList } from './pagination';

test('pageList shows every page when there are few', () => {
  assert.deepEqual(pageList(1, 1), [1]);
  assert.deepEqual(pageList(2, 3), [1, 2, 3]);
});

test('pageList keeps first, last and neighbours with gaps in between', () => {
  assert.deepEqual(pageList(1, 10), [1, 2, 'gap', 10]);
  assert.deepEqual(pageList(5, 10), [1, 'gap', 4, 5, 6, 'gap', 10]);
  assert.deepEqual(pageList(10, 10), [1, 'gap', 9, 10]);
  assert.deepEqual(pageList(3, 10), [1, 2, 3, 4, 'gap', 10]);
});
