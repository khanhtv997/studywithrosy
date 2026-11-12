import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { likePattern, optionalFilter, pageFields, SqlFilter, toNumber } from '../common/paging';
import { canSeeAssessment, visibleAssessmentSql } from './visibility';
import type {
  AppUser, Assessment, AssessmentPage, AssessmentShareInfo, ReviewAnnotations, SharedAssessmentSummary, SharedAssessmentView, StaffMember,
} from '../../shared/types';
import { ClassesService } from '../classes/classes.service';
import { validate } from '../common/validate';
import { DatabaseService } from '../database/database.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StudentsService } from '../students/students.service';
import { annotationsSchema, copySchema, createAssessmentSchema, shareSchema, updateAssessmentSchema } from './assessments.dto';

const assessmentPageSchema = z.object({
  ...pageFields,
  type: z.enum(['all', 'exam', 'homework']).default('all'),
  classId: optionalFilter,
  status: z.enum(['all', 'draft', 'published', 'closed']).default('all'),
});

const totalPoints = (item: Pick<Assessment, 'questions'>) => item.questions.reduce((sum, q) => sum + q.points, 0);
const unique = (ids: string[]) => [...new Set(ids)];

/**
 * Assessments, their classes and sharing between teachers.
 * A teacher sees an assessment they own or one assigned to a class they teach; an admin sees all.
 * Sharing never gives write access: the other teacher makes their own copy and assigns that.
 */
@Injectable()
export class AssessmentsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(ClassesService) private readonly classes: ClassesService,
    @Inject(StudentsService) private readonly students: StudentsService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  private repo() { return this.db.repository<Assessment>('assessments'); }

  /** Tells the students of these classes that the assessment is now open for them. */
  private async announce(item: Assessment, classIds: string[], reopened = false) {
    const kind = item.type === 'exam' ? 'Bài kiểm tra' : 'Bài tập';
    const due = new Date(item.dueDate).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
    for (const classId of classIds) {
      const classroom = await this.db.repository<{ id: string; name: string }>('classes').find(classId);
      await this.notifications.notifyClassStudents(classId, {
        type: 'assessment_published',
        title: `${kind} ${reopened ? 'được mở lại' : 'mới'}: ${item.title}`,
        body: `${classroom?.name ?? 'Lớp của em'} · ${item.questions.length} câu · Hạn nộp ${due}`,
        link: '/student',
      });
    }
  }

  // ---------- Reading ----------

  findAll() { return this.repo().all(); }

  /** What the user may see (see visibility.ts): an admin everything, a teacher their own assessments. */
  async findAllFor(user: AppUser) {
    const scope = await this.classes.scopeFor(user);
    const f = new SqlFilter();
    const visible = visibleAssessmentSql(user, scope, f, 'assessments');
    return visible ? this.repo().whereSql(visible, f.values) : this.findAll();
  }

  /** The assessment list: visible ones, filtered, counted per type and paged in SQL, newest first. */
  async page(user: AppUser, query: unknown): Promise<AssessmentPage> {
    const { page, pageSize, q, type, classId, status } = validate(assessmentPageSchema, query);
    const scope = await this.classes.scopeFor(user);
    const f = new SqlFilter();
    const visible = visibleAssessmentSql(user, scope, f);
    if (visible) f.raw(visible);
    if (classId) f.add(p => `a.data->'classIds' ? ${p}`, classId);
    if (status !== 'all') f.add(p => `a.data->>'status' = ${p}`, status);
    if (q) f.add(p => `a.data->>'title' ILIKE ${p}`, likePattern(q));

    const [counts] = await this.db.query<{ all: string; exam: string; homework: string }>(
      `SELECT count(*) AS "all", count(*) FILTER (WHERE a.data->>'type' = 'exam') AS exam,
              count(*) FILTER (WHERE a.data->>'type' = 'homework') AS homework
       FROM assessments a ${f.where()}`, [...f.values]);

    const typeSql = type === 'all' ? '' : `a.data->>'type' = ${f.param(type)}`;
    // Submission counts only include students the user may see.
    const scopeParam = f.param(scope);
    const visibleSubs = `FROM submissions s JOIN students st ON st.id = s.student_id
      WHERE s.assessment_id = a.id AND (${scopeParam}::text[] IS NULL OR st.class_id = ANY(${scopeParam}::text[]))`;
    const rows = await this.db.query<{ data: Assessment; submission_count: string; pending_count: string }>(
      `SELECT a.data, (SELECT count(*) ${visibleSubs}) AS submission_count,
              (SELECT count(*) ${visibleSubs} AND s.data->>'status' = 'pending_review') AS pending_count
       FROM assessments a ${f.where(typeSql)}
       ORDER BY a.data->>'createdAt' DESC, a.id ${f.limit(page, pageSize)}`, f.values);

    const countsOut = { all: toNumber(counts.all), exam: toNumber(counts.exam), homework: toNumber(counts.homework) };
    return {
      items: rows.map(r => ({ ...r.data, submissionCount: toNumber(r.submission_count), pendingCount: toNumber(r.pending_count) })),
      total: countsOut[type], page, pageSize, counts: countsOut,
    };
  }

  /** Assessments open to a student's class. */
  findForClass(classId: string) { return this.repo().whereSql(`data->'classIds' ? $1`, [classId]); }

  async findOne(id: string) {
    const item = await this.repo().find(id);
    if (!item) throw new NotFoundException(`Assessment ${id} not found`);
    return item;
  }

  async canSee(user: AppUser, item: Assessment) {
    if (user.role === 'admin') return true;
    return canSeeAssessment(user, await this.classes.scopeFor(user), item);
  }

  /** "Not found" also for assessments the user may not see, so ids reveal nothing. */
  async findOneFor(user: AppUser, id: string) {
    const item = await this.repo().find(id);
    if (!item || !(await this.canSee(user, item))) throw new NotFoundException(`Assessment ${id} not found`);
    return item;
  }

  /** Owner or admin; assessments from before ownership existed belong to whoever can see them. */
  private async findOwned(user: AppUser, id: string) {
    const item = await this.findOneFor(user, id);
    if (user.role !== 'admin' && item.ownerId && item.ownerId !== user.id) throw new ForbiddenException('Only the owner can do this');
    return item;
  }

  // ---------- Writing ----------

  async create(body: unknown, user: AppUser) {
    const data = validate(createAssessmentSchema, body);
    const classIds = unique(data.classIds);
    await this.classes.assertAccess(user, classIds);
    if (data.status !== 'draft' && !classIds.length) throw new BadRequestException('Hãy chọn ít nhất một lớp trước khi giao bài.');
    const item: Assessment = { ...data, classIds, id: `assess-${randomUUID()}`, ownerId: user.id, ownerName: user.name,
      totalPoints: totalPoints(data), createdAt: new Date().toISOString() };
    await this.db.transaction(async () => {
      await this.repo().insert(item);
      if (item.status === 'published') await this.announce(item, classIds);
    });
    return item;
  }

  async update(id: string, body: unknown, user: AppUser) {
    const old = await this.findOneFor(user, id);
    const data = validate(updateAssessmentSchema, body);
    if (data.questions && (await this.db.query('SELECT 1 FROM submissions WHERE assessment_id = $1 LIMIT 1', [id])).length) {
      throw new ConflictException('Cannot change questions after submissions exist');
    }

    let classIds = old.classIds;
    if (data.classIds) {
      const scope = await this.classes.scopeFor(user);
      const requested = unique(data.classIds);
      // A teacher can only add their own classes, and never drops another teacher's class by omission.
      const added = requested.filter(c => !old.classIds.includes(c));
      await this.classes.assertAccess(user, added);
      const kept = scope === null ? [] : old.classIds.filter(c => !scope.includes(c));
      classIds = unique([...requested, ...kept]);
      const removed = old.classIds.filter(c => !classIds.includes(c));
      if (removed.length) {
        const blocked = await this.db.query<{ name: string }>(`SELECT DISTINCT c.data->>'name' AS name
          FROM submissions s JOIN students st ON st.id = s.student_id JOIN classes c ON c.id = st.class_id
          WHERE s.assessment_id = $1 AND st.class_id = ANY($2)`, [id, removed]);
        if (blocked.length) throw new ConflictException(`Lớp ${blocked.map(b => b.name).join(', ')} đã có học sinh nộp bài nên không bỏ ra được.`);
      }
    }

    const item: Assessment = { ...old, ...data, classIds, totalPoints: data.questions ? totalPoints(data as Assessment) : old.totalPoints };
    if (item.status !== 'draft' && !item.classIds.length) throw new BadRequestException('Hãy chọn ít nhất một lớp trước khi giao bài.');
    await this.db.transaction(async () => {
      await this.repo().update(item);
      // Students hear about it when it opens for them: newly published or reopened (all classes), or a class was added.
      if (item.status !== 'published') return;
      if (old.status !== 'published') await this.announce(item, item.classIds, old.status === 'closed');
      else await this.announce(item, item.classIds.filter(c => !old.classIds.includes(c)));
    });
    return item;
  }

  async remove(id: string, user: AppUser) {
    await this.findOwned(user, id);
    await this.db.transaction(async () => {
      const affected = (await this.db.query<{ student_id: string }>('SELECT DISTINCT student_id FROM submissions WHERE assessment_id = $1', [id])).map(row => row.student_id);
      await this.repo().delete(id);
      for (const studentId of new Set(affected)) await this.students.refreshStatistics(studentId);
    });
    return { id };
  }

  // ---------- Review screen: the user's own highlights and notes ----------

  async annotations(user: AppUser, id: string): Promise<ReviewAnnotations> {
    await this.findOneFor(user, id);
    const [row] = await this.db.query<{ data: ReviewAnnotations; updated_at: string }>(
      'SELECT data, updated_at FROM review_annotations WHERE assessment_id = $1 AND user_id = $2', [id, user.id]);
    return row ? { drawings: [], ...row.data, updatedAt: row.updated_at } : { highlights: [], notes: {}, drawings: [], updatedAt: null };
  }

  async saveAnnotations(user: AppUser, id: string, body: unknown): Promise<ReviewAnnotations> {
    await this.findOneFor(user, id);
    const data = validate(annotationsSchema, body);
    // Empty notes are dropped rather than stored.
    const notes = Object.fromEntries(Object.entries(data.notes).filter(([, text]) => text.trim() !== ''));
    const value = { highlights: data.highlights, notes, drawings: data.drawings };
    const [row] = await this.db.query<{ updated_at: string }>(
      `INSERT INTO review_annotations (assessment_id, user_id, data) VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (assessment_id, user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now() RETURNING updated_at`,
      [id, user.id, JSON.stringify(value)]);
    return { ...value, updatedAt: row.updated_at };
  }

  // ---------- Sharing ----------

  async shares(id: string, user: AppUser): Promise<AssessmentShareInfo> {
    await this.findOwned(user, id);
    const [recipients, token] = await Promise.all([
      this.db.query<StaffMember & { sharedAt: string }>(`SELECT u.id, u.name, u.email, u.role, sh.created_at AS "sharedAt"
        FROM assessment_shares sh JOIN users u ON u.id = sh.user_id WHERE sh.assessment_id = $1 ORDER BY sh.created_at`, [id]),
      this.db.query<{ share_token: string | null }>('SELECT share_token FROM assessments WHERE id = $1', [id]),
    ]);
    return { recipients, linkToken: token[0]?.share_token ?? null };
  }

  async share(id: string, body: unknown, user: AppUser) {
    const item = await this.findOwned(user, id);
    const { userIds } = validate(shareSchema, body);
    const targets = (await this.db.query<{ id: string }>(`SELECT id FROM users WHERE id = ANY($1) AND id <> $2 AND active AND role IN ('teacher', 'admin')`,
      [unique(userIds), user.id])).map(row => row.id);
    if (!targets.length) throw new BadRequestException('Teacher not found');
    await this.db.transaction(async () => {
      const added = (await this.db.query<{ user_id: string }>(`INSERT INTO assessment_shares (assessment_id, user_id, shared_by)
        SELECT $1, unnest($2::text[]), $3 ON CONFLICT DO NOTHING RETURNING user_id`, [id, targets, user.id])).map(row => row.user_id);
      await this.notifications.notifyUsers(added, {
        type: 'assessment_shared',
        title: `${user.name} đã chia sẻ đề: ${item.title}`,
        body: `${item.questions.length} câu · Bấm để xem và giao cho lớp của bạn`,
        link: `/shared/${encodeURIComponent(id)}`,
      });
    });
    return this.shares(id, user);
  }

  async unshare(id: string, userId: string, user: AppUser) {
    await this.findOwned(user, id);
    await this.db.query('DELETE FROM assessment_shares WHERE assessment_id = $1 AND user_id = $2', [id, userId]);
    return this.shares(id, user);
  }

  async createLink(id: string, user: AppUser) {
    await this.findOwned(user, id);
    await this.db.query('UPDATE assessments SET share_token = COALESCE(share_token, $1) WHERE id = $2', [randomBytes(18).toString('base64url'), id]);
    return this.shares(id, user);
  }

  async revokeLink(id: string, user: AppUser) {
    await this.findOwned(user, id);
    await this.db.query('UPDATE assessments SET share_token = NULL WHERE id = $1', [id]);
    return this.shares(id, user);
  }

  async sharedWithMe(user: AppUser): Promise<SharedAssessmentSummary[]> {
    const rows = await this.db.query<{ data: Assessment; owner_name: string | null; shared_by_name: string | null; shared_at: string }>(
      `SELECT a.data, o.name AS owner_name, b.name AS shared_by_name, sh.created_at AS shared_at
       FROM assessment_shares sh
       JOIN assessments a ON a.id = sh.assessment_id
       LEFT JOIN users o ON o.id = a.owner_id
       LEFT JOIN users b ON b.id = sh.shared_by
       WHERE sh.user_id = $1 ORDER BY sh.created_at DESC`, [user.id]);
    return rows.map(({ data, owner_name, shared_by_name, shared_at }) => ({
      id: data.id, title: data.title, type: data.type, level: data.level, questionCount: data.questions.length,
      totalPoints: data.totalPoints, ownerName: owner_name ?? data.ownerName ?? '', sharedByName: shared_by_name ?? '', sharedAt: shared_at,
    }));
  }

  /** Opens a shared assessment by link token, or by id when it was shared with the user (or they can see it anyway). */
  private async resolveShared(key: string, user: AppUser) {
    const byToken = await this.db.query<{ data: Assessment }>('SELECT data FROM assessments WHERE share_token = $1', [key]);
    if (byToken[0]) return byToken[0].data;
    const item = await this.repo().find(key);
    if (item) {
      const shared = await this.db.query('SELECT 1 FROM assessment_shares WHERE assessment_id = $1 AND user_id = $2', [key, user.id]);
      if (shared.length || await this.canSee(user, item)) return item;
    }
    throw new NotFoundException('Liên kết chia sẻ không còn hiệu lực hoặc bạn không được chia sẻ đề này.');
  }

  async openShared(key: string, user: AppUser): Promise<SharedAssessmentView> {
    const item = await this.resolveShared(key, user);
    const [owner, copies] = await Promise.all([
      this.db.query<{ name: string }>('SELECT u.name FROM assessments a JOIN users u ON u.id = a.owner_id WHERE a.id = $1', [item.id]),
      this.db.query<{ id: string; title: string; createdAt: string }>(`SELECT id, data->>'title' AS title, data->>'createdAt' AS "createdAt"
        FROM assessments WHERE owner_id = $1 AND data->'copiedFrom'->>'assessmentId' = $2 ORDER BY sort_order`, [user.id, item.id]),
    ]);
    // Classes and ownership details of the original are the other teacher's business.
    const assessment: Assessment = { ...item, classIds: [] };
    return { assessment, ownerName: owner[0]?.name ?? item.ownerName ?? '', isOwner: item.ownerId === user.id, myCopies: copies };
  }

  /** Makes the user's own copy of a shared assessment, optionally assigned to their classes right away. */
  async copyShared(key: string, body: unknown, user: AppUser) {
    const source = await this.resolveShared(key, user);
    const data = validate(copySchema, body);
    const classIds = unique(data.classIds);
    await this.classes.assertAccess(user, classIds);
    if (data.status === 'published' && !classIds.length) throw new BadRequestException('Hãy chọn ít nhất một lớp trước khi giao bài.');
    const dueDate = data.dueDate ?? (Date.parse(source.dueDate) > Date.now() ? source.dueDate : new Date(Date.now() + 7 * 864e5).toISOString());
    const ownerName = (await this.db.query<{ name: string }>('SELECT name FROM users WHERE id = $1', [source.ownerId ?? '']))[0]?.name ?? source.ownerName ?? '';
    const item: Assessment = {
      id: `assess-${randomUUID()}`, title: source.title, type: source.type, subject: source.subject, level: source.level,
      description: source.description, durationMinutes: source.durationMinutes, allowRetry: source.allowRetry,
      questions: source.questions, totalPoints: totalPoints(source), classIds, dueDate, status: data.status,
      ownerId: user.id, ownerName: user.name, createdAt: new Date().toISOString(),
      copiedFrom: { assessmentId: source.id, ownerName },
    };
    await this.db.transaction(async () => {
      await this.repo().insert(item);
      if (item.status === 'published') await this.announce(item, classIds);
    });
    return item;
  }
}
