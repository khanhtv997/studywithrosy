import { z } from 'zod';

export const PAGE_SIZES = [10, 20, 50, 100] as const;

/** page / pageSize / q from a query string; anything else in the schema is added by the caller. */
export const pageFields = {
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().refine(n => (PAGE_SIZES as readonly number[]).includes(n), 'Invalid page size').default(10),
  q: z.string().trim().max(100).optional().transform(v => v || undefined),
};

/** Optional filter from the query string: missing, empty or "all" means no filter. */
export const optionalFilter = z.string().trim().max(200).optional().transform(v => (v && v !== 'all' ? v : undefined));

/** ILIKE pattern for a search term, with %, _ and \ taken literally. */
export const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, m => `\\${m}`)}%`;

/**
 * Collects WHERE conditions with numbered parameters, so values never end up inside the SQL text.
 * `add` receives the placeholder ($n) to put in the condition.
 */
export class SqlFilter {
  private readonly parts: string[] = [];
  readonly values: unknown[] = [];

  param(value: unknown) {
    this.values.push(value);
    return `$${this.values.length}`;
  }

  add(condition: (placeholder: string) => string, value: unknown) {
    this.parts.push(condition(this.param(value)));
    return this;
  }

  raw(condition: string) {
    this.parts.push(condition);
    return this;
  }

  where(...extra: string[]) {
    const all = [...this.parts, ...extra.filter(Boolean)];
    return all.length ? `WHERE ${all.map(p => `(${p})`).join(' AND ')}` : '';
  }

  /** LIMIT/OFFSET for a page, as parameters. */
  limit(page: number, pageSize: number) {
    return `LIMIT ${this.param(pageSize)} OFFSET ${this.param((page - 1) * pageSize)}`;
  }
}

export const toNumber = (value: unknown) => Number(value ?? 0);
export const round1 = (value: unknown) => value === null || value === undefined ? null : Math.round(Number(value) * 10) / 10;
