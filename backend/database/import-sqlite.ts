import 'dotenv/config';
import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Assessment, ClassRoom, Student, Submission } from '../../shared/types';
import { DatabaseService } from './database.service';

const sqlitePath = resolve(process.env.SQLITE_IMPORT_PATH || 'data/eduassess.sqlite');
const replace = process.argv.includes('--replace');

async function main() {
  if (!existsSync(sqlitePath)) throw new Error(`SQLite file not found: ${sqlitePath}`);
  const sqlite = new Database(sqlitePath, { readonly: true, fileMustExist: true });
  let classes: ClassRoom[];
  let students: Student[];
  let assessments: Assessment[];
  let submissions: Submission[];
  try {
    const read = <T>(table: string): T[] => (sqlite.prepare(`SELECT data FROM ${table}`).all() as { data: string }[]).map(row => JSON.parse(row.data));
    classes = read<ClassRoom>('classes');
    students = read<Student>('students');
    assessments = read<Assessment>('assessments');
    submissions = read<Submission>('submissions');
  } finally {
    sqlite.close();
  }

  const postgres = new DatabaseService();
  try {
    await postgres.initialize(false);
    await postgres.transaction(async () => {
      if (replace) await postgres.query('TRUNCATE TABLE submissions, assessments, students, classes RESTART IDENTITY CASCADE');
      for (const item of classes) await postgres.repository<ClassRoom>('classes').upsert(item);
      for (const item of students) await postgres.repository<Student>('students').upsert(item);
      for (const item of assessments) await postgres.repository<Assessment>('assessments').upsert(item);
      for (const item of submissions) await postgres.repository<Submission>('submissions').upsert(item);
    });
    console.log(`Imported ${classes.length} classes, ${students.length} students, ${assessments.length} assessments and ${submissions.length} submissions from ${sqlitePath}.`);
  } finally {
    await postgres.onModuleDestroy();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
