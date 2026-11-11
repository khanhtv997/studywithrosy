import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import type { AiApiKey, AiKeyTestResult } from '../../shared/types';
import { validate } from '../common/validate';
import { DatabaseService } from '../database/database.service';

/** How long a key rests after running out of quota or being rate limited before it is tried again. */
const QUOTA_COOLDOWN_MS = 15 * 60_000;
/** A rejected key (wrong, revoked, no permission) is skipped for a day or until the admin edits it. */
const INVALID_COOLDOWN_MS = 24 * 60 * 60_000;

const createSchema = z.object({ label: z.string().trim().min(1).max(80), key: z.string().trim().min(20).max(300) });
const updateSchema = z.object({ label: z.string().trim().min(1).max(80).optional(), key: z.string().trim().min(20).max(300).optional(), active: z.boolean().optional() });
const orderSchema = z.object({ ids: z.array(z.string()).min(1) });

export type KeyFailure = 'quota' | 'invalid' | 'other';

/** Sorts a provider error: quota/rate limit and rejected keys are the key's fault, the rest is not. */
export function classifyKeyError(error: unknown): KeyFailure {
  const text = String((error as { message?: string })?.message ?? error);
  const status = Number((error as { status?: number })?.status);
  if (status === 429 || /RESOURCE_EXHAUSTED|quota|rate limit|Too Many Requests/i.test(text)) return 'quota';
  if (status === 401 || status === 403 || /API_KEY_INVALID|API key not valid|PERMISSION_DENIED|API key expired|unregistered callers/i.test(text)) return 'invalid';
  return 'other';
}

interface KeyRow {
  id: string; label: string; provider: 'gemini'; keyEncrypted: string; keyLast4: string; priority: number; active: boolean;
  cooldownUntil: Date | null; lastError: string | null; lastErrorAt: Date | null; lastUsedAt: Date | null; useCount: number; createdAt: Date;
}
export interface UsableKey { id: string; label: string; client: GoogleGenAI; }

const COLUMNS = `id, label, provider, key_encrypted AS "keyEncrypted", key_last4 AS "keyLast4", priority, active,
  cooldown_until AS "cooldownUntil", last_error AS "lastError", last_error_at AS "lastErrorAt",
  last_used_at AS "lastUsedAt", use_count AS "useCount", created_at AS "createdAt"`;

/**
 * Admin-managed AI keys: the database (table ai_api_keys) is the only place keys live; they are
 * added and changed on the "Khoá API AI" screen. Encrypted storage, priority order, cool-down after quota errors.
 */
@Injectable()
export class AiKeysService {
  private readonly logger = new Logger(AiKeysService.name);
  private readonly clients = new Map<string, { secret: string; client: GoogleGenAI }>();

  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  // ---- encryption (AES-256-GCM, key derived from the server secret) ----
  private cipherKey() {
    const secret = process.env.AI_KEYS_SECRET || process.env.AUTH_JWT_SECRET;
    if (!secret) throw new Error('AUTH_JWT_SECRET is required to store AI keys');
    return createHash('sha256').update(`ai-keys:${secret}`).digest();
  }
  private encrypt(plain: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.cipherKey(), iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
  }
  private decrypt(stored: string) {
    const [version, iv, tag, data] = stored.split(':');
    if (version !== 'v1') throw new Error('Unknown key format');
    const decipher = createDecipheriv('aes-256-gcm', this.cipherKey(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  }

  private toPublic(row: KeyRow): AiApiKey {
    const iso = (d: Date | null) => d ? new Date(d).toISOString() : null;
    return { id: row.id, label: row.label, provider: row.provider, keyLast4: row.keyLast4, priority: row.priority, active: row.active,
      cooldownUntil: iso(row.cooldownUntil), lastError: row.lastError, lastErrorAt: iso(row.lastErrorAt), lastUsedAt: iso(row.lastUsedAt),
      useCount: row.useCount, createdAt: new Date(row.createdAt).toISOString() };
  }

  private rows() { return this.db.query<KeyRow>(`SELECT ${COLUMNS} FROM ai_api_keys ORDER BY priority, created_at`); }
  private async require(id: string) {
    const [row] = await this.db.query<KeyRow>(`SELECT ${COLUMNS} FROM ai_api_keys WHERE id = $1`, [id]);
    if (!row) throw new NotFoundException('Không tìm thấy khoá API');
    return row;
  }
  private async insert(label: string, key: string, priority: number) {
    const id = `aikey-${randomUUID()}`;
    await this.db.query(`INSERT INTO ai_api_keys (id, label, key_encrypted, key_last4, priority) VALUES ($1, $2, $3, $4, $5)`,
      [id, label, this.encrypt(key), key.slice(-4), priority]);
    return id;
  }

  // ---- admin API ----
  async list() { return (await this.rows()).map(row => this.toPublic(row)); }

  async create(body: unknown) {
    const data = validate(createSchema, body);
    const [{ next }] = await this.db.query<{ next: number }>('SELECT COALESCE(MAX(priority), 0) + 1 AS next FROM ai_api_keys');
    return this.toPublic(await this.require(await this.insert(data.label, data.key, next)));
  }

  async update(id: string, body: unknown) {
    const data = validate(updateSchema, body);
    const row = await this.require(id);
    // A new key, or turning a key back on, clears its old error and cool-down.
    const reset = data.key !== undefined || (data.active === true && !row.active);
    await this.db.query(`UPDATE ai_api_keys SET label = $1, active = $2,
        key_encrypted = COALESCE($3, key_encrypted), key_last4 = COALESCE($4, key_last4),
        cooldown_until = CASE WHEN $5 THEN NULL ELSE cooldown_until END,
        last_error = CASE WHEN $5 THEN NULL ELSE last_error END,
        updated_at = now() WHERE id = $6`,
      [data.label ?? row.label, data.active ?? row.active, data.key ? this.encrypt(data.key) : null, data.key ? data.key.slice(-4) : null, reset, id]);
    this.clients.delete(id);
    return this.toPublic(await this.require(id));
  }

  async remove(id: string) {
    await this.require(id);
    await this.db.query('DELETE FROM ai_api_keys WHERE id = $1', [id]);
    this.clients.delete(id);
    return { id };
  }

  /** Saves a new priority order: the first id is tried first. */
  async reorder(body: unknown) {
    const { ids } = validate(orderSchema, body);
    const existing = new Set((await this.rows()).map(r => r.id));
    if (ids.length !== existing.size || ids.some(id => !existing.has(id))) throw new BadRequestException('Danh sách khoá không khớp');
    await this.db.transaction(async () => {
      for (const [index, id] of ids.entries()) await this.db.query('UPDATE ai_api_keys SET priority = $1 WHERE id = $2', [index + 1, id]);
    });
    return this.list();
  }

  /** Calls the provider with this key and records the outcome like a real request would. */
  async test(id: string, models: string[]): Promise<AiKeyTestResult> {
    const row = await this.require(id);
    const client = this.clientFor(row);
    let lastError: unknown = null;
    for (const model of models) {
      try {
        const response = await client.models.generateContent({ model, contents: 'Reply with the single word: ok', config: { abortSignal: AbortSignal.timeout(30_000) } });
        if (response.text?.trim()) {
          await this.recordSuccess(id);
          await this.db.query('UPDATE ai_api_keys SET cooldown_until = NULL, last_error = NULL WHERE id = $1', [id]);
          return { ok: true, model, message: 'Khoá hoạt động.' };
        }
      } catch (error) {
        lastError = error;
        const kind = classifyKeyError(error);
        if (kind !== 'other') {
          await this.recordFailure(id, kind, error);
          return { ok: false, message: kind === 'quota' ? 'Khoá đã hết hạn mức hoặc bị giới hạn tốc độ.' : 'Khoá không hợp lệ hoặc không có quyền dùng Gemini.' };
        }
      }
    }
    return { ok: false, message: 'Không gọi được model nào.', detail: shortError(lastError) };
  }

  // ---- used by AiService ----
  private clientFor(row: KeyRow) {
    const cached = this.clients.get(row.id);
    if (cached && cached.secret === row.keyEncrypted) return cached.client;
    const client = new GoogleGenAI({ apiKey: this.decrypt(row.keyEncrypted) });
    this.clients.set(row.id, { secret: row.keyEncrypted, client });
    return client;
  }

  /** Active keys that are not resting, in priority order. */
  async usableKeys(): Promise<UsableKey[]> {
    const now = Date.now();
    const usable: UsableKey[] = [];
    for (const row of await this.rows()) {
      if (!row.active || (row.cooldownUntil && new Date(row.cooldownUntil).getTime() > now)) continue;
      try { usable.push({ id: row.id, label: row.label, client: this.clientFor(row) }); }
      catch { this.logger.warn(`Cannot decrypt AI key ${row.label}; was AUTH_JWT_SECRET changed?`); }
    }
    return usable;
  }

  async recordSuccess(id: string) {
    await this.db.query('UPDATE ai_api_keys SET last_used_at = now(), use_count = use_count + 1 WHERE id = $1', [id]);
  }

  async recordFailure(id: string, kind: Exclude<KeyFailure, 'other'>, error: unknown) {
    const until = new Date(Date.now() + (kind === 'quota' ? QUOTA_COOLDOWN_MS : INVALID_COOLDOWN_MS));
    const message = kind === 'quota' ? `Hết hạn mức / giới hạn tốc độ: ${shortError(error)}` : `Khoá bị từ chối: ${shortError(error)}`;
    await this.db.query('UPDATE ai_api_keys SET cooldown_until = $1, last_error = $2, last_error_at = now() WHERE id = $3', [until, message, id]);
  }
}

function shortError(error: unknown) {
  return String((error as { message?: string })?.message ?? error).replace(/\s+/g, ' ').slice(0, 180);
}
