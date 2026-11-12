import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { compare, hash } from 'bcryptjs';
import { DatabaseService } from '../database/database.service';
import { NotificationsService } from '../notifications/notifications.service';
import { z } from 'zod';
import type { AppUser, Role, StaffMember, UserPage } from '../../shared/types';
import { likePattern, pageFields, SqlFilter, toNumber } from '../common/paging';
import { validate } from '../common/validate';
import { approvalSchema, createUserSchema, ownPasswordSchema, passwordSchema, updateUserSchema } from './users.dto';

export type { Role };
export type PublicUser = AppUser;
export interface UserRecord extends AppUser { passwordHash: string; googleSub: string | null }

const userPageSchema = z.object({
  ...pageFields,
  role: z.enum(['all', 'admin', 'teacher', 'student']).default('all'),
  status: z.enum(['all', 'pending']).default('all'),
});

/** What Google tells us about the person signing in (from a verified ID token). */
export interface GoogleProfile { sub: string; email: string; name: string; picture: string | null }

@Injectable()
export class UsersService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}
  private readonly columns = `id, email, name, role, student_id AS "studentId", active, must_change_password AS "mustChangePassword",
    approval, google_sub AS "googleSub", google_sub IS NOT NULL AS "googleLinked", avatar_url AS "avatarUrl",
    password_hash AS "passwordHash", created_at AS "createdAt"`;
  publicUser(user: UserRecord): PublicUser { const { passwordHash: _hash, googleSub: _sub, ...safe } = user; return safe; }
  async all() { return (await this.db.query<UserRecord>(`SELECT ${this.columns} FROM users ORDER BY created_at, id`)).map(user => this.publicUser(user)); }
  /** The account table: filtered by role, approval and search and paged in SQL; `counts` are system-wide totals. */
  async page(query: unknown): Promise<UserPage> {
    const { page, pageSize, q, role, status } = validate(userPageSchema, query);
    const [counts] = await this.db.query<Record<'all' | Role | 'pending', string>>(
      `SELECT count(*) AS "all", count(*) FILTER (WHERE role = 'admin' AND approval = 'approved') AS admin,
              count(*) FILTER (WHERE role = 'teacher' AND approval = 'approved') AS teacher,
              count(*) FILTER (WHERE role = 'student' AND approval = 'approved') AS student,
              count(*) FILTER (WHERE approval = 'pending') AS pending
       FROM users`);
    const f = new SqlFilter();
    if (q) f.add(p => `name ILIKE ${p} OR email ILIKE ${p}`, likePattern(q));
    if (role !== 'all') f.add(p => `role = ${p}`, role);
    if (status === 'pending') f.raw(`approval = 'pending'`);
    const [{ total }] = await this.db.query<{ total: string }>(`SELECT count(*) AS total FROM users ${f.where()}`, [...f.values]);
    // Accounts waiting for approval come first, so the admin sees them without filtering.
    const rows = await this.db.query<UserRecord>(
      `SELECT ${this.columns} FROM users ${f.where()} ORDER BY (approval = 'pending') DESC, created_at, id ${f.limit(page, pageSize)}`, f.values);
    const countsOut = {
      all: toNumber(counts.all), admin: toNumber(counts.admin), teacher: toNumber(counts.teacher),
      student: toNumber(counts.student), pending: toNumber(counts.pending),
    };
    return { items: rows.map(user => this.publicUser(user)), total: toNumber(total), page, pageSize, counts: countsOut };
  }

  /** Active, approved teachers and admins, without anything private. */
  staff() { return this.db.query<StaffMember>(`SELECT id, name, email, role FROM users WHERE active AND approval = 'approved' AND role IN ('teacher', 'admin') ORDER BY name, id`); }
  async byId(id: string) { return (await this.db.query<UserRecord>(`SELECT ${this.columns} FROM users WHERE id = $1`, [id]))[0]; }
  async byEmail(email: string) { return (await this.db.query<UserRecord>(`SELECT ${this.columns} FROM users WHERE email = $1`, [email.trim().toLowerCase()]))[0]; }
  async require(id: string) { const user = await this.byId(id); if (!user) throw new NotFoundException('User not found'); return user; }
  private async checkStudent(role: Role, studentId: string | null) {
    if (role !== 'student') return null;
    if (!studentId) throw new BadRequestException('Student role requires studentId');
    const rows = await this.db.query('SELECT 1 FROM students WHERE id = $1', [studentId]);
    if (!rows.length) throw new BadRequestException('Student not found');
    return studentId;
  }
  async create(body: unknown) {
    const data = validate(createUserSchema, body);
    const studentId = await this.checkStudent(data.role, data.studentId ?? null);
    const id = `user-${randomUUID()}`;
    await this.db.query('INSERT INTO users (id, email, name, role, student_id, password_hash) VALUES ($1,$2,$3,$4,$5,$6)',
      [id, data.email.toLowerCase(), data.name, data.role, studentId, await hash(data.password, 10)]);
    return this.publicUser(await this.require(id));
  }
  async update(id: string, body: unknown) {
    const data = validate(updateUserSchema, body);
    const old = await this.require(id);
    const nextRole = data.role ?? old.role;
    const active = data.active ?? old.active;
    if (old.role === 'admin' && (nextRole !== 'admin' || !active)) {
      const count = await this.db.query<{ count: string }>("SELECT count(*)::text AS count FROM users WHERE role='admin' AND active=true AND approval='approved'");
      if (Number(count[0].count) <= 1) throw new ConflictException('Cannot disable or demote the last active admin');
    }
    const studentId = await this.checkStudent(nextRole, data.studentId === undefined ? old.studentId : data.studentId);
    await this.db.query('UPDATE users SET email=$1, name=$2, role=$3, student_id=$4, active=$5, updated_at=now() WHERE id=$6',
      [(data.email ?? old.email).toLowerCase(), data.name ?? old.name, nextRole, studentId, active, id]);
    return this.publicUser(await this.require(id));
  }

  /** An admin approves or rejects an account that signed up by itself; approving may also set its role. */
  async setApproval(id: string, body: unknown, admin: AppUser) {
    const data = validate(approvalSchema, body);
    const old = await this.require(id);
    if (old.id === admin.id) throw new BadRequestException('You cannot change the approval of your own account');
    const role = data.role ?? old.role;
    const studentId = await this.checkStudent(role, data.studentId === undefined ? old.studentId : data.studentId);
    await this.db.query('UPDATE users SET approval=$1, role=$2, student_id=$3, updated_at=now() WHERE id=$4', [data.approval, role, studentId, id]);
    if (data.approval === 'approved' && old.approval !== 'approved') {
      await this.notifications.notifyUsers([id], {
        type: 'account_approved',
        title: 'Tài khoản của bạn đã được duyệt',
        body: `Chào mừng ${old.name} đến với EduPath! Bạn đã có thể sử dụng đầy đủ các tính năng.`,
        link: null,
      });
    }
    return this.publicUser(await this.require(id));
  }

  /**
   * Signing in with Google: the account linked to this Google account, else the account with the
   * same (Google-verified) email, which then gets linked. Anyone else gets a new teacher account
   * that waits for an admin's approval; admins are told about it.
   */
  async fromGoogle(profile: GoogleProfile): Promise<UserRecord> {
    const linked = (await this.db.query<UserRecord>(`SELECT ${this.columns} FROM users WHERE google_sub = $1`, [profile.sub]))[0];
    if (linked) {
      if (profile.picture && profile.picture !== linked.avatarUrl) await this.db.query('UPDATE users SET avatar_url=$1 WHERE id=$2', [profile.picture, linked.id]);
      return { ...linked, avatarUrl: profile.picture ?? linked.avatarUrl };
    }
    const email = profile.email.trim().toLowerCase();
    const sameEmail = await this.byEmail(email);
    if (sameEmail) {
      if (sameEmail.googleSub) throw new ConflictException('This email is already linked to another Google account');
      await this.db.query('UPDATE users SET google_sub=$1, avatar_url=COALESCE($2, avatar_url), updated_at=now() WHERE id=$3', [profile.sub, profile.picture, sameEmail.id]);
      return this.require(sameEmail.id);
    }
    const id = `user-${randomUUID()}`;
    // No usable password: this account signs in with Google only (an admin can set a password later).
    const unusable = await hash(randomBytes(32).toString('hex'), 10);
    await this.db.query(
      `INSERT INTO users (id, email, name, role, password_hash, google_sub, avatar_url, approval)
       VALUES ($1, $2, $3, 'teacher', $4, $5, $6, 'pending') ON CONFLICT DO NOTHING`,
      [id, email, profile.name || email, unusable, profile.sub, profile.picture]);
    const created = await this.byId(id);
    // Two sign-ins at the same moment: the other one created it.
    if (!created) return this.fromGoogle(profile);
    const admins = await this.db.query<{ id: string }>(`SELECT id FROM users WHERE role = 'admin' AND active AND approval = 'approved'`);
    await this.notifications.notifyUsers(admins.map(a => a.id), {
      type: 'account_pending',
      title: `Giáo viên mới chờ duyệt: ${created.name}`,
      body: `${created.email} vừa đăng ký bằng Google. Bấm để duyệt hoặc từ chối.`,
      link: '/admin/users?status=pending',
    });
    return created;
  }

  async changePassword(id: string, body: unknown) {
    const { password } = validate(passwordSchema, body);
    await this.require(id);
    // The admin knows this password, so the owner has to replace it at next sign-in.
    await this.db.query('UPDATE users SET password_hash=$1, must_change_password=true, updated_at=now() WHERE id=$2', [await hash(password, 10), id]);
    return { success: true };
  }
  /** A signed-in user replacing their own password; clears the "must change" flag. */
  async changeOwnPassword(id: string, body: unknown) {
    const { currentPassword, newPassword } = validate(ownPasswordSchema, body);
    const user = await this.require(id);
    if (!(await compare(currentPassword, user.passwordHash))) throw new BadRequestException('Mật khẩu hiện tại không đúng');
    await this.db.query('UPDATE users SET password_hash=$1, must_change_password=false, updated_at=now() WHERE id=$2', [await hash(newPassword, 10), id]);
    return this.publicUser(await this.require(id));
  }
}
