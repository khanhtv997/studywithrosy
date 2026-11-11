import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { compare, hash } from 'bcryptjs';
import { DatabaseService } from '../database/database.service';
import type { AppUser, Role, StaffMember } from '../../shared/types';
import { validate } from '../common/validate';
import { createUserSchema, ownPasswordSchema, passwordSchema, updateUserSchema } from './users.dto';

export type { Role };
export type PublicUser = AppUser;
export interface UserRecord extends AppUser { passwordHash: string; }

@Injectable()
export class UsersService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}
  private readonly columns = 'id, email, name, role, student_id AS "studentId", active, must_change_password AS "mustChangePassword", password_hash AS "passwordHash", created_at AS "createdAt"';
  publicUser(user: UserRecord): PublicUser { const { passwordHash: _hash, ...safe } = user; return safe; }
  async all() { return (await this.db.query<UserRecord>(`SELECT ${this.columns} FROM users ORDER BY created_at, id`)).map(user => this.publicUser(user)); }
  /** Active teachers and admins, without anything private. */
  staff() { return this.db.query<StaffMember>(`SELECT id, name, email, role FROM users WHERE active AND role IN ('teacher', 'admin') ORDER BY name, id`); }
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
      const count = await this.db.query<{ count: string }>("SELECT count(*)::text AS count FROM users WHERE role='admin' AND active=true");
      if (Number(count[0].count) <= 1) throw new ConflictException('Cannot disable or demote the last active admin');
    }
    const studentId = await this.checkStudent(nextRole, data.studentId === undefined ? old.studentId : data.studentId);
    await this.db.query('UPDATE users SET email=$1, name=$2, role=$3, student_id=$4, active=$5, updated_at=now() WHERE id=$6',
      [(data.email ?? old.email).toLowerCase(), data.name ?? old.name, nextRole, studentId, active, id]);
    return this.publicUser(await this.require(id));
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
