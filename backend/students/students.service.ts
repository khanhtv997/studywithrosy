import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { AppUser, Student, StudentPage, Submission } from '../../shared/types';
import { likePattern, optionalFilter, pageFields, SqlFilter, toNumber } from '../common/paging';
import { visibleAssessmentSql } from '../assessments/visibility';
import { ClassesService } from '../classes/classes.service';
import { validate } from '../common/validate';
import { DatabaseService } from '../database/database.service';
import { createStudentSchema } from './students.dto';

const studentPageSchema = z.object({
  ...pageFields,
  classId: optionalFilter,
  status: z.enum(['all', 'excellent', 'needs_support', 'ungraded']).default('all'),
});

// "Graded" means at least one reviewed submission; the stored status alone is not enough.
const GRADED = `COALESCE((st.data->>'completedCount')::int, 0) > 0`;
const AVERAGE = `COALESCE((st.data->>'averageScore')::numeric, 0)`;
const STATUS_SQL = {
  all: '',
  excellent: `${GRADED} AND ${AVERAGE} >= 8.5`,
  needs_support: `${GRADED} AND ${AVERAGE} < 6`,
  ungraded: `NOT (${GRADED})`,
};

@Injectable()
export class StudentsService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService, @Inject(ClassesService) private readonly classes: ClassesService) {}
  findAll() { return this.db.repository<Student>('students').all(); }
  /** Students of the classes the user teaches (all students for an admin). */
  async findAllFor(user: AppUser) {
    const scope = await this.classes.scopeFor(user);
    return scope === null ? this.findAll() : this.db.repository<Student>('students').whereSql('class_id = ANY($1)', [scope]);
  }
  /** The student table: filtered and paged in SQL, with class name and done / assigned counts. */
  async page(user: AppUser, query: unknown): Promise<StudentPage> {
    const { page, pageSize, q, classId, status } = validate(studentPageSchema, query);
    const scope = await this.classes.scopeFor(user);
    const f = new SqlFilter();
    if (scope) f.add(p => `st.class_id = ANY(${p})`, scope);
    if (classId) f.add(p => `st.class_id = ${p}`, classId);
    if (q) f.add(p => `st.data->>'name' ILIKE ${p} OR st.code ILIKE ${p} OR st.data->>'email' ILIKE ${p}`, likePattern(q));
    if (STATUS_SQL[status]) f.raw(STATUS_SQL[status]);

    const [{ total }] = await this.db.query<{ total: string }>(`SELECT count(*) AS total FROM students st ${f.where()}`, [...f.values]);
    // Done / assigned only count the assessments this user may see (their own tests for a teacher).
    const visible = visibleAssessmentSql(user, scope, f);
    const visibleAnd = visible ? `${visible} AND` : '';
    const rows = await this.db.query<{ data: Student; class_name: string | null; submitted: string; assigned: string }>(
      `SELECT st.data, c.data->>'name' AS class_name,
              (SELECT count(*) FROM submissions s JOIN assessments a ON a.id = s.assessment_id WHERE ${visibleAnd} s.student_id = st.id) AS submitted,
              (SELECT count(*) FROM assessments a WHERE ${visibleAnd} a.data->'classIds' ? st.class_id AND a.data->>'status' <> 'draft') AS assigned
       FROM students st LEFT JOIN classes c ON c.id = st.class_id
       ${f.where()} ORDER BY st.sort_order ${f.limit(page, pageSize)}`, f.values);
    return {
      items: rows.map(r => ({ ...r.data, className: r.class_name ?? '', submittedCount: toNumber(r.submitted), assignedCount: toNumber(r.assigned) })),
      total: toNumber(total), page, pageSize,
    };
  }

  async findOneFor(user: AppUser, id: string) {
    const item = await this.findOne(id);
    const scope = await this.classes.scopeFor(user);
    if (scope !== null && !scope.includes(item.classId)) throw new NotFoundException(`Student ${id} not found`);
    return item;
  }
  async findOne(id: string) {
    const item = await this.db.repository<Student>('students').find(id);
    if (!item) throw new NotFoundException(`Student ${id} not found`);
    return item;
  }
  async create(body: unknown, user: AppUser) {
    const data = validate(createStudentSchema, body);
    await this.classes.findOneFor(user, data.classId);
    const repo = this.db.repository<Student>('students');
    if ((await repo.where({ code: data.code })).length) throw new ConflictException('Student code already exists');
    const item: Student = { ...data, id: `std-${randomUUID()}`, averageScore: 0, completedCount: 0, totalAssigned: 0, status: 'good', weakTopics: [] };
    await this.db.transaction(async () => { await repo.insert(item); await this.classes.refreshStudentCount(data.classId); });
    return item;
  }
  /** Recomputes average score and status from the student's published submissions. */
  async refreshStatistics(id: string) {
    const repo = this.db.repository<Student>('students');
    const student = await this.findOne(id);
    const scores = (await this.db.repository<Submission>('submissions').where({ student_id: id }))
      .filter(s => s.status === 'published' && s.finalScore !== null)
      .map(s => s.finalScore as number);
    const averageScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10 : 0;
    await repo.update({ ...student, averageScore, completedCount: scores.length, status: averageScore >= 8.5 ? 'excellent' : averageScore >= 7 ? 'good' : averageScore >= 5 ? 'average' : 'needs_support' });
  }
}
