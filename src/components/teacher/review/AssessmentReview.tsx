import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Check, CheckCircle2, Eye, EyeOff, Highlighter, Minus, Plus, StickyNote, Trash2, X } from 'lucide-react';
import { eduApi } from '../../../api/client';
import { formatInfo } from '../../../../shared/exercise-formats';
import type { Assessment, HighlightColor, Question, ReviewAnnotations, ReviewHighlight } from '../../../types';
import { useI18n } from '../../../i18n';
import { addHighlight, segmentsOf, selectionBlocks } from './highlights';
import './review.css';

const COLORS: { value: HighlightColor; label: string }[] = [
  { value: 'yellow', label: 'Vàng' },
  { value: 'green', label: 'Xanh lá' },
  { value: 'pink', label: 'Hồng' },
  { value: 'blue', label: 'Xanh dương' },
];
const SCALE_KEY = 'eduassess_review_scale';
const SAVE_DELAY = 800;

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
interface Toolbar { x: number; y: number; ranges: { block: string; start: number; end: number }[] }
interface Popover { id: string; x: number; y: number }

const readScale = () => { try { return Math.min(1.6, Math.max(0.9, Number(localStorage.getItem(SCALE_KEY)) || 1)); } catch { return 1; } };

/** Consecutive questions sharing a reading passage are shown under it once. */
function groupQuestions(questions: Question[]) {
  const groups: { passage?: string; key: string; questions: Question[] }[] = [];
  for (const q of [...questions].sort((a, b) => a.order - b.order)) {
    const last = groups[groups.length - 1];
    if (q.readingPassage && last?.passage === q.readingPassage) last.questions.push(q);
    else groups.push({ passage: q.readingPassage || undefined, key: q.id, questions: [q] });
  }
  return groups;
}

/**
 * Going through a test with the class: highlight text in the IELTS way, write notes on questions and
 * passages, and reveal answers one by one or all at once. Highlights and notes are saved for this teacher only.
 */
export function AssessmentReview({ assessment, onExit }: { assessment: Assessment; onExit: () => void }) {
  const { t } = useI18n();
  const root = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<ReviewAnnotations>({ highlights: [], notes: {} });
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const dirty = useRef(false);
  const [showAll, setShowAll] = useState(false);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [scale, setScale] = useState(readScale);
  const [toolbar, setToolbar] = useState<Toolbar | null>(null);
  const [popover, setPopover] = useState<Popover | null>(null);
  const [color, setColor] = useState<HighlightColor>('yellow');

  // ---- load and auto-save ----
  useEffect(() => {
    let cancelled = false;
    eduApi.reviewAnnotations(assessment.id)
      .then(result => { if (!cancelled) { setData({ highlights: result.highlights, notes: result.notes }); setLoaded(true); } })
      .catch(cause => { if (!cancelled) { setLoadError(cause instanceof Error ? cause.message : String(cause)); setLoaded(true); } });
    return () => { cancelled = true; };
  }, [assessment.id]);

  useEffect(() => {
    if (!dirty.current) return;
    setSaveState('saving');
    const timer = setTimeout(() => {
      eduApi.saveReviewAnnotations(assessment.id, data)
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'));
    }, SAVE_DELAY);
    return () => clearTimeout(timer);
  }, [data, assessment.id]);

  const update = useCallback((change: (prev: ReviewAnnotations) => ReviewAnnotations) => {
    dirty.current = true;
    setData(change);
  }, []);

  useEffect(() => { try { localStorage.setItem(SCALE_KEY, String(scale)); } catch { /* not kept */ } }, [scale]);

  // ---- selection toolbar ----
  const readSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !root.current) { setToolbar(null); return; }
    const range = selection.getRangeAt(0);
    if (!root.current.contains(range.commonAncestorContainer)) { setToolbar(null); return; }
    const ranges = selectionBlocks(root.current, range);
    if (!ranges.length) { setToolbar(null); return; }
    const rect = range.getBoundingClientRect();
    setPopover(null);
    setToolbar({ x: rect.left + rect.width / 2, y: rect.top, ranges });
  }, []);

  const applyHighlight = (chosen: HighlightColor, withNote = false) => {
    if (!toolbar) return;
    // Built here, not inside a state updater: React may run updaters twice, which would mint different ids.
    let list = data.highlights;
    let lastAdded: ReviewHighlight | null = null;
    for (const r of toolbar.ranges) {
      const result = addHighlight(list, r.block, r.start, r.end, chosen);
      list = result.list;
      lastAdded = result.added;
    }
    update(prev => ({ ...prev, highlights: list }));
    setColor(chosen);
    window.getSelection()?.removeAllRanges();
    const { x, y } = toolbar;
    setToolbar(null);
    // "Ghi chú": open the new highlight's note right away.
    if (withNote && lastAdded) setPopover({ id: (lastAdded as ReviewHighlight).id, x, y });
  };

  // Close the floating panels on Escape, scrolling far, or a click elsewhere.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setToolbar(null); setPopover(null); } };
    const onDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('.review-toolbar, .review-popover, mark.hl')) return;
      setPopover(null);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown); };
  }, []);

  const byBlock = useMemo(() => {
    const map = new Map<string, ReviewHighlight[]>();
    for (const h of data.highlights) map.set(h.block, [...(map.get(h.block) ?? []), h]);
    return map;
  }, [data.highlights]);

  const openHighlight = (id: string, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    setToolbar(null);
    setPopover({ id, x: rect.left + rect.width / 2, y: rect.bottom });
  };

  const text = (block: string, markup: string) =>
    <HighlightedText block={block} markup={markup} highlights={byBlock.get(block) ?? []} onOpen={openHighlight} />;

  const groups = useMemo(() => groupQuestions(assessment.questions), [assessment.questions]);
  const active = popover ? data.highlights.find(h => h.id === popover.id) : undefined;
  const isRevealed = (id: string) => showAll || revealed.has(id);
  const toggleReveal = (id: string) => setRevealed(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const setNote = (key: string, value: string) => update(prev => ({ ...prev, notes: { ...prev.notes, [key]: value } }));
  const highlightCount = data.highlights.length;

  let lastFormat: string | undefined;

  return <div className="review-page">
    <header className="review-bar">
      <button type="button" onClick={onExit} className="btn btn-secondary btn-md"><ArrowLeft size={16} aria-hidden="true" />{t('Thoát')}</button>
      <div className="review-bar-title">
        <span>{t('Chữa đề')}</span>
        <strong title={assessment.title}>{assessment.title}</strong>
      </div>
      <div className="review-bar-actions">
        <span className={`review-save review-save-${saveState}`} role="status" aria-live="polite">
          {saveState === 'saving' ? t('Đang lưu...') : saveState === 'saved' ? t('Đã lưu') : saveState === 'error' ? t('Chưa lưu được') : ''}
        </span>
        <div className="review-zoom" role="group" aria-label={t('Cỡ chữ')}>
          <button type="button" onClick={() => setScale(s => Math.max(0.9, Math.round((s - 0.1) * 10) / 10))} aria-label={t('Thu nhỏ chữ')} title={t('Thu nhỏ chữ')}><Minus size={15} /></button>
          <span>{Math.round(scale * 100)}%</span>
          <button type="button" onClick={() => setScale(s => Math.min(1.6, Math.round((s + 0.1) * 10) / 10))} aria-label={t('Phóng to chữ')} title={t('Phóng to chữ')}><Plus size={15} /></button>
        </div>
        <button type="button" className={`btn btn-md ${showAll ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={showAll}
          onClick={() => { setShowAll(v => !v); setRevealed(new Set()); }}>
          {showAll ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}{showAll ? t('Ẩn tất cả đáp án') : t('Hiện tất cả đáp án')}
        </button>
      </div>
    </header>

    <div className="review-hint">
      <Highlighter size={15} aria-hidden="true" />
      {t('Bôi đen chữ để highlight hoặc ghi chú. Bấm vào chữ đã highlight để đổi màu, ghi chú hoặc xoá.')}
      {highlightCount > 0 && <button type="button" className="review-clear" onClick={() => { if (window.confirm(t('Xoá tất cả {count} highlight?', { count: highlightCount }))) update(prev => ({ ...prev, highlights: [] })); }}>
        {t('Xoá tất cả highlight')}
      </button>}
    </div>

    {loadError && <p role="alert" className="form-error mx-auto mt-4 max-w-4xl">{loadError}</p>}

    <div ref={root} className="review-content" style={{ '--review-scale': scale } as React.CSSProperties}
      onMouseUp={() => setTimeout(readSelection, 0)} onKeyUp={() => setTimeout(readSelection, 0)} onTouchEnd={() => setTimeout(readSelection, 50)}>
      {!loaded ? <p className="review-loading">{t('Đang tải...')}</p> : groups.map(group => <section key={group.key} className="review-group">
        {group.passage && <div className="review-passage">
          <div className="review-passage-label">{t('Đoạn văn')}</div>
          <div className="review-passage-text">{text(`p:${group.key}`, group.passage)}</div>
          <NoteBox value={data.notes[`p:${group.key}`] ?? ''} onChange={value => setNote(`p:${group.key}`, value)} label={t('Ghi chú cho đoạn văn')} />
        </div>}

        {group.questions.map(q => {
          const info = formatInfo(q.format);
          const showFormat = info && info.value !== lastFormat;
          lastFormat = info?.value ?? lastFormat;
          const open = isRevealed(q.id);
          const correctIndex = q.correctAnswer ? q.correctAnswer.trim().toUpperCase().charCodeAt(0) - 65 : -1;
          return <Fragment key={q.id}>
            {showFormat && <div className="review-format"><strong>{t(info!.label)}</strong><span>{t(info!.instruction)}</span></div>}
            <article className="review-question" aria-label={t('Câu {n}', { n: q.order })}>
              <div className="review-question-head">
                <span className="review-number">{q.order}</span>
                <div className="review-question-text">{text(`q:${q.id}:text`, q.text)}</div>
              </div>

              {q.options && q.options.length > 0 && <ol className="review-options">
                {q.options.map((option, i) => <li key={i} className={open && i === correctIndex ? 'is-correct' : ''}>
                  {text(`q:${q.id}:opt:${i}`, option)}
                  {open && i === correctIndex && <CheckCircle2 size={18} className="review-correct-icon" aria-label={t('Đáp án đúng')} />}
                </li>)}
              </ol>}

              {open && <div className="review-answer">
                {!(q.options && q.options.length) && <p><strong>{q.type === 'essay' ? t('Gợi ý / bài mẫu') : t('Đáp án:')}</strong>{' '}
                  {q.type === 'true_false' ? (q.correctAnswer === 'T' ? t('Đúng (True)') : t('Sai (False)')) : q.correctAnswer || '—'}</p>}
                {q.explanation && <p><strong>{t('Giải thích:')}</strong> {q.explanation}</p>}
                {q.grammarTopic && <p className="review-topic">{t(q.grammarTopic)}</p>}
              </div>}

              <div className="review-question-actions">
                {!showAll && <button type="button" className={`review-chip ${open ? 'is-on' : ''}`} onClick={() => toggleReveal(q.id)} aria-pressed={open}>
                  {open ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}{open ? t('Ẩn đáp án') : t('Hiện đáp án')}
                </button>}
              </div>
              <NoteBox value={data.notes[`q:${q.id}`] ?? ''} onChange={value => setNote(`q:${q.id}`, value)} label={t('Ghi chú cho câu {n}', { n: q.order })} />
            </article>
          </Fragment>;
        })}
      </section>)}
    </div>

    {toolbar && <div className="review-toolbar" style={{ left: toolbar.x, top: toolbar.y }} role="toolbar" aria-label={t('Highlight phần đã chọn')}
      onMouseDown={event => event.preventDefault()}>
      {COLORS.map(c => <button key={c.value} type="button" className={`review-swatch hl-${c.value} ${c.value === color ? 'is-current' : ''}`}
        onClick={() => applyHighlight(c.value)} aria-label={t('Highlight màu {color}', { color: t(c.label) })} title={t(c.label)} />)}
      <span className="review-toolbar-sep" aria-hidden="true" />
      <button type="button" className="review-tool" onClick={() => applyHighlight(color, true)}><StickyNote size={15} aria-hidden="true" />{t('Ghi chú')}</button>
    </div>}

    {popover && active && <HighlightPopover key={active.id} highlight={active} x={popover.x} y={popover.y}
      onColor={value => update(prev => ({ ...prev, highlights: prev.highlights.map(h => h.id === active.id ? { ...h, color: value } : h) }))}
      onNote={value => update(prev => ({ ...prev, highlights: prev.highlights.map(h => h.id === active.id ? { ...h, note: value || undefined } : h) }))}
      onDelete={() => { update(prev => ({ ...prev, highlights: prev.highlights.filter(h => h.id !== active.id) })); setPopover(null); }}
      onClose={() => setPopover(null)} />}
  </div>;
}

/** A block of text with its highlights; the wrapper's text is exactly the block's plain text (offsets rely on it). */
function HighlightedText({ block, markup, highlights, onOpen }: { block: string; markup: string; highlights: ReviewHighlight[]; onOpen: (id: string, el: HTMLElement) => void }) {
  const segments = segmentsOf(markup, highlights);
  // The note marker goes on the last piece of each highlight only.
  const lastPiece = new Map<string, number>();
  segments.forEach((s, i) => { if (s.highlight) lastPiece.set(s.highlight.id, i); });
  return <span data-block={block} className="review-text">
    {segments.map((s, i) => {
      const body: ReactNode = s.underline ? <u>{s.text}</u> : s.text;
      if (!s.highlight) return <Fragment key={i}>{body}</Fragment>;
      const h = s.highlight;
      const noted = !!h.note && lastPiece.get(h.id) === i;
      return <mark key={i} className={`hl hl-${h.color} ${noted ? 'has-note' : ''}`} data-hl={h.id} title={h.note || undefined}
        tabIndex={lastPiece.get(h.id) === i ? 0 : -1}
        onClick={event => { if (window.getSelection()?.isCollapsed !== false) onOpen(h.id, event.currentTarget); }}
        onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(h.id, event.currentTarget); } }}>{body}</mark>;
    })}
  </span>;
}

function HighlightPopover({ highlight, x, y, onColor, onNote, onDelete, onClose }: {
  highlight: ReviewHighlight; x: number; y: number;
  onColor: (c: HighlightColor) => void; onNote: (note: string) => void; onDelete: () => void; onClose: () => void;
}) {
  const { t } = useI18n();
  const [note, setNoteText] = useState(highlight.note ?? '');
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { area.current?.focus(); }, []);
  // Keep the panel on screen.
  const left = Math.min(Math.max(x, 170), window.innerWidth - 170);
  const top = Math.min(y + 8, window.innerHeight - 260);
  return <div className="review-popover" style={{ left, top }} role="dialog" aria-label={t('Highlight')}>
    <div className="review-popover-head">
      <div className="review-popover-colors">
        {COLORS.map(c => <button key={c.value} type="button" className={`review-swatch hl-${c.value} ${c.value === highlight.color ? 'is-current' : ''}`}
          onClick={() => onColor(c.value)} aria-label={t('Đổi sang màu {color}', { color: t(c.label) })} aria-pressed={c.value === highlight.color} title={t(c.label)} />)}
      </div>
      <button type="button" className="icon-btn" onClick={onClose} aria-label={t('Đóng')}><X size={15} /></button>
    </div>
    <label className="review-popover-label">{t('Ghi chú')}
      <textarea ref={area} rows={3} value={note} placeholder={t('Ví dụ: từ khoá, mẹo loại trừ, cấu trúc cần nhớ...')}
        onChange={e => setNoteText(e.target.value)} onBlur={() => onNote(note.trim())} />
    </label>
    <div className="review-popover-actions">
      <button type="button" className="review-tool review-tool-danger" onClick={onDelete}><Trash2 size={14} aria-hidden="true" />{t('Xoá highlight')}</button>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => { onNote(note.trim()); onClose(); }}><Check size={14} aria-hidden="true" />{t('Xong')}</button>
    </div>
  </div>;
}

/** A sticky note under a question or passage: shown when it has text, edited in place. */
function NoteBox({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);
  const save = () => { onChange(draft.trim()); setEditing(false); };

  if (editing) return <div className="review-note is-editing">
    <textarea autoFocus rows={3} aria-label={label} value={draft} placeholder={t('Ghi chú để giảng cho lớp...')} onChange={e => setDraft(e.target.value)}
      onKeyDown={e => { if (e.key === 'Escape') { setDraft(value); setEditing(false); } if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save(); }} />
    <div className="review-note-actions">
      {value && <button type="button" className="review-tool review-tool-danger" onClick={() => { onChange(''); setEditing(false); }}><Trash2 size={14} aria-hidden="true" />{t('Xoá')}</button>}
      <button type="button" className="review-tool" onClick={() => { setDraft(value); setEditing(false); }}>{t('Huỷ')}</button>
      <button type="button" className="btn btn-primary btn-sm" onClick={save}><Check size={14} aria-hidden="true" />{t('Lưu ghi chú')}</button>
    </div>
  </div>;
  if (value) return <button type="button" className="review-note" onClick={() => setEditing(true)} aria-label={`${label}: ${value}`}>
    <StickyNote size={15} aria-hidden="true" /><span>{value}</span>
  </button>;
  return <button type="button" className="review-chip review-add-note" onClick={() => setEditing(true)}><StickyNote size={14} aria-hidden="true" />{label}</button>;
}
