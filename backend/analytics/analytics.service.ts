import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { BLANK_ANSWER, computeItemAnalysis, computeKnowledgeGaps } from '../../shared/analytics';
import { isAnswerCorrect } from '../../shared/grading';
import type { AppUser, AssessmentAnalytics, ClassAnalytics, ClassAssessmentRow, ClassResult, Submission } from '../../shared/types';
import { AssessmentsService } from '../assessments/assessments.service';
import { ClassesService } from '../classes/classes.service';
import { optionalFilter, pageFields, round1, SqlFilter, toNumber } from '../common/paging';
import { validate } from '../common/validate';
import { DatabaseService } from '../database/database.service';

const assessmentQuerySchema = z.object({ classId: optionalFilter });
const classQuerySchema = z.object({ page: pageFields.page, pageSize: pageFields.pageSize });

/** Score used for averages: the teacher's final score once reviewed, the automatic score before. */
const scoreOf = (s: Submission) => s.finalScore ?? s.autoScore;
const SCORE_SQL = `COALESCE((s.data->>'finalScore')::numeric, (s.data->>'autoScore')::numeric)`;
const rate = (part: number, whole: number) => whole > 0 ? Math.min(100, Math.round(part / whole * 100)) : 0;
const average = (values: number[]) => values.length ? round1(values.reduce((a, b) => a + b, 0) / values.length) : null;

/**
 * Results per assessment (split by class) and per class (across its assessments).
 * Only classes the user teaches are counted; an admin sees all of them.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(ClassesService) private readonly classes: ClassesService,
    @Inject(AssessmentsService) private readonly assessments: AssessmentsService,
  ) {}

  async assessment(user: AppUser, id: string, query: unknown): Promise<AssessmentAnalytics> {
    const { classId } = validate(assessmentQuerySchema, query);
    const item = await this.assessments.findOneFor(user, id);
    const scope = await this.classes.scopeFor(user);
    let classIds = scope === null ? item.classIds : item.classIds.filter(c => scope.includes(c));
    if (classId) {
      if (!classIds.includes(classId)) throw new NotFoundException(`Class ${classId} not found`);
      classIds = [classId];
    }

    const [classRows, rows] = await Promise.all([
      this.db.query<{ id: string; name: string; students: string }>(
        `SELECT c.id, c.data->>'name' AS name, (SELECT count(*) FROM students st WHERE st.class_id = c.id) AS students
         FROM classes c WHERE c.id = ANY($1) ORDER BY c.sort_order`, [classIds]),
      this.db.query<{ data: Submission; class_id: string }>(
        `SELECT s.data, st.class_id FROM submissions s JOIN students st ON st.id = s.student_id
         WHERE s.assessment_id = $1 AND st.class_id = ANY($2) ORDER BY s.sort_order`, [id, classIds]),
    ]);
    const submissions = rows.map(r => r.data);

    const resultFor = (classIdOf: string, className: string, students: number, subs: Submission[]): ClassResult => ({
      classId: classIdOf, className, students, submitted: subs.length,
      reviewed: subs.filter(s => s.status === 'published').length,
      avgScore: average(subs.map(scoreOf)),
      completionRate: rate(subs.length, students),
    });
    const byClass = classRows.map(c => resultFor(c.id, c.name, toNumber(c.students), rows.filter(r => r.class_id === c.id).map(r => r.data)));
    const scores = submissions.map(scoreOf);
    const totals = {
      ...resultFor(classId ?? '', '', byClass.reduce((sum, c) => sum + c.students, 0), submissions),
      highest: scores.length ? Math.max(...scores) : null,
      lowest: scores.length ? Math.min(...scores) : null,
    };

    const questions = new Map(item.questions.map(q => [q.id, q]));
    const items = computeItemAnalysis(item, submissions).map(analysis => {
      const question = questions.get(analysis.questionId)!;
      const wrongStudents = submissions
        .filter(sub => !isAnswerCorrect(question, sub.answers[question.id]))
        .map(sub => ({ name: sub.studentName, answer: sub.answers[question.id] || BLANK_ANSWER }));
      return { ...analysis, wrongStudents };
    });

    return {
      assessment: { id: item.id, title: item.title, type: item.type, status: item.status, dueDate: item.dueDate, questionCount: item.questions.length, classIds },
      classId: classId ?? null, totals, byClass, items, gaps: computeKnowledgeGaps(item, submissions),
    };
  }

  async classView(user: AppUser, classId: string, query: unknown): Promise<ClassAnalytics> {
    const { page, pageSize } = validate(classQuerySchema, query);
    const classroom = await this.classes.findOneFor(user, classId);

    const [summary] = await this.db.query<{ students: string; assessments: string; submitted: string; avg: string | null; need_support: string }>(
      `SELECT (SELECT count(*) FROM students st WHERE st.class_id = $1) AS students,
              (SELECT count(*) FROM assessments a WHERE a.data->'classIds' ? $1 AND a.data->>'status' <> 'draft') AS assessments,
              (SELECT count(*) FROM submissions s JOIN students st ON st.id = s.student_id
                 JOIN assessments a ON a.id = s.assessment_id
                WHERE st.class_id = $1 AND a.data->'classIds' ? $1) AS submitted,
              (SELECT avg(${SCORE_SQL}) FROM submissions s JOIN students st ON st.id = s.student_id
                 JOIN assessments a ON a.id = s.assessment_id
                WHERE st.class_id = $1 AND a.data->'classIds' ? $1) AS avg,
              (SELECT count(*) FROM students st WHERE st.class_id = $1
                 AND COALESCE((st.data->>'completedCount')::int, 0) > 0 AND COALESCE((st.data->>'averageScore')::numeric, 0) < 6) AS need_support`,
      [classId]);
    const students = toNumber(summary.students);
    const assessmentCount = toNumber(summary.assessments);

    const f = new SqlFilter();
    f.add(p => `a.data->'classIds' ? ${p}`, classId);
    const [{ total }] = await this.db.query<{ total: string }>(`SELECT count(*) AS total FROM assessments a ${f.where()}`, [...f.values]);
    const classParam = '$1';
    const rows = await this.db.query<{ id: string; title: string; type: ClassAssessmentRow['type']; status: ClassAssessmentRow['status']; due_date: string; question_count: string; submitted: string; pending: string; avg: string | null }>(
      `SELECT a.id, a.data->>'title' AS title, a.data->>'type' AS type, a.data->>'status' AS status, a.data->>'dueDate' AS due_date,
              jsonb_array_length(a.data->'questions') AS question_count,
              count(s.id) AS submitted,
              count(s.id) FILTER (WHERE s.data->>'status' = 'pending_review') AS pending,
              avg(${SCORE_SQL}) AS avg
       FROM assessments a
       LEFT JOIN submissions s ON s.assessment_id = a.id AND s.student_id IN (SELECT id FROM students WHERE class_id = ${classParam})
       ${f.where()} GROUP BY a.id ORDER BY a.data->>'createdAt' DESC, a.id ${f.limit(page, pageSize)}`, f.values);

    return {
      classId, className: classroom.name, students, assessments: assessmentCount,
      avgScore: round1(summary.avg), completionRate: rate(toNumber(summary.submitted), students * assessmentCount),
      needSupport: toNumber(summary.need_support),
      items: rows.map(r => ({
        assessmentId: r.id, title: r.title, type: r.type, status: r.status, dueDate: r.due_date,
        questionCount: toNumber(r.question_count), submitted: toNumber(r.submitted), pending: toNumber(r.pending),
        avgScore: round1(r.avg), completionRate: rate(toNumber(r.submitted), students),
      })),
      total: toNumber(total), page, pageSize,
    };
  }
}
