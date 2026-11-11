import assert from 'node:assert/strict';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import { buildTemplate, readStudentRows, rowErrors } from './students/student-import';

const toBase64 = async (workbook: ExcelJS.Workbook) => Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64');

test('the template is read back with its headers and no data rows', async () => {
  const rows = await readStudentRows((await buildTemplate()).toString('base64'));
  assert.deepEqual(rows, []);
});

test('rows are read with Excel row numbers; numbers, links and blank rows are handled', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sheet1');
  sheet.addRow(['STT', 'Họ tên', 'Mã HS', 'E-mail']); // different but accepted header names, extra column
  sheet.addRow([1, '  Tống   Văn Khánh ', 901, { text: 'khanh@truong.edu.vn', hyperlink: 'mailto:khanh@truong.edu.vn' }]);
  sheet.addRow([]);
  sheet.addRow([2, 'Lan', 'HS-02', 'not-an-email']);
  const rows = await readStudentRows(await toBase64(workbook));
  assert.deepEqual(rows, [
    { row: 2, name: 'Tống Văn Khánh', code: '901', email: 'khanh@truong.edu.vn' },
    { row: 4, name: 'Lan', code: 'HS-02', email: 'not-an-email' },
  ]);
  assert.deepEqual(rowErrors(rows[1]), ['Email không hợp lệ']);
  assert.deepEqual(rowErrors({ name: '', code: '', email: '' }), ['Thiếu họ và tên', 'Thiếu mã học sinh']);
  // Email is optional: an empty one is fine, a malformed one is not.
  assert.deepEqual(rowErrors({ name: 'Lan', code: 'HS-02', email: '' }), []);
});

test('a list without an email column is accepted', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sheet1');
  sheet.addRow(['Họ và tên', 'Mã học sinh']);
  sheet.addRow(['Tống Văn Khánh', 'HS-0901']);
  assert.deepEqual(await readStudentRows(await toBase64(workbook)), [{ row: 2, name: 'Tống Văn Khánh', code: 'HS-0901', email: '' }]);
});

test('a sheet without the required columns is rejected with a clear message', async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Sheet1').addRow(['Tên', 'Lớp']);
  await assert.rejects(readStudentRows(await toBase64(workbook)), /Mã học sinh/);
  await assert.rejects(readStudentRows(Buffer.from('not excel').toString('base64')), /\.xlsx/);
});
