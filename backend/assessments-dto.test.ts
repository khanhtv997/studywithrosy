import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAssessmentSchema, updateAssessmentSchema } from './assessments/assessments.dto';

test('an update only contains the fields that were sent', () => {
  assert.deepEqual(updateAssessmentSchema.parse({ classIds: ['class-2'] }), { classIds: ['class-2'] });
  assert.deepEqual(updateAssessmentSchema.parse({ status: 'closed' }), { status: 'closed' });
});

test('creating still fills the defaults', () => {
  const created = createAssessmentSchema.parse({ title: 'T', type: 'exam', classIds: ['c'], durationMinutes: 10, dueDate: '2099-01-01T00:00:00Z',
    questions: [{ id: 'q', order: 1, text: 'x', type: 'fill_blank', correctAnswer: 'x', points: 1 }] });
  assert.equal(created.status, 'draft');
  assert.equal(created.description, '');
  assert.equal(created.subject, 'english');
});
