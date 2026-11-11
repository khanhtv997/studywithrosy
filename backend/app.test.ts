import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import ExcelJS from 'exceljs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

test('Nest API persists the class, assessment and review workflow', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const schema = `eduassess_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  await admin.query(`CREATE SCHEMA ${schema}`);
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.DATABASE_SCHEMA = schema;
  process.env.AUTH_JWT_SECRET = 'test-only-secret-with-at-least-32-characters';
  const app = configureApp(await NestFactory.create(AppModule, { logger: false, bodyParser: false }));
  try {
    await app.listen(0, '127.0.0.1');
    const url = await app.getUrl();
    let token = '';
    const request = async (path: string, method = 'GET', body?: unknown) => {
      const response = await fetch(`${url}/api/${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: response.status, data: await response.json() };
    };

    assert.equal((await request('bootstrap')).status, 401);
    const adminLogin = await request('auth/login', 'POST', { email: 'admin@eduassess.local', password: 'Admin@123456' });
    assert.equal(adminLogin.status, 201);
    token = adminLogin.data.accessToken;
    const adminToken = token;
    assert.equal((await request('auth/me')).data.role, 'admin');
    const initial = await request('bootstrap');
    assert.equal(initial.status, 200);
    assert.equal(initial.data.classes.length, 3);

    const classroom = await request('classes', 'POST', { name: 'Test', grade: '9', code: 'TEST-9', academicYear: '2026-2027' });
    assert.equal(classroom.status, 201);
    const duplicate = await request('classes', 'POST', { name: 'Test', grade: '9', code: 'TEST-9', academicYear: '2026-2027' });
    assert.equal(duplicate.status, 409);
    const student = await request('students', 'POST', { name: 'Tester', code: 'TEST-1', email: 'test@example.com', classId: classroom.data.id });
    assert.equal(student.status, 201);
    // Excel import: preview writes nothing; saving creates, moves between classes, and is idempotent.
    const otherClass = await request('classes', 'POST', { name: 'Other', grade: '9', code: 'TEST-OTHER', academicYear: '2026-2027' });
    const sheet = new ExcelJS.Workbook();
    const ws = sheet.addWorksheet('Danh sách học sinh');
    ws.addRow(['Họ và tên *', 'Mã học sinh *', 'Email *']);
    ws.addRow(['Imported One', 'IMP-1', 'imp1@example.com']);
    ws.addRow(['Tester', 'TEST-1', 'test@example.com']);
    ws.addRow(['', 'IMP-2', 'bad']);
    const fileBase64 = Buffer.from(await sheet.xlsx.writeBuffer()).toString('base64');
    const importPreview = await request('students/import/preview', 'POST', { classId: otherClass.data.id, fileBase64, createAccounts: false });
    assert.equal(importPreview.status, 201);
    assert.deepEqual(importPreview.data.rows.map((r: any) => r.action), ['create', 'move', 'error']);
    assert.equal((await request('bootstrap')).data.students.some((s: any) => s.code === 'IMP-1'), false);
    const rows = importPreview.data.rows.map(({ row, name, code, email }: any) => ({ row, name, code, email }));
    const imported = await request('students/import', 'POST', { classId: otherClass.data.id, rows, createAccounts: false });
    assert.deepEqual(imported.data, { created: 1, moved: 1, updated: 0, unchanged: 0, skipped: 1, accountsCreated: 0 });
    const afterImport = (await request('bootstrap')).data;
    assert.equal(afterImport.students.find((s: any) => s.code === 'TEST-1').classId, otherClass.data.id);
    assert.equal(afterImport.classes.find((c: any) => c.id === otherClass.data.id).studentCount, 2);
    assert.equal(afterImport.classes.find((c: any) => c.id === classroom.data.id).studentCount, 0);
    assert.deepEqual((await request('students/import', 'POST', { classId: otherClass.data.id, rows, createAccounts: false })).data,
      { created: 0, moved: 0, updated: 0, unchanged: 2, skipped: 1, accountsCreated: 0 });
    // Put the tester back so the rest of the workflow runs in the original class.
    await request('students/import', 'POST', { classId: classroom.data.id, rows: [{ name: 'Tester', code: 'TEST-1', email: 'test@example.com' }], createAccounts: false });

    // Importing with accounts: login and first password are the code, and nothing works until it is changed.
    const withAccount = await request('students/import', 'POST', { classId: otherClass.data.id, rows: [{ name: 'No Email', code: 'IMP-9', email: '' }] });
    assert.equal(withAccount.data.accountsCreated, 1);
    const adminTokenBefore = token;
    const firstLogin = await request('auth/login', 'POST', { email: 'imp-9', password: 'IMP-9' });
    assert.equal(firstLogin.data.user.mustChangePassword, true);
    token = firstLogin.data.accessToken;
    assert.equal((await request('bootstrap')).status, 403);
    assert.equal((await request('auth/password', 'PATCH', { currentPassword: 'IMP-9', newPassword: 'Changed@123' })).status, 200);
    assert.equal((await request('bootstrap')).status, 200);
    token = adminTokenBefore;
    // IMP-1 was imported without an account, so a new import offers to create one; TEST-1 is linked further below.
    assert.equal((await request('students/import/preview', 'POST', { classId: otherClass.data.id, fileBase64 })).data.rows[0].account, 'create');
    const account = await request('admin/users', 'POST', { name: 'Tester', email: 'test@example.com', role: 'student', studentId: student.data.id, password: 'Student@123456' });
    assert.equal(account.status, 201);
    assert.equal(account.data.passwordHash, undefined);
    const assessment = await request('assessments', 'POST', { title: 'Test exam', type: 'exam', classIds: [classroom.data.id], durationMinutes: 10,
      dueDate: '2099-01-01T00:00:00Z', status: 'published', questions: [{ id: 'q-test', order: 1, text: 'Choose A', type: 'multiple_choice',
        options: ['A. yes', 'B. no'], correctAnswer: 'A', grammarTopic: 'Test', explanation: 'A', points: 1 }] });
    assert.equal(assessment.status, 201);
    const studentLogin = await request('auth/login', 'POST', { email: 'test@example.com', password: 'Student@123456' });
    assert.equal(studentLogin.status, 201);
    token = studentLogin.data.accessToken;
    assert.equal((await request('admin/users')).status, 403);
    assert.equal((await request('classes')).status, 403);
    const studentInbox = await request('notifications');
    assert.equal(studentInbox.status, 200);
    assert.equal(studentInbox.data.unreadCount, 1);
    assert.equal(studentInbox.data.items[0].type, 'assessment_published');
    const studentBootstrap = await request('bootstrap');
    assert.deepEqual(studentBootstrap.data.students.map((s: any) => s.id), [student.data.id]);
    assert.equal(studentBootstrap.data.assessments[0].questions[0].correctAnswer, '');
    const submission = await request('submissions', 'POST', { assessmentId: assessment.data.id, studentId: initial.data.students[0].id,
      answers: { 'q-test': 'A' }, timeSpentSeconds: 10 });
    assert.equal(submission.status, 201);
    assert.equal(submission.data.autoScore, 0);
    assert.equal(submission.data.finalScore, null);
    const pendingView = await request('bootstrap');
    assert.equal(pendingView.data.submissions[0].autoScore, 0);
    assert.equal(pendingView.data.assessments[0].questions[0].correctAnswer, '');
    assert.equal((await request('submissions', 'POST', { assessmentId: assessment.data.id, studentId: student.data.id,
      answers: {}, timeSpentSeconds: 1 })).status, 409);
    assert.equal((await request(`submissions/${submission.data.id}/review`, 'PATCH', { finalScore: 9 })).status, 403);
    token = adminToken;
    const staffInbox = await request('notifications');
    const received = staffInbox.data.items.find((n: any) => n.type === 'submission_received');
    assert.ok(received);
    assert.equal(received.link, `/grading?assessment=${encodeURIComponent(assessment.data.id)}`);
    // Another user's notification is not visible to mark as read.
    assert.equal((await request(`notifications/${studentInbox.data.items[0].id}/read`, 'PATCH')).status, 404);
    assert.equal((await request(`notifications/${received.id}/read`, 'PATCH')).status, 200);
    assert.equal((await request('notifications/read-all', 'PATCH')).status, 200);
    assert.equal((await request('notifications')).data.unreadCount, 0);
    // Classes: another class can be added, but a class whose students submitted cannot be removed.
    const twoClasses = await request(`assessments/${assessment.data.id}`, 'PATCH', { classIds: [classroom.data.id, otherClass.data.id] });
    assert.equal(twoClasses.status, 200);
    assert.deepEqual(twoClasses.data.classIds, [classroom.data.id, otherClass.data.id]);
    assert.equal((await request(`assessments/${assessment.data.id}`, 'PATCH', { classIds: [otherClass.data.id] })).status, 409);
    const spare = await request('assessments', 'POST', { title: 'Spare', type: 'homework', classIds: [classroom.data.id], durationMinutes: 0,
      dueDate: '2099-01-01T00:00:00Z', questions: [{ id: 'q-s', order: 1, text: 'x', type: 'fill_blank', correctAnswer: 'x', points: 1 }] });
    const moved = await request(`assessments/${spare.data.id}`, 'PATCH', { classIds: [otherClass.data.id] });
    assert.equal(moved.status, 200);
    assert.deepEqual((await request('bootstrap')).data.assessments.find((a: any) => a.id === spare.data.id).classIds, [otherClass.data.id]);
    // Publishing needs at least one class.
    assert.equal((await request(`assessments/${spare.data.id}`, 'PATCH', { classIds: [], status: 'published' })).status, 400);
    const review = await request(`submissions/${submission.data.id}/review`, 'PATCH', { finalScore: 9, teacherFeedback: 'Good' });
    assert.equal(review.status, 200);
    assert.equal(review.data.finalScore, 9);
    token = studentLogin.data.accessToken;
    assert.equal((await request('notifications')).data.items[0].type, 'submission_reviewed');
    const reviewedView = await request('bootstrap');
    assert.equal(reviewedView.data.submissions[0].finalScore, 9);
    assert.equal(reviewedView.data.assessments[0].questions[0].correctAnswer, 'A');
    token = adminToken;
    const result = await request('bootstrap');
    assert.equal(result.data.students.find((s: any) => s.id === student.data.id).averageScore, 9);
    assert.equal(result.data.classes.find((c: any) => c.id === classroom.data.id).studentCount, 1);
    const ocr = await request('ocr-exam', 'POST', { rawText: 'Question 1: Choose.\nA. yes\nB. no\nAnswer: A' });
    assert.equal(ocr.status, 201);
    assert.equal(ocr.data.data.questions[0].options.length, 2);
    // Teachers see only their classes; sharing gives another teacher a copy, not the original.
    const teacherA = await request('admin/users', 'POST', { name: 'Teacher A', email: 'a@example.com', role: 'teacher', password: 'Teacher@123456' });
    const teacherB = await request('admin/users', 'POST', { name: 'Teacher B', email: 'b@example.com', role: 'teacher', password: 'Teacher@123456' });
    const classA = await request('classes', 'POST', { name: 'Class A', grade: '9', code: 'CLS-A', academicYear: '2026-2027', teacherIds: [teacherA.data.id] });
    const classB = await request('classes', 'POST', { name: 'Class B', grade: '9', code: 'CLS-B', academicYear: '2026-2027', teacherIds: [teacherB.data.id] });
    assert.deepEqual(classA.data.teacherIds, [teacherA.data.id]);
    const login = async (email: string) => (await request('auth/login', 'POST', { email, password: 'Teacher@123456' })).data.accessToken;
    const tokenA = await login('a@example.com');
    const tokenB = await login('b@example.com');
    token = tokenA;
    assert.deepEqual((await request('bootstrap')).data.classes.map((c: any) => c.id), [classA.data.id]);
    assert.equal((await request(`classes/${classB.data.id}`)).status, 404);
    // A teacher cannot assign to someone else's class.
    const questions = [{ id: 'q-a', order: 1, text: 'x', type: 'fill_blank', correctAnswer: 'x', points: 1 }];
    assert.equal((await request('assessments', 'POST', { title: 'Nope', type: 'homework', classIds: [classB.data.id], durationMinutes: 0, dueDate: '2099-01-01T00:00:00Z', questions })).status, 404);
    const original = await request('assessments', 'POST', { title: 'From A', type: 'homework', classIds: [classA.data.id], durationMinutes: 0, dueDate: '2099-01-01T00:00:00Z', status: 'published', questions });
    assert.equal(original.status, 201);
    assert.equal(original.data.ownerId, teacherA.data.id);
    token = tokenB;
    assert.equal((await request(`assessments/${original.data.id}`)).status, 404);
    assert.equal((await request(`assessments/shared/${original.data.id}`)).status, 404);
    token = tokenA;
    const shared = await request(`assessments/${original.data.id}/shares`, 'POST', { userIds: [teacherB.data.id] });
    assert.equal(shared.status, 201);
    assert.deepEqual(shared.data.recipients.map((r: any) => r.id), [teacherB.data.id]);
    const link = await request(`assessments/${original.data.id}/share-link`, 'POST');
    assert.ok(link.data.linkToken);
    token = tokenB;
    assert.equal((await request('notifications')).data.items[0].type, 'assessment_shared');
    assert.deepEqual((await request('assessments/shared-with-me')).data.map((a: any) => a.id), [original.data.id]);
    const opened = await request(`assessments/shared/${link.data.linkToken}`);
    assert.equal(opened.status, 200);
    assert.deepEqual(opened.data.assessment.classIds, []);
    assert.equal((await request(`assessments/shared/${original.data.id}/copy`, 'POST', { classIds: [classA.data.id], status: 'published' })).status, 404);
    const copy = await request(`assessments/shared/${original.data.id}/copy`, 'POST', { classIds: [classB.data.id], status: 'published' });
    assert.equal(copy.status, 201);
    assert.equal(copy.data.ownerId, teacherB.data.id);
    assert.equal(copy.data.copiedFrom.assessmentId, original.data.id);
    assert.equal((await request(`assessments/${original.data.id}`, 'PATCH', { title: 'Hijack' })).status, 404);
    token = tokenA;
    await request(`assessments/${original.data.id}/share-link`, 'DELETE');
    token = tokenB;
    assert.equal((await request(`assessments/shared/${link.data.linkToken}`)).status, 404);
    token = adminToken;
    const users = await request('admin/users');
    assert.equal(users.status, 200);
    assert.ok(users.data.length >= 9);
    const disabled = await request(`admin/users/${account.data.id}`, 'PATCH', { active: false });
    assert.equal(disabled.status, 200);
    assert.equal((await request('auth/login', 'POST', { email: 'test@example.com', password: 'Student@123456' })).status, 401);
    token = studentLogin.data.accessToken;
    assert.equal((await request('bootstrap')).status, 401);
  } finally {
    await app.close();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
    delete process.env.DATABASE_SCHEMA;
  }
});
