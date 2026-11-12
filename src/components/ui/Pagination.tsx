import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import type { Page } from '../../types';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { SelectField } from './SelectField';
import { useI18n } from '../../i18n';
import { pageList } from '../../utils/pagination';

const PAGE_SIZES = [10, 20, 50, 100];

export interface PaginationState<T> {
  pageItems: T[];
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
}

/**
 * Client-side paging over an already filtered list.
 * `resetKey` should change whenever the filters change, so the view jumps back to page 1.
 */
export function usePagination<T>(items: T[], resetKey: string, initialPageSize = 10): PaginationState<T> {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => { setPage(1); }, [resetKey]);
  // Deleting or filtering can leave us past the last page.
  const current = Math.min(page, pageCount);
  const start = (current - 1) * pageSize;

  return {
    pageItems: items.slice(start, start + pageSize),
    page: current,
    pageCount,
    pageSize,
    total: items.length,
    setPage: next => setPage(Math.min(Math.max(1, next), pageCount)),
    setPageSize: size => { setPageSizeState(size); setPage(1); },
  };
}

/** The value, updated only after it stops changing for `delay` ms (for search boxes). */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export interface ServerPageState<T, P extends Page<T>> extends PaginationState<T> {
  /** The whole last response (extra fields such as per-tab counts), or null before the first load. */
  data: P | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Paging done by the server: `fetchPage` gets the page, page size and an abort signal and returns one page.
 * `filters` should hold every value the request depends on; a change sends the view back to page 1.
 * Loads again after every app data refresh (an edit, a review...), so the page never goes stale.
 */
export function useServerPage<T, P extends Page<T> = Page<T>>(
  fetchPage: (page: number, pageSize: number, signal: AbortSignal) => Promise<P>,
  filters: unknown[],
  initialPageSize = 10,
): ServerPageState<T, P> {
  const { dataVersion } = useApp();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const [data, setData] = useState<P | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const key = JSON.stringify(filters);
  const lastKey = useRef(key);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;

  useEffect(() => {
    // New filters: start again from page 1 (that change runs this effect once more).
    if (lastKey.current !== key) { lastKey.current = key; if (page !== 1) { setPage(1); return; } }
    const controller = new AbortController();
    setLoading(true);
    fetchRef.current(page, pageSize, controller.signal)
      .then(result => {
        setData(result);
        setError(null);
        // Deleting or filtering elsewhere can leave us past the last page.
        const last = Math.max(1, Math.ceil(result.total / pageSize));
        if (page > last) setPage(last);
      })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [key, page, pageSize, dataVersion, tick]);

  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return {
    pageItems: data?.items ?? [],
    page, pageCount, pageSize, total,
    setPage: next => setPage(Math.min(Math.max(1, next), pageCount)),
    setPageSize: size => { setPageSizeState(size); setPage(1); },
    data, loading, error,
    reload: () => setTick(t => t + 1),
  };
}

interface PaginationProps<T> {
  state: PaginationState<T>;
  /** Noun for the summary line, e.g. "bài nộp". */
  unit?: string;
  /** Page sizes offered; the first one should be the hook's initial size. */
  sizes?: number[];
}

/** Footer under a table: "1–10 trên 45", page size and page buttons. Hidden when there is nothing to page. */
export function Pagination<T>({ state, unit, sizes = PAGE_SIZES }: PaginationProps<T>) {
  const { page, pageCount, pageSize, total, setPage, setPageSize } = state;
  const { t } = useI18n();
  if (total <= sizes[0]) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return <nav className="pager" aria-label={t('Phân trang')}>
    <span className="pager-summary"><strong>{from}–{to}</strong> {t('trên')} <strong>{total}</strong> {unit ?? t('mục')}</span>
    <div className="pager-controls">
      <span className="pager-size">
        {t('Mỗi trang')}
        <SelectField ariaLabel={t('Số dòng mỗi trang')} value={String(pageSize)} onValueChange={v => setPageSize(Number(v))} compact className="w-20"
          options={sizes.map(size => ({ value: String(size), label: String(size) }))} />
      </span>
      <button type="button" className="pager-btn" onClick={() => setPage(page - 1)} disabled={page <= 1} aria-label={t('Trang trước')}><ChevronLeft size={16} aria-hidden="true" /></button>
      {pageList(page, pageCount).map((p, i) => p === 'gap'
        ? <span key={`gap-${i}`} className="pager-gap" aria-hidden="true">…</span>
        : <button key={p} type="button" className={`pager-btn ${p === page ? 'is-current' : ''}`} onClick={() => setPage(p)}
            aria-label={t('Trang {page}', { page: p })} aria-current={p === page ? 'page' : undefined}>{p}</button>)}
      <button type="button" className="pager-btn" onClick={() => setPage(page + 1)} disabled={page >= pageCount} aria-label={t('Trang sau')}><ChevronRight size={16} aria-hidden="true" /></button>
    </div>
  </nav>;
}
