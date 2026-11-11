import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AppUser, Submission } from '../../shared/types';
import { gradeSubmission } from '../../shared/grading';
import { AssessmentsService } from '../assessments/assessments.service';
import { ClassesService } from '../classes/classes.service';
import { validate } from '../common/validate';
import { DatabaseService } from '../database/database.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StudentsService } from '../students/students.service';
import { reviewSchema, submitSchema } from './submissions.dto';

@Injectable()
export class SubmissionsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AssessmentsService) private readonly assessments: AssessmentsService,
    @Inject(StudentsService) private readonly students: StudentsService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(ClassesService) private readonly classes: ClassesService,
  ) {}
  /** Submissions of students in the classes the user teaches (all of them for an admin). */
  async findAllFor(user: AppUser) {
    const scope = await this.classes.scopeFor(user);
    const repo = this.db.repository<Submission>('submissions');
    if (scope === null) return repo.all();
    return repo.whereSql('student_id IN (SELECT id FROM students WHERE class_id = ANY($1))', [scope]);
  }
  async findOneFor(user: AppUser, id: string) {
    const item = await this.db.repository<Submission>('submissions').find(id);
    if (item) {
      const scope = await this.classes.scopeFor(user);
      if (scope === null || scope.includes((await this.students.findOne(item.studentId)).classId)) return item;
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
      await this.notifications.notifyClassTeachers(student.classId, {
        type: 'submission_received',
        title: `${student.name} đã nộp bài${previous ? ' (làm lại)' : ''}`,
        body: `${assessment.title} · chờ chấm và duyệt`,
        link: `/grading?assessment=${encodeURIComponent(assessment.id)}`,
      });
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
