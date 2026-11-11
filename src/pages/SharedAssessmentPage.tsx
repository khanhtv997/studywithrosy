import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, BookCopy, CheckCircle2, Clock, Eye, FileCheck2, FileText, Link2Off, ListChecks, Save, Share2, UserRound } from 'lucide-react';
import { eduApi } from '../api/client';
import { ExamTaker } from '../components/student/ExamTaker';
import { Button } from '../components/ui/Button';
import { ClassChecklist } from '../components/ui/ClassMultiSelect';
import { PageHeader } from '../components/ui/PageHeader';
import { useApp } from '../context/AppContext';
import { formatInfo } from '../../shared/exercise-formats';
import type { SharedAssessmentView } from '../types';
import { useI18n } from '../i18n';

const toLocalInput = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

/**
 * A test another teacher shared (opened from the notification, the "Shared with me" tab or a link).
 * The teacher looks it over, then makes their own copy: assigned to their classes now, or a draft.
 */
export function SharedAssessmentPage() {
  const { key = '' } = useParams();
  const navigate = useNavigate();
  const { classes, syncData } = useApp();
  const { t, locale } = useI18n();
  const [view, setView] = useState<SharedAssessmentView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [classIds, setClassIds] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState(() => toLocalInput(new Date(Date.now() + 7 * 86400000)));
  const [saving, setSaving] = useState<'draft' | 'published' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setView(null);
    setLoadError(null);
    eduApi.openShared(key).then(result => { if (!cancelled) setView(result); })
      .catch(cause => { if (!cancelled) setLoadError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { cancelled = true; };
  }, [key]);

  if (loadError || !view) return <div className="page-stack">
    <div className="empty-state panel">
      {loadError ? <Link2Off size={32} aria-hidden="true" /> : <FileText size={32} aria-hidden="true" />}
      <strong>{loadError ? t('Không mở được đề được chia sẻ') : t('Đang tải đề...')}</strong>
      {loadError && <p className="text-sm text-slate-600">{loadError}</p>}
      <Link to="/assessments" className="btn btn-secondary btn-md"><ArrowLeft size={16} aria-hidden="true" />{t('Về danh sách đề')}</Link>
    </div>
  </div>;

  const { assessment, ownerName, myCopies, isOwner } = view;

  if (previewing) return <div className="page-stack">
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-5 py-3 text-sm text-indigo-900">
      <span>{t('Đang xem trước như học sinh. Bài làm thử không được lưu.')}</span>
      <button type="button" onClick={() => setPreviewing(false)} className="btn btn-secondary btn-md"><ArrowLeft size={16} aria-hidden="true" />{t('Quay lại')}</button>
    </div>
    <ExamTaker assessment={assessment} preview onExit={() => setPreviewing(false)} onCompleted={() => setPreviewing(false)} />
  </div>;

  const save = async (status: 'draft' | 'published') => {
    if (status === 'published' && !classIds.length) { setError(t('Hãy chọn ít nhất một lớp để giao bài.')); return; }
    const due = new Date(dueDate);
    if (Number.isNaN(due.getTime())) { setError(t('Hạn nộp chưa hợp lệ.')); return; }
    setSaving(status);
    setError(null);
    try {
      const copy = await eduApi.copyShared(key, { classIds, status, dueDate: due.toISOString() });
      await syncData();
      navigate(status === 'published' ? `/assessments/${encodeURIComponent(copy.id)}/preview?created=1` : '/assessments');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setSaving(null);
    }
  };

  const formats = [...new Set(assessment.questions.map(q => formatInfo(q.format)?.label).filter((l): l is string => !!l))].map(label => t(label));
  const facts = [
    { icon: ListChecks, text: t('{count} câu · {points} điểm', { count: assessment.questions.length, points: assessment.totalPoints }) },
    { icon: Clock, text: assessment.durationMinutes > 0 ? t('{count} phút', { count: assessment.durationMinutes }) : t('Không giới hạn thời gian') },
    { icon: UserRound, text: t('Người tạo: {name}', { name: ownerName || t('giáo viên khác') }) },
  ];

  return <div className="page-stack">
    <PageHeader icon={Share2} eyebrow={t('Đề được chia sẻ')} title={assessment.title}
      description={assessment.description || t('Xem lại đề, rồi tạo bản sao của bạn để giao cho lớp mình. Bản gốc không bị thay đổi.')}
      actions={<Button variant="secondary" onClick={() => setPreviewing(true)}><Eye size={16} aria-hidden="true" />{t('Xem trước như học sinh')}</Button>} />

    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="panel p-5 sm:p-6">
        <h2 className="text-base font-bold text-slate-900">{t('Thông tin đề')}</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {facts.map(({ icon: Icon, text }, i) => <li key={i} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
            <Icon size={16} className="shrink-0 text-indigo-600" aria-hidden="true" />{text}
          </li>)}
        </ul>
        <p className="mt-4 text-sm text-slate-600">
          <strong className="text-slate-800">{assessment.type === 'exam' ? t('Bài kiểm tra') : t('Bài tập về nhà')}</strong>
          {assessment.level ? ` · ${assessment.level}` : ''}
        </p>
        {formats.length > 0 && <div className="mt-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">{t('Dạng bài')}</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">{formats.map(f => <span key={f} className="badge badge-muted">{f}</span>)}</div>
        </div>}
        <ol className="mt-6 grid gap-2">
          {assessment.questions.slice(0, 8).map(q => <li key={q.id} className="flex gap-3 rounded-xl border border-slate-100 px-3 py-2 text-sm text-slate-700">
            <span className="font-bold text-slate-400">{q.order}.</span>
            <span className="line-clamp-2">{q.text.replace(/<\/?u>/g, '')}</span>
          </li>)}
        </ol>
        {assessment.questions.length > 8 && <p className="mt-2 text-sm text-slate-500">
          {t('… và {count} câu nữa.', { count: assessment.questions.length - 8 })}{' '}
          <button type="button" className="font-semibold text-indigo-700 hover:underline" onClick={() => setPreviewing(true)}>{t('Xem toàn bộ')}</button>
        </p>}
      </section>

      <aside className="panel h-fit p-5 sm:p-6" aria-labelledby="assign-copy">
        <h2 id="assign-copy" className="flex items-center gap-2 text-base font-bold text-slate-900"><BookCopy size={18} className="text-indigo-600" aria-hidden="true" />{t('Giao cho lớp của tôi')}</h2>
        <p className="mt-1 text-sm text-slate-600">{t('Bạn sẽ có bản sao riêng: sửa, giao và chấm độc lập với người chia sẻ.')}</p>
        {isOwner && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{t('Đây là đề của chính bạn. Tạo bản sao chỉ khi bạn muốn một phiên bản riêng.')}</p>}
        {myCopies.length > 0 && <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
          <p className="flex items-center gap-2 font-semibold"><CheckCircle2 size={16} aria-hidden="true" />{t('Bạn đã tạo {count} bản sao từ đề này', { count: myCopies.length })}</p>
          <ul className="mt-1 grid gap-0.5 pl-6 text-[13px]">
            {myCopies.map(copy => <li key={copy.id}>{new Date(copy.createdAt).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })}</li>)}
          </ul>
        </div>}
        <div className="form-stack mt-4">
          {error && <p role="alert" className="form-error">{error}</p>}
          <div className="form-field">{t('Chọn lớp để giao')}
            <ClassChecklist classes={classes} value={classIds} onChange={setClassIds} />
          </div>
          <label className="form-field">{t('Hạn nộp')}
            <input type="datetime-local" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </label>
          <Button disabled={saving !== null || !classes.length} onClick={() => save('published')}>
            <FileCheck2 size={16} aria-hidden="true" />{saving === 'published' ? t('Đang giao...') : classIds.length ? t('Giao cho {count} lớp', { count: classIds.length }) : t('Giao bài')}
          </Button>
          <Button variant="secondary" disabled={saving !== null} onClick={() => save('draft')}>
            <Save size={16} aria-hidden="true" />{saving === 'draft' ? t('Đang lưu...') : t('Lưu vào đề của tôi (nháp)')}
          </Button>
        </div>
      </aside>
    </div>
  </div>;
}
