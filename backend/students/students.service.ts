import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AppUser, Student, Submission } from '../../shared/types';
import { ClassesService } from '../classes/classes.service';
import { validate } from '../common/validate';
import { DatabaseService } from '../database/database.service';
import { createStudentSchema } from './students.dto';

@Injectable()
export class StudentsService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService, @Inject(ClassesService) private readonly classes: ClassesService) {}
  findAll() { return this.db.repository<Student>('students').all(); }
  /** Students of the classes the user teaches (all students for an admin). */
  async findAllFor(user: AppUser) {
    const scope = await this.classes.scopeFor(user);
    return scope === null ? this.findAll() : this.db.repository<Student>('students').whereSql('class_id = ANY($1)', [scope]);
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
