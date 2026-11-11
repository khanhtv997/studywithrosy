import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowRight, Award, Bell, BookOpen, CalendarClock, CheckCircle2, ClipboardList, Clock, Hourglass,
  MessageSquare, PartyPopper, Play, RotateCcw, Send, TrendingUp,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { Assessment, Submission } from '../../types';
import { PageHeader, StatCard } from '../ui/PageHeader';
import { StudentAvatar } from '../ui/StudentAvatar';
import { ExamResultView } from './ExamResultView';
import { useI18n } from '../../i18n';

const isOpen = (assessment: Assessment) => assessment.status === 'published' && new Date(assessment.dueDate).getTime() >= Date.now();

/** "Còn 3 ngày", "Còn 5 giờ", "Còn 20 phút" — and whether it is urgent (under a day). */
function timeLeft(dueDate: string, t: (text: string, vars?: Record<string, string | number>) => string) {
  const ms = new Date(dueDate).getTime() - Date.now();
  const hours = ms / 3_600_000;
  if (hours >= 48) return { text: t('Còn {count} ngày', { count: Math.floor(hours / 24) }), urgent: false };
  if (hours >= 1) return { text: t('Còn {count} giờ', { count: Math.floor(hours) }), urgent: hours < 24 };
  return { text: t('Còn {count} phút', { count: Math.max(1, Math.floor(ms / 60_000)) }), urgent: true };
}

const formatDate = (iso: string, locale: string) => new Date(iso).toLocaleString(locale, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });

export const StudentDashboard: React.FC = () => {
  const { activeStudent, classes, assessments, submissions, currentStudentId } = useApp();
  const navigate = useNavigate();
  const { t, locale } = useI18n();
  const [viewingResult, setViewingResult] = useState<{ assessment: Assessment; submission: Submission } | null>(null);
  const startExam = (item: Assessment) => navigate(`/student/assessments/${encodeURIComponent(item.id)}`);

  const studentClass = classes.find(c => c.id === activeStudent?.classId);
  const classAssessments = assessments.filter(a => !!activeStudent && a.classIds.includes(activeStudent.classId) && a.status !== 'draft');
  const mySubmissions = submissions.filter(s => s.studentId === currentStudentId);
  const submittedIds = new Set(mySubmissions.map(s => s.assessmentId));

  const todo = classAssessments.filter(a => isOpen(a) && !submittedIds.has(a.id))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const pending = mySubmissions.filter(s => s.status === 'pending_review')
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const graded = mySubmissions.filter(s => s.status === 'published' && s.finalScore !== null)
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const average = graded.length ? Math.round(graded.reduce((sum, s) => sum + (s.finalScore ?? 0), 0) / graded.length * 10) / 10 : null;
  const assessmentById = new Map(assessments.map(a => [a.id, a]));
  // Nothing assigned and nothing submitted yet: one welcome panel instead of several empty lists.
  const brandNew = classAssessments.length === 0 && mySubmissions.length === 0;

  return <div className="page-stack">
    <PageHeader
      title={<span className="flex items-center gap-4">
        <StudentAvatar name={activeStudent?.name || t('Học sinh')} className="h-14 w-14 shrink-0 rounded-2xl text-lg" />
        <span>{t('Chào em, {name}!', { name: activeStudent?.name ?? t('bạn') })}</span>
      </span>}
      description={t('Bài cần làm, bài đang chờ chấm và kết quả của em đều ở đây.')}>
      <div className="info-chips">
        {studentClass && <span><BookOpen size={14} aria-hidden="true" />{studentClass.name}</span>}
        {activeStudent?.code && <span>{t('Mã HS: {code}', { code: activeStudent.code })}</span>}
      </div>
    </PageHeader>

    <div className="stat-grid">
      <StatCard icon={ClipboardList} label={t('Bài cần làm')} value={todo.length} />
      <StatCard icon={Hourglass} label={t('Chờ thầy cô chấm')} value={pending.length} tone="amber" />
      <StatCard icon={CheckCircle2} label={t('Đã có điểm')} value={graded.length} tone="emerald" />
      <StatCard icon={TrendingUp} label={t('Điểm trung bình')} value={average === null ? '—' : `${average} / 10`} tone="rose" />
    </div>

    {brandNew ? (
      <section className="panel composer-body">
        <div className="mx-auto max-w-3xl py-4 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-indigo-50 text-indigo-600"><BookOpen size={26} aria-hidden="true" /></span>
          <h2 className="mt-4 text-xl font-bold text-slate-900">{t('Chưa có bài tập nào được giao')}</h2>
          <p className="mt-1 text-sm text-slate-600">{t('Khi thầy cô giao bài cho {className}, bài sẽ hiện ở đây.', { className: studentClass?.name ?? t('lớp của em') })}</p>
          <ol className="mt-6 grid gap-3 text-left sm:grid-cols-3">
            {[
              { icon: Bell, title: 'Nhận bài', text: 'Chuông thông báo báo cho em khi có bài mới.' },
              { icon: Send, title: 'Làm và nộp', text: 'Bấm "Làm bài", trả lời rồi nộp trước hạn.' },
              { icon: Award, title: 'Xem kết quả', text: 'Điểm, nhận xét và lời giải hiện sau khi thầy cô duyệt.' },
            ].map(({ icon: Icon, title, text }, i) => <li key={title} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-white text-indigo-600 shadow-xs"><Icon size={15} aria-hidden="true" /></span>
                {i + 1}. {t(title)}
              </div>
              <p className="mt-2 text-[13px] text-slate-600">{t(text)}</p>
            </li>)}
          </ol>
        </div>
      </section>
    ) : <>
      <section className="panel">
        <div className="panel-toolbar"><h2 className="panel-title">{t('Bài cần làm')}<span className="count-pill">{todo.length}</span></h2></div>
        {todo.length === 0 ? (
          <div className="empty-state">
            <PartyPopper size={30} aria-hidden="true" />
            <strong>{t('Em đã làm hết bài đang được giao')}</strong>
            <span className="text-sm">{t('Bài mới sẽ hiện ở đây, kèm thông báo ở chuông.')}</span>
          </div>
        ) : (
          <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-2 2xl:grid-cols-3">
            {todo.map(item => {
              const left = timeLeft(item.dueDate, t);
              return <article key={item.id} className={`flex flex-col gap-3 rounded-2xl border bg-white p-5 transition-colors hover:border-indigo-300 ${left.urgent ? 'border-rose-200' : 'border-slate-200'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className={`badge ${item.type === 'exam' ? 'badge-danger' : 'badge-success'}`}>{item.type === 'exam' ? t('Bài kiểm tra') : t('Bài tập về nhà')}</span>
                  <span className={`inline-flex items-center gap-1 text-xs font-bold ${left.urgent ? 'text-rose-600' : 'text-slate-600'}`}>
                    <CalendarClock size={14} aria-hidden="true" />{left.text}
                  </span>
                </div>
                <h3 className="text-base font-bold leading-snug text-slate-900">{item.title}</h3>
                {item.description && <p className="line-clamp-2 text-[13px] text-slate-600">{item.description}</p>}
                <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-600">
                  <span className="inline-flex items-center gap-1"><ClipboardList size={13} aria-hidden="true" />{t('{count} câu', { count: item.questions.length })}</span>
                  <span className="inline-flex items-center gap-1"><Clock size={13} aria-hidden="true" />{item.durationMinutes > 0 ? t('{count} phút', { count: item.durationMinutes }) : t('Không giới hạn')}</span>
                  <span>{t('Hạn {date}', { date: formatDate(item.dueDate, locale) })}</span>
                </div>
                <button type="button" onClick={() => startExam(item)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-sm font-bold text-white hover:bg-indigo-700">
                  <Play size={15} className="fill-white" aria-hidden="true" />{t('Làm bài')}
                </button>
              </article>;
            })}
          </div>
        )}
      </section>

      {pending.length > 0 && <section className="panel">
        <div className="panel-toolbar"><h2 className="panel-title">{t('Chờ thầy cô chấm')}<span className="count-pill">{pending.length}</span></h2></div>
        <ul className="divide-y divide-slate-100">
          {pending.map(sub => <li key={sub.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div className="min-w-0">
              <div className="font-semibold text-slate-900">{assessmentById.get(sub.assessmentId)?.title ?? t('Bài đã nộp')}</div>
              <div className="text-xs text-slate-500">{t('Đã nộp lúc {date}', { date: formatDate(sub.submittedAt, locale) })}</div>
            </div>
            <span className="badge badge-warning"><Hourglass size={12} aria-hidden="true" />{t('Đang chờ duyệt')}</span>
          </li>)}
        </ul>
      </section>}

      <section className="panel">
        <div className="panel-toolbar"><h2 className="panel-title">{t('Kết quả')}<span className="count-pill">{graded.length}</span></h2></div>
        {graded.length === 0 ? (
          <div className="empty-state">
            <Award size={30} aria-hidden="true" />
            <strong>{t('Chưa có bài nào được chấm')}</strong>
            <span className="text-sm">{t('Điểm và nhận xét sẽ hiện ở đây sau khi thầy cô duyệt bài.')}</span>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {graded.map(sub => {
              const assessment = assessmentById.get(sub.assessmentId);
              if (!assessment) return null;
              const score = sub.finalScore ?? 0;
              return <li key={sub.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center">
                <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-lg font-extrabold ${score >= 8 ? 'bg-emerald-50 text-emerald-700' : score >= 5 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>{score}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-900">{assessment.title}</div>
                  <div className="text-xs text-slate-500">{t('{count} câu · nộp lúc {date}', { count: assessment.questions.length, date: formatDate(sub.submittedAt, locale) })}</div>
                  {sub.teacherFeedback && <p className="mt-1.5 flex items-start gap-1.5 text-[13px] italic text-indigo-900">
                    <MessageSquare size={14} className="mt-0.5 shrink-0 text-indigo-500" aria-hidden="true" /><span className="line-clamp-2">“{sub.teacherFeedback}”</span>
                  </p>}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {assessment.allowRetry && isOpen(assessment) && <button type="button"
                    onClick={() => { if (window.confirm(t('Làm lại sẽ thay thế bài đã nộp và điểm hiện tại. Em muốn làm lại?'))) startExam(assessment); }}
                    className="btn btn-secondary btn-sm"><RotateCcw size={14} aria-hidden="true" />{t('Làm lại')}</button>}
                  <button type="button" onClick={() => setViewingResult({ assessment, submission: sub })} className="btn btn-primary btn-sm">
                    {t('Xem bài giải')}<ArrowRight size={14} aria-hidden="true" />
                  </button>
                </div>
              </li>;
            })}
          </ul>
        )}
      </section>
    </>}

    {viewingResult && <ExamResultView assessment={viewingResult.assessment} submission={viewingResult.submission} onClose={() => setViewingResult(null)} />}
  </div>;
};
