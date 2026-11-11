import test from 'node:test';
import assert from 'node:assert/strict';
import { avatarTone, initialsOf } from './initials';

test('initialsOf uses the first and last word', () => {
  assert.equal(initialsOf('Tống Văn Khánh'), 'TK');
  assert.equal(initialsOf('Nguyễn Minh Anh'), 'NA');
  assert.equal(initialsOf('đỗ phương thảo'), 'ĐT');
  assert.equal(initialsOf('Lan'), 'L');
  assert.equal(initialsOf('   '), 'HS');
});

test('avatarTone is stable per name', () => {
  assert.equal(avatarTone('Tống Văn Khánh'), avatarTone('Tống Văn Khánh'));
  assert.ok(avatarTone('A') >= 0 && avatarTone('A') < 8);
});
