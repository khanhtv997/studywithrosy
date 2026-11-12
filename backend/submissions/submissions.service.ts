import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { AppUser, Submission, SubmissionPage } from '../../shared/types';
import { likePattern, optionalFilter, pageFields, SqlFilter, toNumber } from '../common/paging';
import { visibleAssessmentSql } from '../assessments/visibility';
import { gradeSubmission } from '../../shared/grading';
import { AssessmentsService } from '../assessments/assessments.service';
import { ClassesService } from '../classes/classes.service';
import { validate } from '../common/validate';
import { DatabaseService } from '../database/database.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StudentsService } from '../students/students.service';
import { reviewSchema, submitSchema } from './submissions.dto';

const submissionPageSchema = z.object({
  ...pageFields,
  classId: optionalFilter,
  assessmentId: optionalFilter,
  status: z.enum(['pending', 'published', 'all']).default('pending'),
});

@Injectable()
export class SubmissionsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AssessmentsService) private readonly assessments: AssessmentsService,
    @Inject(StudentsService) private readonly students: StudentsService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(ClassesService) private readonly classes: ClassesService,
  ) {}
  /** Submissions to the assessments the user may see, from students of their classes (everything for an admin). */
  async findAllFor(user: AppUser) {
    const scope = await this.classes.scopeFor(user);
    const repo = this.db.repository<Submission>('submissions');
    if (scope === null) return repo.all();
    const f = new SqlFilter();
    const classes = f.param(scope);
    const visible = visibleAssessmentSql(user, scope, f);
    return repo.whereSql(`student_id IN (SELECT id FROM students WHERE class_id = ANY(${classes}))
      AND assessment_id IN (SELECT a.id FROM assessments a WHERE ${visible})`, f.values);
  }
  /** The grading list: filtered, counted per status and paged in SQL. */
  async page(user: AppUser, query: unknown): Promise<SubmissionPage> {
    const { page, pageSize, q, classId, assessmentId, status } = validate(submissionPageSchema, query);
    const scope = await this.classes.scopeFor(user);
    const f = new SqlFilter();
    if (scope) f.add(p => `st.class_id = ANY(${p})`, scope);
    const visible = visibleAssessmentSql(user, scope, f);
    if (visible) f.raw(`s.assessment_id IN (SELECT a.id FROM assessments a WHERE ${visible})`);
    if (classId) f.add(p => `st.class_id = ${p}`, classId);
    if (assessmentId) f.add(p => `s.assessment_id = ${p}`, assessmentId);
    if (q) f.add(p => `s.data->>'studentName' ILIKE ${p} OR st.code ILIKE ${p}`, likePattern(q));
    const from = 'FROM submissions s JOIN students st ON st.id = s.student_id';

    const [counts] = await this.db.query<{ pending: string; published: string; all: string }>(
      `SELECT count(*) FILTER (WHERE s.data->>'status' = 'pending_review') AS pending,
              count(*) FILTER (WHERE s.data->>'status' = 'published') AS published, count(*) AS "all"
       ${from} ${f.where()}`, [...f.values]);

    const statusSql = status === 'pending' ? `s.data->>'status' = 'pending_review'` : status === 'published' ? `s.data->>'status' = 'published'` : '';
    // Oldest pending first so nothing waits forever; reviewed work newest first.
    const order = status === 'pending' ? 'ASC' : 'DESC';
    const where = f.where(statusSql);
    const rows = await this.db.query<{ data: Submission; class_name: string | null; assessment_title: string | null }>(
      `SELECT s.data, c.data->>'name' AS class_name, a.data->>'title' AS assessment_title
       ${from} LEFT JOIN classes c ON c.id = st.class_id LEFT JOIN assessments a ON a.id = s.assessment_id
       ${where} ORDER BY s.data->>'submittedAt' ${order}, s.id ${f.limit(page, pageSize)}`, f.values);

    const countsOut = { pending: toNumber(counts.pending), published: toNumber(counts.published), all: toNumber(counts.all) };
    return {
      items: rows.map(r => ({ ...r.data, className: r.class_name ?? '', assessmentTitle: r.assessment_title ?? '' })),
      total: countsOut[status], page, pageSize, counts: countsOut,
    };
  }

  async findOneFor(user: AppUser, id: string) {
    const item = await this.db.repository<Submission>('submissions').find(id);
    if (item) {
      const scope = await this.classes.scopeFor(user);
      if (scope === null) return item;
      const assessment = await this.assessments.findOne(item.assessmentId).catch(() => null);
      if (assessment && await this.assessments.canSee(user, assessment)
        && scope.includes((await this.students.findOne(item.studentId)).classId)) return item;
    }
    throw new NotFoundException(`Submission ${id} not found`);
  }
  async submit(body: unknown) {
    const data = validate(submitSchema, body);
    const assessment = await this.assessments.findOne(data.assessmentId);
    const student = await this.students.findOne(data.studentId);
    if (!assessment.classIds.includes(student.classId)) throw new BadRequestException('Student is not in this class');
    if (assessment.status !== 'published') throw new BadRequestException('Assessment is not published');
    if (Date.parse(assessment.dueDate) < Date.now()) throw new BadRequestException('Assessment deadline has passed');
    const repo = this.db.repository<Submission>('submissions');
    const [previous] = await repo.where({ assessment_id: assessment.id, student_id: student.id });
    if (previous && !assessment.allowRetry) throw new ConflictException('Already submitted');
    const item: Submission = { id: `sub-${randomUUID()}`, assessmentId: assessment.id, studentId: student.id,
      studentName: student.name, studentAvatar: student.avatar, submittedAt: new Date().toISOString(),
      answers: data.answers, timeSpentSeconds: data.timeSpentSeconds,
      autoScore: gradeSubmission(assessment.questions, data.answers).autoScore,
      finalScore: null, isReviewed: false, teacherFeedback: '', status: 'pending_review' };
    await this.db.transaction(async () => {
      if (previous) await repo.delete(previous.id);
      await repo.insert(item);
      // A retry replaces a reviewed attempt, so the student's average must drop that score.
      if (previous?.status === 'published') await this.students.refreshStatistics(student.id);
      // Only the teacher who set the test hears about it; older tests without an owner go to the class's teachers.
      const notice = {
        type: 'submission_received' as const,
        title: `${student.name} đã nộp bài${previous ? ' (làm lại)' : ''}`,
        body: `${assessment.title} · chờ chấm và duyệt`,
        link: `/grading?assessment=${encodeURIComponent(assessment.id)}`,
      };
      if (assessment.ownerId) await this.notifications.notifyUsers([assessment.ownerId], notice);
      else await this.notifications.notifyClassTeachers(student.classId, notice);
    });
    return item;
  }
  async review(id: string, body: unknown, user: AppUser) {
    const old = await this.findOneFor(user, id);
    const data = validate(reviewSchema, body);
    const item: Submission = { ...old, ...data, isReviewed: true, status: 'published' };
    await this.db.transaction(async () => {
      await this.db.repository<Submission>('submissions').update(item);
      await this.students.refreshStatistics(old.studentId);
      const assessment = await this.db.repository<{ id: string; title: string }>('assessments').find(old.assessmentId);
      await this.notifications.notifyStudent(old.studentId, {
        type: 'submission_reviewed',
        title: `Đã có điểm: ${assessment?.title ?? 'bài làm của em'}`,
        body: `Điểm ${item.finalScore}/10${item.teacherFeedback ? ` · ${item.teacherFeedback.slice(0, 80)}` : ''}`,
        link: '/student',
      });
    });
    return item;
  }
}
