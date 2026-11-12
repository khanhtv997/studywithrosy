import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { BarChart3, ClipboardCheck, Copy, Eye, Highlighter, FileSpreadsheet, FileText, Inbox, Lock, Pencil, Plus, School, Search, Send, Share2, Sparkles, Trash2 } from 'lucide-react';
import { AssignClassesModal } from './AssignClassesModal';
import { ShareAssessmentModal } from './ShareAssessmentModal';
import { eduApi } from '../../api/client';
import { useApp } from '../../context/AppContext';
import type { Assessment, AssessmentPage, AssessmentRow, SharedAssessmentSummary } from '../../types';
import { Button } from '../ui/Button';
import { PageHeader } from '../ui/PageHeader';
import { Pagination, useDebounced, useServerPage } from '../ui/Pagination';
import { SelectField } from '../ui/SelectField';
import { Tabs } from '../ui/Tabs';
import { useI18n } from '../../i18n';

interface AssessmentListProps {
  onOpenOcr: () => void;
  onSelectAssessmentForGrading: (assessmentId: string) => void;
  onSelectAssessmentForAnalytics: (assessmentId: string) => void;
  onPreview: (assessmentId: string) => void;
}

const STATUS: Record<Assessment['status'], { text: string; badge: string }> = {
  draft: { text: 'Nháp', badge: 'badge-muted' },
  published: { text: 'Đang giao', badge: 'badge-info' },
  closed: { text: 'Đã đóng', badge: 'badge-warning' },
};

const formatDue = (iso: string, locale: string) => new Date(iso).toLocaleString(locale, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });

export const AssessmentList: React.FC<AssessmentListProps> = ({ onOpenOcr, onSelectAssessmentForGrading, onSelectAssessmentForAnalytics, onPreview }) => {
  const { assessments, classes, updateAssessment, deleteAssessment, currentUser } = useApp();
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const [view, setView] = useState<'mine' | 'shared'>('mine');
  const [shared, setShared] = useState<SharedAssessmentSummary[] | null>(null);
  const [sharedError, setSharedError] = useState<string | null>(null);
  const [sharing, setSharing] = useState<Assessment | null>(null);

  // Loaded once for the tab count; it is small and changes only when someone shares.
  useEffect(() => {
    let cancelled = false;
    eduApi.sharedWithMe().then(items => { if (!cancelled) setShared(items); })
      .catch(cause => { if (!cancelled) setSharedError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { cancelled = true; };
  }, []);
  const canShare = (item: Assessment) => currentUser?.role === 'admin' || !item.ownerId || item.ownerId === currentUser?.id;

  const [filterType, setFilterType] = useState<'all' | Assessment['type']>('all');
  const [filterClass, setFilterClass] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | Assessment['status']>('all');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [movingAssessment, setMovingAssessment] = useState<Assessment | null>(null);

  const changeStatus = async (item: Assessment) => {
    // Nothing to publish to yet: pick the classes first.
    if (item.status !== 'published' && !item.classIds.length) { setMovingAssessment(item); return; }
    setBusyId(item.id);
    try { await updateAssessment(item.id, { status: item.status === 'published' ? 'closed' : 'published' }); }
    catch { /* AppContext shows the API error. */ }
    finally { setBusyId(null); }
  };
  const removeAssessment = async (item: Assessment) => {
    if (!window.confirm(t('Xóa bài "{title}" và tất cả bài nộp liên quan?', { title: item.title }))) return;
    setBusyId(item.id);
    try { await deleteAssessment(item.id); }
    catch { /* AppContext shows the API error. */ }
    finally { setBusyId(null); }
  };

  const classById = new Map(classes.map(c => [c.id, c]));
  const q = useDebounced(query.trim());
  // Filtering, per-type counts, submission counts and paging happen on the server, newest first.
  const pager = useServerPage<AssessmentRow, AssessmentPage>(
    (page, pageSize, signal) => eduApi.assessmentPage({ page, pageSize, type: filterType, classId: filterClass, status: filterStatus, q }, signal),
    [filterType, filterClass, filterStatus, q]);
  const typeCounts = pager.data?.counts ?? { all: 0, exam: 0, homework: 0 };

  return (
    <div className="page-stack">
      <PageHeader icon={FileSpreadsheet} title={t('Đề kiểm tra và bài tập')}
        description={t('Tạo bài mới từ ảnh, PDF hoặc văn bản. Xem lại câu hỏi và đáp án trước khi giao cho học sinh.')}
        actions={<Button onClick={onOpenOcr}><Sparkles size={17} aria-hidden="true" />{t('Tạo đề từ tài liệu')}</Button>} />

      <Tabs ariaLabel={t('Nguồn đề')} value={view} onChange={setView} options={[
        { value: 'mine', label: t('Đề của tôi'), count: assessments.length },
        { value: 'shared', label: t('Được chia sẻ với tôi'), count: shared?.length ?? 0 },
      ]} />

      {view === 'shared' ? <SharedList items={shared} error={sharedError} onOpen={id => navigate(`/shared/${encodeURIComponent(id)}`)} /> :
      <section className="panel">
        <div className="panel-toolbar">
          <Tabs ariaLabel={t('Loại bài')} value={filterType} onChange={setFilterType} options={[
            { value: 'all', label: t('Tất cả'), count: typeCounts.all },
            { value: 'exam', label: t('Bài kiểm tra'), count: typeCounts.exam },
            { value: 'homework', label: t('Bài tập về nhà'), count: typeCounts.homework },
          ]} />
          <div className="toolbar-controls">
            <SelectField ariaLabel={t('Lọc theo lớp')} value={filterClass} onValueChange={setFilterClass} compact className="w-full sm:w-52"
              options={[{ value: 'all', label: t('Tất cả các lớp') }, ...classes.map(c => ({ value: c.id, label: c.name }))]} />
            <SelectField ariaLabel={t('Lọc theo trạng thái')} value={filterStatus} onValueChange={v => setFilterStatus(v as typeof filterStatus)} compact className="w-full sm:w-40"
              options={[{ value: 'all', label: t('Mọi trạng thái') }, { value: 'published', label: t(STATUS.published.text) }, { value: 'draft', label: t(STATUS.draft.text) }, { value: 'closed', label: t(STATUS.closed.text) }]} />
            <label className="search-field">
              <Search size={16} aria-hidden="true" />
              <input type="search" aria-label={t('Tìm bài')} placeholder={t('Tìm theo tên bài...')} value={query} onChange={e => setQuery(e.target.value)} />
            </label>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table min-w-[900px]">
            <thead>
              <tr>
                <th>{t('Tên bài')}</th>
                <th>{t('Giao cho lớp')}</th>
                <th>{t('Trạng thái')}</th>
                <th>{t('Hạn nộp')}</th>
                <th>{t('Bài nộp')}</th>
                <th className="text-right">{t('Thao tác')}</th>
              </tr>
            </thead>
            <tbody>
              {pager.error ? (
                <tr><td colSpan={6} className="empty-cell"><span role="alert">{pager.error}</span></td></tr>
              ) : pager.loading && !pager.data ? (
                <tr><td colSpan={6} className="empty-cell"><span>{t('Đang tải...')}</span></td></tr>
              ) : pager.total === 0 ? (
                <tr><td colSpan={6} className="empty-cell">
                  <FileText size={28} aria-hidden="true" />
                  <span>{assessments.length ? t('Không có bài nào khớp với bộ lọc.') : t('Chưa có bài nào. Bấm “Tạo đề từ tài liệu” để bắt đầu.')}</span>
                </td></tr>
              ) : pager.pageItems.map(item => {
                const pending = item.pendingCount;
                const overdue = item.status === 'published' && new Date(item.dueDate).getTime() < Date.now();
                return <tr key={item.id}>
                  <td className="min-w-[240px] max-w-[360px]">
                    <div className="font-bold text-slate-900 line-clamp-2" title={item.title}>{item.title}</div>
                    {item.copiedFrom ? <div className="mt-0.5 flex items-center gap-1 text-[12px] text-violet-700"><Copy size={12} aria-hidden="true" />{t('Bản sao từ đề của {name}', { name: item.copiedFrom.ownerName || t('giáo viên khác') })}</div>
                      : item.ownerId && item.ownerId !== currentUser?.id && item.ownerName && <div className="mt-0.5 text-[12px] text-slate-500">{t('Người tạo: {name}', { name: item.ownerName })}</div>}
                    <div className="mt-1 flex items-center gap-2 whitespace-nowrap text-[12px] text-slate-500">
                      <span className={`font-semibold ${item.type === 'exam' ? 'text-rose-600' : 'text-emerald-600'}`}>{item.type === 'exam' ? t('Bài kiểm tra') : t('Bài tập về nhà')}</span>
                      <span>·</span>
                      <span>{item.durationMinutes > 0 ? t('{count} phút', { count: item.durationMinutes }) : t('Không giới hạn')}</span>
                      <span>·</span>
                      <span>{t('{count} câu', { count: item.questions.length })}</span>
                    </div>
                  </td>
                  <td className="w-[210px] max-w-[210px]">
                    <ClassChips item={item} names={item.classIds.map(id => classById.get(id)?.name ?? t('Lớp khác'))} onEdit={() => setMovingAssessment(item)} />
                  </td>
                  <td><span className={`badge ${STATUS[item.status].badge}`}>{t(STATUS[item.status].text)}</span></td>
                  <td className={`whitespace-nowrap ${overdue ? 'font-semibold text-rose-600' : 'text-slate-600'}`}>
                    {formatDue(item.dueDate, locale)}{overdue && <div className="text-[11px] font-normal">{t('Đã quá hạn')}</div>}
                  </td>
                  <td className="whitespace-nowrap">
                    <div className="text-slate-500">{t('{count} bài', { count: item.submissionCount })}</div>
                    {pending > 0 && <span className="badge badge-warning mt-1">{t('{count} chờ duyệt', { count: pending })}</span>}
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-0.5">
                      <button type="button" className="icon-btn" onClick={() => onPreview(item.id)} aria-label={t('Xem trước: {title}', { title: item.title })} title={t('Xem trước như học sinh')}><Eye size={16} aria-hidden="true" /></button>
                      <button type="button" className="icon-btn" onClick={() => navigate(`/assessments/${encodeURIComponent(item.id)}/review`)} aria-label={t('Chữa đề: {title}', { title: item.title })} title={t('Chữa đề (highlight, ghi chú, hiện đáp án)')}><Highlighter size={16} aria-hidden="true" /></button>
                      <button type="button" className="icon-btn" onClick={() => onSelectAssessmentForGrading(item.id)} aria-label={t('Chấm bài: {title}', { title: item.title })} title={t('Chấm & duyệt bài')}><ClipboardCheck size={16} aria-hidden="true" /></button>
                      <button type="button" className="icon-btn" onClick={() => onSelectAssessmentForAnalytics(item.id)} aria-label={t('Phân tích: {title}', { title: item.title })} title={t('Xem phân tích')}><BarChart3 size={16} aria-hidden="true" /></button>
                      <button type="button" className="icon-btn" disabled={busyId === item.id} onClick={() => changeStatus(item)}
                        aria-label={item.status === 'published' ? t('Đóng: {title}', { title: item.title }) : item.status === 'closed' ? t('Mở lại: {title}', { title: item.title }) : t('Giao: {title}', { title: item.title })}
                        title={item.status === 'published' ? t('Đóng bài (học sinh không nộp được nữa)') : item.status === 'closed' ? t('Mở lại bài') : t('Giao bài cho học sinh')}>
                        {item.status === 'published' ? <Lock size={16} aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
                      </button>
                      {canShare(item) && <button type="button" className="icon-btn" onClick={() => setSharing(item)} aria-label={t('Chia sẻ: {title}', { title: item.title })} title={t('Chia sẻ cho giáo viên khác')}><Share2 size={16} aria-hidden="true" /></button>}
                      <button type="button" className="icon-btn icon-btn-danger" disabled={busyId === item.id || !canShare(item)} onClick={() => removeAssessment(item)}
                        aria-label={t('Xóa {title}', { title: item.title })} title={t('Xóa bài')}><Trash2 size={16} aria-hidden="true" /></button>
                    </div>
                  </td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
        <Pagination state={pager} unit={t('bài')} />
      </section>}
      {movingAssessment && <AssignClassesModal assessment={movingAssessment} onClose={() => setMovingAssessment(null)} />}
      {sharing && <ShareAssessmentModal assessment={sharing} onClose={() => setSharing(null)} />}
    </div>
  );
};

/** The classes an assessment goes to, as chips that open the class picker. */
function ClassChips({ item, names, onEdit }: { item: Assessment; names: string[]; onEdit: () => void }) {
  const { t } = useI18n();
  const shown = names.slice(0, 2);
  const label = names.length ? t('Lớp được giao: {names}. Bấm để đổi.', { names: names.join(', ') }) : t('Chưa giao lớp nào. Bấm để chọn lớp.');
  return <button type="button" onClick={onEdit} title={label} aria-label={`${item.title}: ${label}`}
    className="group inline-flex max-w-full flex-wrap items-center gap-1 rounded-lg p-0.5 text-left hover:bg-indigo-50/60">
    {names.length === 0 ? <span className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-2.5 py-1 text-[13px] font-semibold text-slate-500">
      <Plus size={13} aria-hidden="true" />{t('Chưa giao lớp')}
    </span> : <>
      {shown.map((name, i) => <span key={i} className="inline-flex max-w-[160px] items-center gap-1 rounded-lg border border-indigo-100 bg-indigo-50/70 px-2 py-0.5 text-[13px] font-semibold text-indigo-800">
        <School size={13} className="shrink-0" aria-hidden="true" /><span className="truncate">{name}</span>
      </span>)}
      {names.length > shown.length && <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[12px] font-bold text-slate-600">+{names.length - shown.length}</span>}
    </>}
    <Pencil size={12} className="ml-0.5 shrink-0 text-indigo-700 opacity-40 group-hover:opacity-100" aria-hidden="true" />
  </button>;
}

/** Assessments other teachers shared directly with the current user. */
function SharedList({ items, error, onOpen }: { items: SharedAssessmentSummary[] | null; error: string | null; onOpen: (id: string) => void }) {
  const { t, locale } = useI18n();
  return <section className="panel">
    <div className="overflow-x-auto">
      <table className="data-table min-w-[760px]">
        <thead>
          <tr>
            <th>{t('Tên bài')}</th>
            <th>{t('Người tạo')}</th>
            <th>{t('Chia sẻ bởi')}</th>
            <th className="text-center">{t('Số câu')}</th>
            <th>{t('Ngày chia sẻ')}</th>
            <th className="text-right">{t('Thao tác')}</th>
          </tr>
        </thead>
        <tbody>
          {error ? <tr><td colSpan={6} className="empty-cell"><span role="alert">{error}</span></td></tr>
            : items === null ? <tr><td colSpan={6} className="empty-cell"><span>{t('Đang tải...')}</span></td></tr>
            : items.length === 0 ? <tr><td colSpan={6} className="empty-cell">
              <Inbox size={28} aria-hidden="true" />
              <span>{t('Chưa có ai chia sẻ đề với bạn. Khi giáo viên khác chia sẻ, đề sẽ hiện ở đây.')}</span>
            </td></tr>
            : items.map(item => <tr key={item.id}>
              <td className="min-w-[240px] max-w-[360px]">
                <div className="font-bold text-slate-900 line-clamp-2" title={item.title}>{item.title}</div>
                <div className={`mt-1 text-[12px] font-semibold ${item.type === 'exam' ? 'text-rose-600' : 'text-emerald-600'}`}>{item.type === 'exam' ? t('Bài kiểm tra') : t('Bài tập về nhà')}{item.level ? ` · ${item.level}` : ''}</div>
              </td>
              <td className="text-slate-700">{item.ownerName || '—'}</td>
              <td className="text-slate-700">{item.sharedByName || '—'}</td>
              <td className="text-center font-semibold text-slate-700">{item.questionCount}</td>
              <td className="whitespace-nowrap text-slate-600">{new Date(item.sharedAt).toLocaleDateString(locale)}</td>
              <td className="text-right"><Button size="sm" onClick={() => onOpen(item.id)}><Eye size={15} aria-hidden="true" />{t('Xem & giao')}</Button></td>
            </tr>)}
        </tbody>
      </table>
    </div>
  </section>;
}
