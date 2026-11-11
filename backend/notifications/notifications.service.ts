import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AppNotification, NotificationList, NotificationType } from '../../shared/types';
import { DatabaseService } from '../database/database.service';

export interface NotificationInput {
  type: NotificationType;
  title: string;
  body?: string;
  link?: string | null;
}

const LIST_LIMIT = 30;
const COLUMNS = `id, type, title, body, link, read_at IS NOT NULL AS read, created_at AS "createdAt"`;

/**
 * Stores in-app notifications. Each notify* method inserts one row per recipient with a
 * single INSERT ... SELECT, so callers can run it inside their own transaction.
 */
@Injectable()
export class NotificationsService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  private async insertFor(recipientsSql: string, params: unknown[], input: NotificationInput) {
    const base = params.length;
    await this.db.query(
      `INSERT INTO notifications (id, user_id, type, title, body, link)
       SELECT 'ntf-' || gen_random_uuid(), u.id, $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}
       FROM users u ${recipientsSql}`,
      [...params, input.type, input.title, input.body ?? '', input.link ?? null],
    );
  }

  /** Every active student account linked to a student of the class. */
  notifyClassStudents(classId: string, input: NotificationInput) {
    return this.insertFor('JOIN students s ON s.id = u.student_id WHERE s.class_id = $1 AND u.active', [classId], input);
  }

  /** The active account linked to one student. */
  notifyStudent(studentId: string, input: NotificationInput) {
    return this.insertFor('WHERE u.student_id = $1 AND u.active', [studentId], input);
  }

  /** The class's teachers; admins instead when the class has no teacher yet, so nothing goes unseen. */
  notifyClassTeachers(classId: string, input: NotificationInput) {
    return this.insertFor(`CROSS JOIN (SELECT COALESCE(data->'teacherIds', '[]'::jsonb) AS ids FROM classes WHERE id = $1) c
      WHERE u.active AND u.role IN ('teacher', 'admin')
        AND (c.ids ? u.id OR (jsonb_array_length(c.ids) = 0 AND u.role = 'admin'))`, [classId], input);
  }

  /** Specific active accounts. */
  notifyUsers(userIds: string[], input: NotificationInput) {
    if (!userIds.length) return Promise.resolve();
    return this.insertFor('WHERE u.id = ANY($1) AND u.active', [userIds], input);
  }

  async list(userId: string): Promise<NotificationList> {
    const [items, counts] = await Promise.all([
      this.db.query<AppNotification>(`SELECT ${COLUMNS} FROM notifications WHERE user_id = $1 ORDER BY created_at DESC, id LIMIT ${LIST_LIMIT}`, [userId]),
      this.db.query<{ count: string }>('SELECT count(*)::text AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL', [userId]),
    ]);
    return { items, unreadCount: Number(counts[0]?.count ?? 0) };
  }

  async markRead(userId: string, id: string) {
    // Scoped by user_id so nobody can touch another user's notifications.
    const rows = await this.db.query('UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId]);
    if (!rows.length) throw new NotFoundException('Notification not found');
    return { id };
  }

  async markAllRead(userId: string) {
    await this.db.query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [userId]);
    return { success: true };
  }
}
