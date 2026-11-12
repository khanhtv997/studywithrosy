import { AsyncLocalStorage } from 'node:async_hooks';
import { BadRequestException, ConflictException, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import pg, { type PoolClient, type QueryResultRow } from 'pg';
import { hash } from 'bcryptjs';
import { INITIAL_ASSESSMENTS, INITIAL_CLASSES, INITIAL_STUDENTS, INITIAL_SUBMISSIONS } from './seed-data';

export type Table = 'classes' | 'students' | 'assessments' | 'submissions';

/** Columns kept next to the JSON document so they can be indexed and constrained. */
const INDEXED_COLUMNS: Record<Table, string[]> = {
  classes: ['code'], students: ['class_id', 'code'],
  assessments: ['owner_id'], submissions: ['assessment_id', 'student_id'],
};

const migrations = [
  `CREATE TABLE classes (
    id text PRIMARY KEY, code text NOT NULL UNIQUE, data jsonb NOT NULL,
    sort_order bigint GENERATED ALWAYS AS IDENTITY
  );
  CREATE TABLE students (
    id text PRIMARY KEY, class_id text NOT NULL REFERENCES classes(id),
    code text NOT NULL UNIQUE, data jsonb NOT NULL,
    sort_order bigint GENERATED ALWAYS AS IDENTITY
  );
  CREATE TABLE assessments (
    id text PRIMARY KEY, class_id text NOT NULL REFERENCES classes(id),
    data jsonb NOT NULL, sort_order bigint GENERATED ALWAYS AS IDENTITY
  );
  CREATE TABLE submissions (
    id text PRIMARY KEY,
    assessment_id text NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    student_id text NOT NULL REFERENCES students(id),
    data jsonb NOT NULL, sort_order bigint GENERATED ALWAYS AS IDENTITY,
    UNIQUE (assessment_id, student_id)
  );
  CREATE INDEX idx_students_class ON students(class_id);
  CREATE INDEX idx_assessments_class ON assessments(class_id);
  CREATE INDEX idx_submissions_assessment ON submissions(assessment_id);`,
  `CREATE TABLE users (
    id text PRIMARY KEY,
    email text NOT NULL UNIQUE,
    name text NOT NULL,
    role text NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
    password_hash text NOT NULL,
    student_id text UNIQUE REFERENCES students(id) ON DELETE SET NULL,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX idx_users_role ON users(role);`,
  `CREATE TABLE notifications (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type text NOT NULL,
    title text NOT NULL,
    body text NOT NULL DEFAULT '',
    link text,
    read_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);`,
  // Set for accounts that got a password from someone else (Excel import, admin reset): the owner must pick a new one.
  `ALTER TABLE users ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;`,
  // AI provider keys, tried in priority order; the key itself is stored encrypted (see AiKeysService).
  `CREATE TABLE ai_api_keys (
    id text PRIMARY KEY,
    label text NOT NULL,
    provider text NOT NULL DEFAULT 'gemini',
    key_encrypted text NOT NULL,
    key_last4 text NOT NULL,
    priority integer NOT NULL,
    active boolean NOT NULL DEFAULT true,
    cooldown_until timestamptz,
    last_error text,
    last_error_at timestamptz,
    last_used_at timestamptz,
    use_count integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );`,
  // Teacher ownership and sharing. An assessment can go to several classes (data.classIds), has an owner,
  // can be shared with other teachers directly (assessment_shares) or by link (share_token).
  // Existing classes go to every current teacher so nobody loses access; an admin can narrow it down later.
  `UPDATE assessments SET data = (data - 'classId' - 'className') || jsonb_build_object('classIds', jsonb_build_array(class_id));
  ALTER TABLE assessments DROP COLUMN class_id;
  ALTER TABLE assessments ADD COLUMN owner_id text REFERENCES users(id) ON DELETE SET NULL;
  ALTER TABLE assessments ADD COLUMN share_token text UNIQUE;
  CREATE INDEX idx_assessments_class_ids ON assessments USING gin ((data->'classIds'));
  CREATE INDEX idx_assessments_owner ON assessments(owner_id);
  CREATE TABLE assessment_shares (
    assessment_id text NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shared_by text REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (assessment_id, user_id)
  );
  CREATE INDEX idx_assessment_shares_user ON assessment_shares(user_id, created_at DESC);
  UPDATE classes SET data = data || jsonb_build_object('teacherIds',
    COALESCE((SELECT jsonb_agg(id ORDER BY created_at) FROM users WHERE role = 'teacher'), '[]'::jsonb));
  CREATE INDEX idx_classes_teacher_ids ON classes USING gin ((data->'teacherIds'));`,
  // Saved AI review suggestions per assessment (and class, or all classes when class_id is null), kept as history.
  `CREATE TABLE ai_suggestions (
    id text PRIMARY KEY,
    assessment_id text NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    class_id text REFERENCES classes(id) ON DELETE CASCADE,
    content text NOT NULL,
    submitted integer NOT NULL DEFAULT 0,
    avg_score numeric,
    created_by text REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX idx_ai_suggestions_assessment ON ai_suggestions(assessment_id, created_at DESC);`,
  // A teacher's highlights and notes on an assessment (the review screen); private to that teacher.
  `CREATE TABLE review_annotations (
    assessment_id text NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    data jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (assessment_id, user_id)
  );`,
  // Google sign-in: the Google account an EduPath user is linked to, and an admin approval step
  // for accounts that sign up by themselves. Existing accounts are approved.
  `ALTER TABLE users ADD COLUMN google_sub text UNIQUE;
  ALTER TABLE users ADD COLUMN avatar_url text;
  ALTER TABLE users ADD COLUMN approval text NOT NULL DEFAULT 'approved' CHECK (approval IN ('pending', 'approved', 'rejected'));
  CREATE INDEX idx_users_approval ON users(approval) WHERE approval <> 'approved';`,
];

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly pool: pg.Pool;
  private readonly transactionContext = new AsyncLocalStorage<PoolClient>();

  constructor() {
    const schema = process.env.DATABASE_SCHEMA;
    if (schema && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) throw new Error('Invalid DATABASE_SCHEMA');
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is required. Set it in .env to your local PostgreSQL connection.');
    this.pool = new pg.Pool({
      connectionString,
      connectionTimeoutMillis: 5000,
      options: schema ? `-c search_path=${schema}` : undefined,
    });
    this.pool.on('error', error => console.error('PostgreSQL idle connection error:', error));
  }

  async onModuleInit() { await this.initialize(); }
  async onModuleDestroy() { await this.pool.end(); }

  async initialize(seedDemo = process.env.SEED_DEMO_DATA !== 'false') {
    await this.transaction(async () => {
      await this.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['eduassess-schema']);
      await this.query('CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
      const rows = await this.query<{ version: number }>('SELECT version FROM schema_migrations');
      const applied = new Set(rows.map(row => row.version));
      for (const [index, sql] of migrations.entries()) {
        const version = index + 1;
        if (applied.has(version)) continue;
        await this.query(sql);
        await this.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
      }
    });
    if (seedDemo) await this.seed();
    await this.ensureAdmin();
  }

  /** A fresh database without demo data still needs someone who can sign in: create "admin". */
  private async ensureAdmin() {
    await this.transaction(async () => {
      await this.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['eduassess-admin']);
      if ((await this.query('SELECT 1 FROM users LIMIT 1')).length) return;
      const password = process.env.SEED_ADMIN_PASSWORD || 'Admin@123';
      await this.query(`INSERT INTO users (id, email, name, role, password_hash) VALUES ('user-admin', 'admin', 'Quản trị', 'admin', $1)`, [await hash(password, 10)]);
      console.log('Created the first account: login "admin" with SEED_ADMIN_PASSWORD (default Admin@123). Change it after signing in.');
    });
  }

  private async seed() {
    await this.transaction(async () => {
      await this.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['eduassess-seed']);
      const rows = await this.query('SELECT 1 FROM classes LIMIT 1');
      if (!rows.length) {
        for (const item of INITIAL_CLASSES) await this.repository('classes').insert(item);
        for (const item of INITIAL_STUDENTS) await this.repository('students').insert(item);
        for (const item of INITIAL_ASSESSMENTS) await this.repository('assessments').insert(item);
        for (const item of INITIAL_SUBMISSIONS) await this.repository('submissions').insert(item);
      }
      await this.seedUsers();
    });
  }

  private async seedUsers() {
    const rows = await this.query('SELECT 1 FROM users LIMIT 1');
    if (rows.length) return;
    const accounts: { id: string; email: string; name: string; role: string; studentId: string | null; password: string }[] = [
      { id: 'user-admin-demo', email: 'admin@eduassess.local', name: 'Quản trị hệ thống', role: 'admin', studentId: null, password: process.env.SEED_ADMIN_PASSWORD || 'Admin@123456' },
      { id: 'user-teacher-demo', email: 'teacher@eduassess.local', name: 'Giáo viên mẫu', role: 'teacher', studentId: null, password: process.env.SEED_TEACHER_PASSWORD || 'Teacher@123456' },
    ];
    const students = await this.repository<{ id: string; name: string; email: string }>('students').all();
    for (const student of students) accounts.push({ id: `user-${student.id}`, email: student.email, name: student.name, role: 'student', studentId: student.id, password: process.env.SEED_STUDENT_PASSWORD || 'Student@123456' });
    for (const account of accounts) {
      await this.query(`INSERT INTO users (id, email, name, role, password_hash, student_id)
        VALUES ($1, $2, $3, $4, $5, $6)`,
        [account.id, account.email.toLowerCase(), account.name, account.role, await hash(account.password, 10), account.studentId]);
    }
  }

  async query<T extends QueryResultRow = QueryResultRow>(sql: string, values: unknown[] = []): Promise<T[]> {
    try {
      const executor = this.transactionContext.getStore() || this.pool;
      return (await executor.query<T>(sql, values)).rows;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === '23505') throw new ConflictException('Record already exists');
      if (code === '23503') throw new BadRequestException('Referenced record does not exist');
      throw error;
    }
  }

  async transaction<T>(action: () => Promise<T>): Promise<T> {
    if (this.transactionContext.getStore()) return action();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await this.transactionContext.run(client, action);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  repository<T extends { id: string }>(table: Table): EntityRepository<T> {
    return new EntityRepository<T>(this, table);
  }
}

export class EntityRepository<T extends { id: string }> {
  constructor(private readonly db: DatabaseService, private readonly table: Table) {}

  /** Rows matching a raw WHERE clause; callers pass values as parameters, never inline. */
  async whereSql(clause: string, values: unknown[]): Promise<T[]> {
    const rows = await this.db.query<{ data: T }>(`SELECT data FROM ${this.table} WHERE ${clause} ORDER BY sort_order`, values);
    return rows.map(row => row.data);
  }

  async all(): Promise<T[]> {
    const rows = await this.db.query<{ data: T }>(`SELECT data FROM ${this.table} ORDER BY sort_order`);
    return rows.map(row => row.data);
  }

  async find(id: string): Promise<T | undefined> {
    const rows = await this.db.query<{ data: T }>(`SELECT data FROM ${this.table} WHERE id = $1`, [id]);
    return rows[0]?.data;
  }

  /** Filters on indexed columns. Column names come from a fixed list, never from user input. */
  async where(filter: Partial<Record<string, string>>): Promise<T[]> {
    const entries = Object.entries(filter).filter((entry): entry is [string, string] => entry[1] !== undefined);
    for (const [column] of entries) {
      if (!INDEXED_COLUMNS[this.table].includes(column)) throw new Error(`Column ${column} cannot be filtered on ${this.table}`);
    }
    const clause = entries.map(([column], i) => `${column} = $${i + 1}`).join(' AND ');
    const rows = await this.db.query<{ data: T }>(
      `SELECT data FROM ${this.table}${clause ? ` WHERE ${clause}` : ''} ORDER BY sort_order`, entries.map(([, value]) => value));
    return rows.map(row => row.data);
  }

  private values(item: T): [string[], unknown[]] {
    const columns = INDEXED_COLUMNS;
    const values: Record<Table, unknown[]> = {
      classes: [(item as any).code],
      students: [(item as any).classId, (item as any).code],
      assessments: [(item as any).ownerId ?? null],
      submissions: [(item as any).assessmentId, (item as any).studentId],
    };
    return [columns[this.table], values[this.table]];
  }

  async insert(item: T): Promise<void> {
    const [columns, values] = this.values(item);
    const allValues = [item.id, ...values, JSON.stringify(item)];
    const parameters = allValues.map((_, i) => `$${i + 1}`);
    parameters[parameters.length - 1] += '::jsonb';
    await this.db.query(`INSERT INTO ${this.table} (id, ${columns.join(', ')}, data) VALUES (${parameters.join(', ')})`, allValues);
  }

  async upsert(item: T): Promise<void> {
    const [columns, values] = this.values(item);
    const allValues = [item.id, ...values, JSON.stringify(item)];
    const parameters = allValues.map((_, i) => `$${i + 1}`);
    parameters[parameters.length - 1] += '::jsonb';
    const update = [...columns, 'data'].map(column => `${column} = EXCLUDED.${column}`).join(', ');
    await this.db.query(`INSERT INTO ${this.table} (id, ${columns.join(', ')}, data) VALUES (${parameters.join(', ')}) ON CONFLICT (id) DO UPDATE SET ${update}`, allValues);
  }

  async update(item: T): Promise<void> {
    await this.db.query(`UPDATE ${this.table} SET data = $1::jsonb WHERE id = $2`, [JSON.stringify(item), item.id]);
  }

  async delete(id: string): Promise<void> {
    await this.db.query(`DELETE FROM ${this.table} WHERE id = $1`, [id]);
  }
}
