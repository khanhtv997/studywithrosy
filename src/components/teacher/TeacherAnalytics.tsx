import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { AlertTriangle, BarChart3, BookOpen, ChevronDown, ChevronUp, ClipboardList, Clock, FileText, History, RefreshCw, School, Sparkles, Trash2, TrendingUp, Users } from 'lucide-react';
import { eduApi } from '../../api/client';
import { useApp } from '../../context/AppContext';
import type { AiSuggestion, AssessmentAnalytics, ClassAnalytics, ClassAssessmentRow, ClassResult } from '../../types';
import { PageHeader, StatCard } from '../ui/PageHeader';
import { Pagination, useServerPage } from '../ui/Pagination';
import { Markdown } from '../ui/Markdown';
import { RichText } from '../ui/RichText';
import { SelectField } from '../ui/SelectField';
import { Tabs } from '../ui/Tabs';
import { useI18n } from '../../i18n';

type View = 'assessment' | 'class';

const scoreText = (score: number | null) => score === null ? '—' : `${score} / 10`;
const toneOf = (rate: number) => rate >= 50 ? 'bg-rose-500' : rate > 20 ? 'bg-amber-500' : 'bg-emerald-500';

/** A thin horizontal bar for a percentage. */
function Meter({ value, tone }: { value: number; tone: string }) {
  return <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
    <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
  </div>;
}

/**
 * Results by assessment (questions students got wrong, weak topics, comparison between classes)
 * or by class (every assessment of the class). Numbers come from the server; the choice lives in the URL.
 */
export function TeacherAnalytics() {
  const { assessments, classes } = useApp();
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();

  const view: View = params.get('view') === 'class' ? 'class' : 'assessment';
  const requestedClass = params.get('class') || 'all';
  const classId = requestedClass === 'all' || classes.some(c => c.id === requestedClass) ? requestedClass : 'all';
  const assessmentOptions = assessments.filter(a => a.status !== 'draft' && (classId === 'all' || a.classIds.includes(classId)));
  const requestedAssessment = params.get('assessment') || '';
  const assessmentId = assessmentOptions.some(a => a.id === requestedAssessment) ? requestedAssessment : assessmentOptions[0]?.id || '';
  // The class view needs one class; default to the first.
  const classForView = classId === 'all' ? classes[0]?.id || '' : classId;

  const update = (next: Partial<Record<'view' | 'class' | 'assessment', string>>) => {
    const merged = { view, class: classId, assessment: assessmentId, ...next };
    const search: Record<string, string> = {};
    if (merged.view === 'class') search.view = 'class';
    if (merged.class && merged.class !== 'all') search.class = merged.class;
    if (merged.assessment && merged.view === 'assessment') search.assessment = merged.assessment;
    setParams(search, { replace: true });
  };

  return <div className="page-stack">
    <PageHeader icon={BarChart3} title={t('Phân tích kết quả')}
      description={t('Xem kết quả theo từng đề hoặc theo từng lớp: câu nhiều học sinh làm sai, chủ điểm cần ôn và mức độ hoàn thành.')} />

    <section className="panel">
      <div className="panel-toolbar">
        <Tabs ariaLabel={t('Cách xem')} value={view} onChange={value => update({ view: value })} options={[
          { value: 'assessment', label: t('Theo đề') },
          { value: 'class', label: t('Theo lớp') },
        ]} />
        <div className="toolbar-controls">
          <SelectField ariaLabel={t('Lọc theo lớp')} compact className="w-full sm:w-56"
            value={view === 'class' ? classForView : classId}
            onValueChange={value => update({ class: value })}
            options={[...(view === 'assessment' ? [{ value: 'all', label: t('Tất cả các lớp') }] : []), ...classes.map(c => ({ value: c.id, label: c.name }))]} />
          {view === 'assessment' && <SelectField ariaLabel={t('Chọn đề thi')} compact className="w-full sm:w-80" placeholder={t('Chọn đề thi')}
            value={assessmentId} onValueChange={value => update({ assessment: value })}
            options={assessmentOptions.map(a => ({ value: a.id, label: a.title }))} />}
        </div>
      </div>
    </section>

    {view === 'assessment'
      ? assessmentId
        ? <AssessmentView assessmentId={assessmentId} classId={classId === 'all' ? undefined : classId} onPickClass={id => update({ class: id })} />
        : <Empty text={t('Chưa có đề nào đã giao cho lớp này.')} />
      : classForView
        ? <ClassView classId={classForView} onOpenAssessment={id => update({ view: 'assessment', assessment: id, class: classForView })} />
        : <Empty text={t('Bạn chưa phụ trách lớp nào.')} />}
  </div>;
}

function Empty({ text }: { text: string }) {
  return <div className="empty-state panel"><BarChart3 size={32} aria-hidden="true" /><strong>{text}</strong></div>;
}

/* ---------------- By assessment ---------------- */

function AssessmentView({ assessmentId, classId, onPickClass }: { assessmentId: string; classId?: string; onPickClass: (id: string) => void }) {
  const { dataVersion } = useApp();
  const { t } = useI18n();
  const [data, setData] = useState<AssessmentAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    eduApi.assessmentAnalytics(assessmentId, classId, controller.signal)
      .then(setData)
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => controller.abort();
  }, [assessmentId, classId, dataVersion]);
  useEffect(() => { setExpanded(null); }, [assessmentId, classId]);

  if (error) return <div className="empty-state panel"><AlertTriangle size={28} aria-hidden="true" /><span role="alert">{error}</span></div>;
  if (!data || data.assessment.id !== assessmentId) return <div className="empty-state panel"><span>{t('Đang tải...')}</span></div>;

  const { totals, byClass, items, gaps } = data;
  const hardQuestions = items.filter(q => q.errorRate >= 50).length;

  return <>
    <div className="stat-grid">
      <StatCard icon={Users} label={t('Bài đã nộp')} value={`${totals.submitted} / ${totals.students}`} />
      <StatCard icon={TrendingUp} label={t('Điểm trung bình')} value={scoreText(totals.avgScore)} tone="emerald" />
      <StatCard icon={ClipboardList} label={t('Tỷ lệ nộp bài')} value={`${totals.completionRate}%`} tone="amber" />
      <StatCard icon={AlertTriangle} label={t('Câu sai từ 50% trở lên')} value={hardQuestions} tone="rose" />
    </div>

    {byClass.length > 0 && <ClassComparison rows={byClass} activeClassId={classId} onPick={onPickClass} />}

    <SuggestionPanel assessmentId={assessmentId} classId={classId} submitted={totals.submitted} avgScore={totals.avgScore} />

    <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
      <section className="panel flex min-h-0 flex-col xl:col-span-2">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-5">
          <div>
            <h2 className="text-base font-bold text-slate-900">{t('Câu hỏi học sinh thường làm sai')}</h2>
            <p className="mt-0.5 text-xs text-slate-600">{t('Bao nhiêu bạn làm sai câu đó, tỷ lệ sai %, và phương án bẫy được chọn nhiều nhất')}</p>
          </div>
          <span className="shrink-0 rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">{t('{count} câu hỏi', { count: items.length })}</span>
        </div>
        <div className="analytics-scroll divide-y divide-slate-100" tabIndex={0} aria-label={t('Câu hỏi học sinh thường làm sai')}>
          {items.length === 0 ? <p className="p-5 text-sm text-slate-500">{t('Chưa có bài nộp để phân tích.')}</p> : items.map(item => {
            const open = expanded === item.questionId;
            const high = item.errorRate >= 50;
            return <div key={item.questionId} className="p-4">
              <button type="button" aria-expanded={open} onClick={() => setExpanded(open ? null : item.questionId)} className="flex w-full items-start justify-between gap-4 text-left">
                <span className="flex min-w-0 items-start gap-3">
                  <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold text-white ${high ? 'bg-rose-500' : 'bg-indigo-600'}`}>{item.order}</span>
                  <span className="min-w-0">
                    <span className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700">{t(item.grammarTopic)}</span>
                      <span className="text-xs text-slate-600">{t('Đáp án chuẩn:')} <strong className="text-emerald-700">{item.correctAnswer}</strong></span>
                    </span>
                    <span className="line-clamp-2 block text-sm text-slate-800"><RichText text={item.text} /></span>
                  </span>
                </span>
                <span className="w-32 shrink-0 text-right">
                  <span className="flex items-center justify-end gap-1.5">
                    <span className={`text-xs font-bold ${high ? 'text-rose-600' : 'text-slate-700'}`}>{t('{wrong} / {total} bạn sai ({rate}%)', { wrong: item.incorrectCount, total: item.totalAttempts, rate: item.errorRate })}</span>
                    {open ? <ChevronUp size={16} className="text-slate-500" aria-hidden="true" /> : <ChevronDown size={16} className="text-slate-500" aria-hidden="true" />}
                  </span>
                  <span className="mt-1.5 block"><Meter value={item.errorRate} tone={toneOf(item.errorRate)} /></span>
                </span>
              </button>
              {open && <div className="mt-3 space-y-3 border-t border-slate-100 pt-3 pl-10 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-950">
                  <span><strong>{t('Phương án bẫy học sinh chọn nhầm nhiều nhất:')} </strong>
                    {item.mostCommonDistractor
                      ? <span className="ml-1 rounded-md border border-amber-300 bg-white px-2 py-0.5 font-bold text-rose-600">{t('Phương án {option}', { option: t(item.mostCommonDistractor) })}</span>
                      : t('Không có')}
                  </span>
                  <span className="text-[11px] text-amber-800">{t('(Chiếm {count} lượt chọn)', { count: item.distractorCounts[item.mostCommonDistractor || ''] || 0 })}</span>
                </div>
                <div>
                  <div className="mb-1.5 font-bold text-slate-700">{t('Danh sách học sinh làm sai ({count} bạn):', { count: item.wrongStudents.length })}</div>
                  {item.wrongStudents.length === 0
                    ? <span className="font-medium text-emerald-600">{t('Toàn bộ học sinh đều trả lời chính xác câu này!')}</span>
                    : <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">
                      {item.wrongStudents.map((ws, i) => <span key={i} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 font-medium text-rose-900">
                        {ws.name}<span className="rounded bg-rose-200 px-1 text-[10px] font-bold">{t('chọn {answer}', { answer: t(ws.answer) })}</span>
                      </span>)}
                    </div>}
                </div>
              </div>}
            </div>;
          })}
        </div>
      </section>

      <section className="panel flex min-h-0 flex-col">
        <div className="border-b border-slate-100 p-5">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><BookOpen size={18} className="text-indigo-600" aria-hidden="true" />{t('Chủ điểm Ngữ pháp hay mắc lỗi')}</h2>
          <p className="mt-0.5 text-xs text-slate-600">{t('Tổng hợp theo độ chính xác từ thấp đến cao')}</p>
        </div>
        <div className="analytics-scroll space-y-3 p-5" tabIndex={0} aria-label={t('Chủ điểm Ngữ pháp hay mắc lỗi')}>
          {gaps.length === 0 ? <p className="text-sm text-slate-500">{t('Chưa có bài nộp để phân tích.')}</p> : gaps.map(gap => {
            const badge = gap.status === 'weak' ? 'border-rose-200 bg-rose-100 text-rose-800' : gap.status === 'moderate' ? 'border-amber-200 bg-amber-100 text-amber-800' : 'border-emerald-200 bg-emerald-100 text-emerald-800';
            return <div key={gap.topic} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-bold text-slate-900">{t(gap.topic)}</span>
                <span className={`shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold ${badge}`}>{t('{rate}% chính xác', { rate: gap.accuracyRate })}</span>
              </div>
              <Meter value={gap.accuracyRate} tone={gap.accuracyRate >= 80 ? 'bg-emerald-500' : gap.accuracyRate >= 60 ? 'bg-amber-500' : 'bg-rose-500'} />
              <p className="text-[11px] leading-relaxed text-slate-700">{t(gap.recommendation, { rate: 100 - gap.accuracyRate })}</p>
            </div>;
          })}
        </div>
      </section>
    </div>
  </>;
}

/** The assessment's results side by side for each class it was given to. */
function ClassComparison({ rows, activeClassId, onPick }: { rows: ClassResult[]; activeClassId?: string; onPick: (id: string) => void }) {
  const { t } = useI18n();
  return <section className="panel">
    <div className="panel-toolbar">
      <h2 className="panel-title"><School size={18} className="text-indigo-600" aria-hidden="true" />{t('Kết quả theo lớp')}<span className="count-pill">{rows.length}</span></h2>
    </div>
    <div className="analytics-scroll-sm overflow-x-auto">
      <table className="data-table min-w-[640px]">
        <thead><tr>
          <th>{t('Lớp')}</th><th className="text-center">{t('Sĩ số')}</th><th className="text-center">{t('Đã nộp')}</th>
          <th className="text-center">{t('Đã duyệt')}</th><th className="w-48">{t('Tỷ lệ nộp bài')}</th><th className="text-center">{t('Điểm TB')}</th>
        </tr></thead>
        <tbody>
          {rows.map(row => <tr key={row.classId} className={row.classId === activeClassId ? 'bg-indigo-50/60' : ''}>
            <td><button type="button" className="font-bold text-slate-900 hover:text-indigo-700 hover:underline" onClick={() => onPick(row.classId)}>{row.className}</button></td>
            <td className="text-center">{row.students}</td>
            <td className="text-center font-semibold">{row.submitted}</td>
            <td className="text-center">{row.reviewed}</td>
            <td><div className="flex items-center gap-2"><Meter value={row.completionRate} tone="bg-indigo-500" /><span className="w-10 text-right text-xs font-semibold text-slate-600">{row.completionRate}%</span></div></td>
            <td className="text-center font-bold text-slate-800">{scoreText(row.avgScore)}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </section>;
}

/* ---------------- By class ---------------- */

function ClassView({ classId, onOpenAssessment }: { classId: string; onOpenAssessment: (id: string) => void }) {
  const { t, locale } = useI18n();
  const pager = useServerPage<ClassAssessmentRow, ClassAnalytics>(
    (page, pageSize, signal) => eduApi.classAnalytics(classId, { page, pageSize }, signal), [classId]);
  const data = pager.data;

  if (pager.error) return <div className="empty-state panel"><AlertTriangle size={28} aria-hidden="true" /><span role="alert">{pager.error}</span></div>;
  if (!data || data.classId !== classId) return <div className="empty-state panel"><span>{t('Đang tải...')}</span></div>;

  return <>
    <div className="stat-grid">
      <StatCard icon={Users} label={t('Sĩ số')} value={data.students} />
      <StatCard icon={FileText} label={t('Bài đã giao')} value={data.assessments} tone="amber" />
      <StatCard icon={TrendingUp} label={t('Điểm trung bình')} value={scoreText(data.avgScore)} tone="emerald" />
      <StatCard icon={AlertTriangle} label={t('Cần bồi dưỡng')} value={data.needSupport} tone="rose" />
    </div>

    <section className="panel">
      <div className="panel-toolbar">
        <h2 className="panel-title">{t('Các đề của {className}', { className: data.className })}<span className="count-pill">{data.total}</span></h2>
        <span className="text-sm text-slate-600">{t('Tỷ lệ nộp bài chung: {rate}%', { rate: data.completionRate })}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table min-w-[820px]">
          <thead><tr>
            <th>{t('Tên bài')}</th><th>{t('Hạn nộp')}</th><th className="w-52">{t('Đã nộp')}</th>
            <th className="text-center">{t('Chờ duyệt')}</th><th className="text-center">{t('Điểm TB')}</th><th className="text-right">{t('Thao tác')}</th>
          </tr></thead>
          <tbody>
            {data.items.length === 0 ? <tr><td colSpan={6} className="empty-cell"><FileText size={28} aria-hidden="true" /><span>{t('Lớp chưa được giao đề nào.')}</span></td></tr>
              : data.items.map(row => <tr key={row.assessmentId}>
                <td className="min-w-[240px] max-w-[360px]">
                  <div className="line-clamp-2 font-bold text-slate-900" title={row.title}>{row.title}</div>
                  <div className="mt-1 text-[12px] text-slate-500">
                    <span className={`font-semibold ${row.type === 'exam' ? 'text-rose-600' : 'text-emerald-600'}`}>{row.type === 'exam' ? t('Bài kiểm tra') : t('Bài tập về nhà')}</span>
                    {' · '}{t('{count} câu', { count: row.questionCount })}{row.status === 'draft' ? ` · ${t('Nháp')}` : ''}
                  </div>
                </td>
                <td className="whitespace-nowrap text-slate-600">{new Date(row.dueDate).toLocaleDateString(locale)}</td>
                <td><div className="flex items-center gap-2"><Meter value={row.completionRate} tone="bg-indigo-500" />
                  <span className="whitespace-nowrap text-xs font-semibold text-slate-600">{row.submitted} / {data.students}</span></div></td>
                <td className="text-center">{row.pending > 0 ? <span className="badge badge-warning">{row.pending}</span> : '—'}</td>
                <td className="text-center font-bold text-slate-800">{scoreText(row.avgScore)}</td>
                <td className="text-right"><button type="button" className="btn btn-secondary btn-sm" disabled={row.status === 'draft'} onClick={() => onOpenAssessment(row.assessmentId)}>
                  <BarChart3 size={14} aria-hidden="true" />{t('Xem chi tiết')}</button></td>
              </tr>)}
          </tbody>
        </table>
      </div>
      <Pagination state={pager} unit={t('bài')} />
    </section>
  </>;
}

/* ---------------- Saved AI review suggestions ---------------- */

/**
 * The latest saved suggestion opens straight away (no new AI call); "Gợi ý lại" asks again and adds to
 * the history, and any earlier suggestion can be reopened or deleted.
 */
function SuggestionPanel({ assessmentId, classId, submitted, avgScore }: { assessmentId: string; classId?: string; submitted: number; avgScore: number | null }) {
  const { currentUser } = useApp();
  const { t, locale } = useI18n();
  const [history, setHistory] = useState<AiSuggestion[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** A canned answer shown when the AI was unavailable; never saved. */
  const [unsaved, setUnsaved] = useState<AiSuggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setHistory(null); setSelectedId(null); setUnsaved(null); setError(null); setShowHistory(false);
    eduApi.suggestions(assessmentId, classId, controller.signal)
      .then(items => { setHistory(items); setSelectedId(items[0]?.id ?? null); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => controller.abort();
  }, [assessmentId, classId]);

  const current = unsaved ?? history?.find(item => item.id === selectedId) ?? null;
  const latest = history?.[0];
  // New submissions (or reviews changing the average) since the latest suggestion make it out of date.
  const outdated = !!latest && (latest.submitted !== submitted || latest.avgScore !== avgScore);
  const when = (iso: string) => new Date(iso).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await eduApi.suggest(assessmentId, classId);
      if (result.saved) {
        setHistory(items => [result.suggestion, ...(items ?? [])]);
        setSelectedId(result.suggestion.id);
        setUnsaved(null);
      } else {
        setUnsaved(result.suggestion);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Không tạo được phân tích.'));
    } finally {
      setLoading(false);
    }
  };

  const remove = async (item: AiSuggestion) => {
    if (!window.confirm(t('Xoá gợi ý lúc {time}?', { time: when(item.createdAt) }))) return;
    try {
      await eduApi.deleteSuggestion(item.id);
      const next = (history ?? []).filter(i => i.id !== item.id);
      setHistory(next);
      if (selectedId === item.id) setSelectedId(next[0]?.id ?? null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };

  const canDelete = (item: AiSuggestion) => currentUser?.role === 'admin' || !item.createdById || item.createdById === currentUser?.id;

  return <section className="panel p-5 sm:p-6">
    <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
      <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><Sparkles size={18} className="text-indigo-600" aria-hidden="true" />{t('Gợi ý nội dung ôn tập')}</h2>
      <div className="flex flex-wrap items-center gap-2">
        {history && history.length > 0 && <button type="button" onClick={() => setShowHistory(v => !v)} aria-expanded={showHistory}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
          <History size={14} aria-hidden="true" />{t('Lịch sử ({count})', { count: history.length })}
        </button>}
        <button type="button" onClick={generate} disabled={loading || submitted === 0 || history === null}
          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
          {loading ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />{t('Đang tổng hợp kết quả...')}</>
            : latest ? <><RefreshCw size={14} aria-hidden="true" />{t('Gợi ý lại')}</>
            : <><Sparkles size={14} className="text-amber-300" aria-hidden="true" />{t('Xem gợi ý ôn tập')}</>}
        </button>
      </div>
    </div>

    {error && <p role="alert" className="mt-3 text-xs text-rose-700">{error}</p>}

    {showHistory && history && history.length > 0 && <ul className="mt-3 grid max-h-56 gap-1 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/60 p-2" aria-label={t('Lịch sử gợi ý')}>
      {history.map((item, index) => <li key={item.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${item.id === current?.id ? 'bg-white shadow-xs ring-1 ring-indigo-200' : 'hover:bg-white'}`}>
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { setSelectedId(item.id); setUnsaved(null); }} aria-current={item.id === current?.id ? 'true' : undefined}>
          <span className="block text-xs font-semibold text-slate-800">{when(item.createdAt)}{index === 0 && <span className="badge badge-info ml-2">{t('Mới nhất')}</span>}</span>
          <span className="block truncate text-[11px] text-slate-500">
            {t('{name} · {count} bài nộp · TB {score}', { name: item.createdByName || '—', count: item.submitted, score: item.avgScore ?? '—' })}
          </span>
        </button>
        {canDelete(item) && <button type="button" className="icon-btn icon-btn-danger" onClick={() => void remove(item)} aria-label={t('Xoá gợi ý lúc {time}', { time: when(item.createdAt) })} title={t('Xoá')}>
          <Trash2 size={14} aria-hidden="true" /></button>}
      </li>)}
    </ul>}

    {current ? <>
      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-slate-500">
        <Clock size={13} aria-hidden="true" />
        {unsaved ? t('Gợi ý mẫu (AI chưa dùng được nên không lưu)') : t('Tạo lúc {time} bởi {name}', { time: when(current.createdAt), name: current.createdByName || '—' })}
        {!unsaved && <span>· {t('dựa trên {count} bài nộp', { count: current.submitted })}</span>}
        {!unsaved && current.id !== latest?.id && <span className="badge badge-muted">{t('Bản cũ')}</span>}
      </p>
      {!unsaved && current.id === latest?.id && outdated && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
        {t('Kết quả đã thay đổi từ lần gợi ý này (hiện {count} bài nộp). Bấm "Gợi ý lại" để cập nhật.', { count: submitted })}
      </p>}
      <div className="analytics-scroll mt-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 sm:p-5" tabIndex={0} aria-label={t('Gợi ý nội dung ôn tập')}>
        <Markdown text={current.content} />
      </div>
    </> : <p className="mt-2 text-sm text-slate-600">
      {history === null && !error ? t('Đang tải...') : submitted === 0 ? t('Chưa có bài nộp để phân tích.') : t('Tổng hợp các lỗi sai thường gặp và gợi ý nội dung ôn tập ngắn cho buổi học tiếp theo.')}
    </p>}
  </section>;
}
