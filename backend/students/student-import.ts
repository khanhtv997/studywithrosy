import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import type { StudentImportInput } from '../../shared/types';

export const MAX_IMPORT_ROWS = 1000;
const SHEET_NAME = 'Danh sách học sinh';

/** Header text (lower-case, no accents) → field. Accepts the template headers and common variants. */
const HEADER_ALIASES: Record<keyof StudentImportInput, string[]> = {
  name: ['ho va ten', 'ho ten', 'ten hoc sinh', 'ten', 'name', 'full name', 'fullname'],
  code: ['ma hoc sinh', 'ma hs', 'ma so', 'ma', 'so bao danh', 'sbd', 'code', 'student code', 'student id'],
  email: ['email', 'e-mail', 'thu dien tu', 'email hoc sinh', 'email phu huynh', 'email (khong bat buoc)'],
};

const normalizeHeader = (value: string) => value
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
  .toLowerCase().replace(/\*/g, '').replace(/\s+/g, ' ').trim();

/** The blank template teachers fill in: one data sheet plus a sheet of instructions. */
export async function buildTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'EduAssess';
  const sheet = workbook.addWorksheet(SHEET_NAME, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    { header: 'Họ và tên *', key: 'name', width: 32 },
    { header: 'Mã học sinh *', key: 'code', width: 18 },
    { header: 'Email (không bắt buộc)', key: 'email', width: 36 },
  ];
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5A51B7' } };
  header.alignment = { vertical: 'middle' };
  header.height = 22;
  // Codes such as 0901 must stay text, otherwise Excel drops the leading zero.
  sheet.getColumn('code').numFmt = '@';

  const help = workbook.addWorksheet('Hướng dẫn');
  help.columns = [{ width: 110 }];
  [
    'CÁCH ĐIỀN',
    '1. Điền danh sách vào trang "Danh sách học sinh", mỗi học sinh một dòng, bắt đầu từ dòng 2. Không đổi tên cột.',
    '2. Họ và tên: bắt buộc, ví dụ "Tống Văn Khánh".',
    '3. Mã học sinh: bắt buộc, không trùng nhau, ví dụ "HS-0901". Nếu mã đã có ở lớp khác, học sinh đó sẽ được chuyển sang lớp đang nhập.',
    '4. Email: không bắt buộc. Có thể để trống nếu học sinh chưa có email.',
    '5. Tài khoản: nếu chọn "Tạo tài khoản" khi nhập, mỗi học sinh có tài khoản với tên đăng nhập và mật khẩu đều là mã học sinh; lần đăng nhập đầu phải đổi mật khẩu.',
    `6. Tối đa ${MAX_IMPORT_ROWS} học sinh mỗi lần. Sau khi tải lên, hệ thống hiện bản xem trước để kiểm tra trước khi lưu.`,
    '',
    'VÍ DỤ',
    'Tống Văn Khánh | HS-0901 | khanh.tong@truong.edu.vn',
    'Nguyễn Minh Anh | HS-0902 | (để trống)',
  ].forEach((line, i) => {
    const row = help.addRow([line]);
    if (i === 0 || line === 'VÍ DỤ') row.font = { bold: true };
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** Reads rows from the first sheet that has the expected columns. Row numbers match Excel's. */
export async function readStudentRows(fileBase64: string): Promise<(StudentImportInput & { row: number })[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Buffer.from(fileBase64.replace(/^data:[^;]+;base64,/, ''), 'base64') as unknown as ExcelJS.Buffer);
  } catch {
    throw new BadRequestException('Không đọc được tệp. Hãy dùng tệp Excel .xlsx (có thể tải tệp mẫu).');
  }

  for (const sheet of workbook.worksheets) {
    const columns: Partial<Record<keyof StudentImportInput, number>> = {};
    sheet.getRow(1).eachCell((cell, col) => {
      const text = normalizeHeader(cell.text || '');
      for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [keyof StudentImportInput, string[]][]) {
        if (columns[field] === undefined && aliases.includes(text)) columns[field] = col;
      }
    });
    if (columns.name === undefined || columns.code === undefined) continue;

    const rows: (StudentImportInput & { row: number })[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      // cell.text resolves numbers, formulas, hyperlinks (common for emails) and rich text to plain text.
      const read = (col: number) => row.getCell(col).text.replace(/\s+/g, ' ').trim();
      const entry = { row: rowNumber, name: read(columns.name!), code: read(columns.code!), email: columns.email === undefined ? '' : read(columns.email).replace(/^mailto:/i, '') };
      if (entry.name || entry.code || entry.email) rows.push(entry);
    });
    if (rows.length > MAX_IMPORT_ROWS) throw new BadRequestException(`Tệp có ${rows.length} dòng; mỗi lần chỉ nhập tối đa ${MAX_IMPORT_ROWS} học sinh.`);
    return rows;
  }
  throw new BadRequestException('Không tìm thấy các cột "Họ và tên" và "Mã học sinh" ở dòng đầu tiên. Hãy dùng tệp mẫu.');
}

const emailSchema = z.email();

/** Problems with one row on its own (duplicates across rows are checked by the caller). */
export function rowErrors(input: StudentImportInput): string[] {
  const errors: string[] = [];
  if (!input.name) errors.push('Thiếu họ và tên');
  if (!input.code) errors.push('Thiếu mã học sinh');
  else if (input.code.length > 50) errors.push('Mã học sinh quá dài');
  // Email is optional (many pupils have none) but must be valid when given.
  if (input.email && !emailSchema.safeParse(input.email).success) errors.push('Email không hợp lệ');
  return errors;
}
