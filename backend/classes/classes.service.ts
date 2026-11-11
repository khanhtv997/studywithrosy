import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AppUser, ClassRoom } from '../../shared/types';
import { validate } from '../common/validate';
import { DatabaseService } from '../database/database.service';
import { createClassSchema, updateClassSchema } from './classes.dto';

/**
 * Classes, and the rule every other module builds on: a teacher works only with the classes
 * listed in their teacherIds; an admin works with all of them.
 */
@Injectable()
export class ClassesService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  private repo() { return this.db.repository<ClassRoom>('classes'); }

  /** Ids of the classes the user may work with, or null for "every class" (admin). */
  async scopeFor(user: AppUser): Promise<string[] | null> {
    if (user.role === 'admin') return null;
    const rows = await this.db.query<{ id: string }>(`SELECT id FROM classes WHERE data->'teacherIds' ? $1`, [user.id]);
    return rows.map(row => row.id);
  }

  canAccess(user: AppUser, item: ClassRoom) {
    return user.role === 'admin' || (item.teacherIds ?? []).includes(user.id);
  }

  findAll() { return this.repo().all(); }

  findAllFor(user: AppUser) {
    return user.role === 'admin' ? this.repo().all() : this.repo().whereSql(`data->'teacherIds' ? $1`, [user.id]);
  }

  async findOne(id: string) {
    const item = await this.repo().find(id);
    if (!item) throw new NotFoundException(`Class ${id} not found`);
    return item;
  }

  /** Same answer for "missing" and "not yours", so ids of other teachers' classes reveal nothing. */
  async findOneFor(user: AppUser, id: string) {
    const item = await this.repo().find(id);
    if (!item || !this.canAccess(user, item)) throw new NotFoundException(`Class ${id} not found`);
    return item;
  }

  async assertAccess(user: AppUser, ids: string[]) {
    return Promise.all([...new Set(ids)].map(id => this.findOneFor(user, id)));
  }

  /** Keeps only ids of active teacher/admin accounts. */
  private async checkTeachers(ids: string[]) {
    const unique = [...new Set(ids)];
    if (!unique.length) return [];
    const rows = await this.db.query<{ id: string }>(`SELECT id FROM users WHERE id = ANY($1) AND role IN ('teacher', 'admin')`, [unique]);
    if (rows.length !== unique.length) throw new BadRequestException('Teacher not found');
    return unique;
  }

  async create(body: unknown, user: AppUser) {
    const data = validate(createClassSchema, body);
    if ((await this.repo().where({ code: data.code })).length) throw new ConflictException('Class code already exists');
    // A teacher creating a class teaches it; an admin picks the teachers (possibly none yet).
    const teacherIds = user.role === 'admin' ? await this.checkTeachers(data.teacherIds ?? []) : [user.id];
    const item: ClassRoom = { ...data, teacherIds, id: `class-${randomUUID()}`, studentCount: 0 };
    await this.repo().insert(item);
    return item;
  }

  async update(id: string, body: unknown, user: AppUser) {
    const old = await this.findOneFor(user, id);
    const data = validate(updateClassSchema, body);
    if (data.teacherIds !== undefined && user.role !== 'admin') throw new BadRequestException('Only admins can change the teachers of a class');
    if (data.code && data.code !== old.code && (await this.repo().where({ code: data.code })).length) throw new ConflictException('Class code already exists');
    const teacherIds = data.teacherIds !== undefined ? await this.checkTeachers(data.teacherIds) : old.teacherIds ?? [];
    const item: ClassRoom = { ...old, ...data, teacherIds };
    await this.db.query('UPDATE classes SET code = $1, data = $2::jsonb WHERE id = $3', [item.code, JSON.stringify(item), id]);
    return item;
  }

  /** Recomputes the cached studentCount from the students table. */
  async refreshStudentCount(id: string) {
    await this.db.query(`UPDATE classes SET data = jsonb_set(data, '{studentCount}',
      to_jsonb((SELECT count(*)::integer FROM students WHERE class_id = $1))) WHERE id = $1`, [id]);
  }
}
