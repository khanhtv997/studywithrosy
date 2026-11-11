import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import type {
  ClassRoom, Student, StudentAccountAction, StudentImportAction, StudentImportInput,
  StudentImportPreview, StudentImportResult, StudentImportRow,
} from '../../shared/types';
import { ClassesService } from '../classes/classes.service';
import { validate } from '../common/validate';
import { DatabaseService } from '../database/database.service';
import { buildTemplate, readStudentRows, rowErrors } from './student-import';
import { importCommitSchema, importPreviewSchema } from './students.dto';

/**
 * bcrypt cost for the temporary passwords of imported accounts. They must be changed at first sign-in,
 * and a lower cost keeps a 1,000-row import to seconds instead of minutes (bcryptjs is pure JS).
 */
const TEMP_PASSWORD_COST = 8;

/** Login for an imported student: the student code, lower-case (sign-in is case-insensitive). */
export const loginForCode = (code: string) => code.trim().toLowerCase();

/** Excel import of a class list: template, preview and the final save share one plan. */
@Injectable()
export class StudentImportService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(ClassesService) private readonly classes: ClassesService,
  ) {}

  template() { return buildTemplate(); }

  async preview(body: unknown): Promise<StudentImportPreview> {
    const data = validate(importPreviewSchema, body);
    const target = await this.classes.findOne(data.classId);
    const rows = await this.plan(target, await readStudentRows(data.fileBase64), data.createAccounts);
    return { className: target.name, createAccounts: data.createAccounts, rows, counts: countActions(rows) };
  }

  /** Saves the rows again from scratch: the preview is only advice, the database may have changed since. */
  async commit(body: unknown): Promise<StudentImportResult> {
    const data = validate(importCommitSchema, body);
    const target = await this.classes.findOne(data.classId);
    return this.db.transaction(async () => {
      const rows = await this.plan(target, data.rows.map((r, i) => ({ ...r, row: r.row ?? i + 2 })), data.createAccounts);
      const repo = this.db.repository<Student>('students');
      const sourceClasses = new Set<string>();
      let accountsCreated = 0;
      for (const row of rows) {
        if (row.action === 'error') continue;
        let studentId: string;
        if (row.action === 'create') {
          studentId = `std-${randomUUID()}`;
          await repo.insert({ id: studentId, name: row.name, code: row.code, email: row.email, avatar: '', classId: target.id,
            averageScore: 0, completedCount: 0, totalAssigned: 0, status: 'good', weakTopics: [] });
        } else {
          const [student] = await repo.where({ code: row.code });
          studentId = student.id;
          if (row.action === 'move' || row.action === 'update') {
            if (student.classId !== target.id) sourceClasses.add(student.classId);
            // class_id is a real column (for the foreign key and indexes), so it is updated next to the JSON.
            await this.db.query(`UPDATE students SET class_id = $1, data = data || jsonb_build_object('classId', $1::text, 'name', $2::text, 'email', $3::text) WHERE id = $4`,
              [target.id, row.name, row.email, student.id]);
          }
        }
        if (row.account === 'create') {
          // Login and first password are the code exactly as written in the file; it must be changed at first sign-in.
          await this.db.query(`INSERT INTO users (id, email, name, role, password_hash, student_id, must_change_password)
            VALUES ($1, $2, $3, 'student', $4, $5, true)`,
            [`user-${randomUUID()}`, row.login, row.name, await hash(row.code, TEMP_PASSWORD_COST), studentId]);
          accountsCreated += 1;
        }
      }
      for (const classId of [target.id, ...sourceClasses]) await this.classes.refreshStudentCount(classId);
      const counts = countActions(rows);
      return { created: counts.create, moved: counts.move, updated: counts.update, unchanged: counts.unchanged, skipped: counts.error, accountsCreated };
    });
  }

  /** Decides what each row will do (student and account) and lists its problems. */
  private async plan(target: ClassRoom, inputs: (StudentImportInput & { row: number })[], createAccounts: boolean): Promise<StudentImportRow[]> {
    const codes = [...new Set(inputs.map(r => r.code).filter(Boolean))];
    const existing = codes.length
      ? (await this.db.query<{ data: Student }>('SELECT data FROM students WHERE code = ANY($1)', [codes])).map(r => r.data)
      : [];
    const byCode = new Map(existing.map(s => [s.code, s]));
    const classNames = new Map((await this.classes.findAll()).map(c => [c.id, c.name]));

    // Accounts already linked to these students, and logins already taken by anyone.
    const logins = [...new Set(codes.map(loginForCode))];
    const users = createAccounts && codes.length
      ? await this.db.query<{ email: string; studentId: string | null }>(
        'SELECT email, student_id AS "studentId" FROM users WHERE email = ANY($1) OR student_id = ANY($2)', [logins, existing.map(s => s.id)])
      : [];
    const linkedStudents = new Set(users.map(u => u.studentId).filter(Boolean));
    const takenLogins = new Map(users.map(u => [u.email, u.studentId]));

    const seen = new Map<string, number>();
    return inputs.map(input => {
      const errors = rowErrors(input);
      const key = input.code.toLowerCase();
      if (input.code && seen.has(key)) errors.push(`Trùng mã với dòng ${seen.get(key)}`);
      else if (input.code) seen.set(key, input.row);

      const current = byCode.get(input.code);
      let action: StudentImportAction = errors.length ? 'error' : current ? (current.classId === target.id ? 'unchanged' : 'move') : 'create';
      // Re-importing the same list should not change anything unless name or email differ.
      if (action === 'unchanged' && current && (current.name !== input.name || current.email !== input.email)) action = 'update';

      const login = loginForCode(input.code);
      let account: StudentAccountAction = 'none';
      if (createAccounts && action !== 'error') {
        if (current && linkedStudents.has(current.id)) account = 'exists';
        else if (takenLogins.has(login)) account = 'conflict';
        else account = 'create';
      }
      return {
        ...input,
        action,
        errors,
        fromClassName: action === 'move' && current ? classNames.get(current.classId) ?? 'lớp khác' : undefined,
        account,
        login: account === 'none' ? undefined : login,
      };
    });
  }
}

function countActions(rows: StudentImportRow[]): Record<StudentImportAction, number> {
  const counts: Record<StudentImportAction, number> = { create: 0, move: 0, update: 0, unchanged: 0, error: 0 };
  for (const row of rows) counts[row.action] += 1;
  return counts;
}
