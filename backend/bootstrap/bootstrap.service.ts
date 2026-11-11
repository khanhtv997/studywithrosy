import { Inject, Injectable } from '@nestjs/common';
import type { AppUser, Assessment, ClassRoom, Student, Submission } from '../../shared/types';
import { AssessmentsService } from '../assessments/assessments.service';
import { ClassesService } from '../classes/classes.service';
import { DatabaseService } from '../database/database.service';
import { StudentsService } from '../students/students.service';
import { SubmissionsService } from '../submissions/submissions.service';

export interface BootstrapData {
  classes: ClassRoom[];
  students: Student[];
  assessments: Assessment[];
  submissions: Submission[];
}

const EMPTY: BootstrapData = { classes: [], students: [], assessments: [], submissions: [] };

@Injectable()
export class BootstrapService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(ClassesService) private readonly classes: ClassesService,
    @Inject(StudentsService) private readonly students: StudentsService,
    @Inject(AssessmentsService) private readonly assessments: AssessmentsService,
    @Inject(SubmissionsService) private readonly submissions: SubmissionsService,
  ) {}

  async forUser(user: AppUser): Promise<BootstrapData> {
    if (user.role !== 'student') return this.forStaff(user);
    return user.studentId ? this.forStudent(user.studentId) : EMPTY;
  }

  /** An admin gets everything; a teacher gets their classes and what belongs to them. */
  private async forStaff(user: AppUser): Promise<BootstrapData> {
    const [classes, students, assessments, submissions] = await Promise.all([
      this.classes.findAllFor(user),
      this.students.findAllFor(user),
      this.assessments.findAllFor(user),
      this.submissions.findAllFor(user),
    ]);
    return { classes, students, assessments, submissions };
  }

  /** A student sees only their class, and no scores or answer keys before the teacher reviews. */
  private async forStudent(studentId: string): Promise<BootstrapData> {
    const student = await this.db.repository<Student>('students').find(studentId);
    if (!student) return EMPTY;
    const [classroom, assessments, submissions] = await Promise.all([
      this.db.repository<ClassRoom>('classes').find(student.classId),
      this.assessments.findForClass(student.classId),
      this.db.repository<Submission>('submissions').where({ student_id: student.id }),
    ]);
    const ownSubmissions = submissions.map(item => item.isReviewed ? item : { ...item, autoScore: 0, finalScore: null, teacherFeedback: '' });
    const reviewed = new Set(ownSubmissions.filter(sub => sub.isReviewed).map(sub => sub.assessmentId));
    // Students see only their own class among the assessment's classes.
    const visibleAssessments = assessments.filter(item => item.status !== 'draft').map(item => ({ ...item, classIds: [student.classId] })).map(item => reviewed.has(item.id)
      ? item
      : { ...item, questions: item.questions.map(question => ({ ...question, correctAnswer: '', explanation: '' })) });
    return { classes: classroom ? [classroom] : [], students: [student], assessments: visibleAssessments, submissions: ownSubmissions };
  }
}
