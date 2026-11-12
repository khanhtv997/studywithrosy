import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import { AlertCircle, Award, BookOpen, Check, CheckCircle2, ClipboardCheck, Search, Send, Sparkles } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { eduApi } from '../../api/client';
import type { Submission, SubmissionPage, SubmissionRow } from '../../types';
import { isAnswerCorrect } from '../../utils/assessmentLogic';
import { Modal } from '../ui/Modal';
import { QuestionReview } from '../ui/QuestionReview';
import { SelectField } from '../ui/SelectField';
import { PageHeader } from '../ui/PageHeader';
import { Button } from '../ui/Button';
import { Pagination, useDebounced, useServerPage } from '../ui/Pagination';
import { Tabs } from '../ui/Tabs';
import { StudentAvatar } from '../ui/StudentAvatar';
import { useI18n } from '../../i18n';

interface GradingReviewProps {
  initialAssessmentId?: string;
}

const formatTime = (iso: string, locale: string) => new Date(iso).toLocaleString(locale, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });

/** Parses the score field; returns null unless it is a number from 0 to 10. */
function parseScore(value: string): number | null {
  const score = Number(value.replace(',', '.'));
  return value.trim() !== '' && Number.isFinite(score) && score >= 0 && score <= 10 ? Math.round(score * 10) / 10 : null;
}

export const GradingReview: React.FC<GradingReviewProps> = ({ initialAssessmentId }) => {
  const { assessments, classes, submissions, reviewSubmission } = useApp();
  const { t, locale } = useI18n();

  const [filterAssessmentId, setFilterAssessmentId] = useState<string>(initialAssessmentId || 'all');
  const [filterStatus, setFilterStatus] = useState<'pending' | 'published' | 'all'>('pending');

  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [scoreInput, setScoreInput] = useState('');
  const [feedbackInput, setFeedbackInput] = useState('');
  const [isGeneratingAiFeedback, setIsGeneratingAiFeedback] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const [filterClassId, setFilterClassId] = useState<string>(() =>
    { const classIds = assessments.find(a => a.id === initialAssessmentId)?.classIds ?? []; return classIds.length === 1 ? classIds[0] : 'all'; });
  const [query, setQuery] = useState('');

  const assessmentById = new Map(assessments.map(a => [a.id, a]));
  const assessmentOptions = filterClassId === 'all' ? assessments : assessments.filter(a => a.classIds.includes(filterClassId));
  const changeClass = (classId: string) => {
    setFilterClassId(classId);
    // Keep the chosen assessment only if it belongs to the new class.
    if (classId !== 'all' && !assessmentById.get(filterAssessmentId)?.classIds.includes(classId)) setFilterAssessmentId('all');
  };

  const q = useDebounced(query.trim());
  // Filtering, per-status counts and paging happen on the server (oldest pending first, reviewed newest first).
  const pager = useServerPage<SubmissionRow, SubmissionPage>(
    (page, pageSize, signal) => eduApi.submissionPage({ page, pageSize, status: filterStatus, classId: filterClassId, assessmentId: filterAssessmentId, q }, signal),
    [filterStatus, filterClassId, filterAssessmentId, q]);
  const statusCounts = pager.data?.counts ?? { pending: 0, published: 0, all: 0 };

  const pendingCount = submissions.filter((s) => s.status === 'pending_review').length;
  const selectedAssessment = selectedSubmission ? assessments.find((a) => a.id === selectedSubmission.assessmentId) : undefined;
  const parsedScore = parseScore(scoreInput);

  const handleOpenReviewModal = (sub: Submission) => {
    setSelectedSubmission(sub);
    setScoreInput(String(sub.finalScore ?? sub.autoScore));
    setFeedbackInput(sub.teacherFeedback || '');
    setModalError(null);
  };

  const handleGenerateAiFeedback = async () => {
    if (!selectedSubmission || !selectedAssessment) return;
    const weakQuestions = selectedAssessment.questions
      .filter((q) => !isAnswerCorrect(q, selectedSubmission.answers[q.id]))
      .map((q) => ({
        text: q.text,
        studentAnswer: selectedSubmission.answers[q.id] || '(Bỏ trống)',
        correctAnswer: q.correctAnswer,
        grammarTopic: q.grammarTopic,
        explanation: q.explanation,
      }));

    setIsGeneratingAiFeedback(true);
    setModalError(null);
    try {
      const data = await eduApi.feedback({
        studentName: selectedSubmission.studentName,
        assessmentTitle: selectedAssessment.title,
        score: parsedScore ?? selectedSubmission.autoScore,
        weakQuestions,
      });
      if (data.feedback) setFeedbackInput(data.feedback);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : t('Không tạo được gợi ý nhận xét.'));
    } finally {
      setIsGeneratingAiFeedback(false);
    }
  };

  const handlePublishReview = async () => {
    if (!selectedSubmission) return;
    if (parsedScore === null) { setModalError(t('Điểm phải là số từ 0 đến 10.')); return; }
    setPublishing(true);
    setModalError(null);
    try {
      await reviewSubmission(selectedSubmission.id, parsedScore, feedbackInput.trim() || 'Thầy/Cô đã duyệt bài làm của em.');
    } catch (err) {
      setModalError(err instanceof Error ? err.message : t('Không lưu được kết quả.'));
      setPublishing(false);
      return;
    }
    setPublishing(false);
    confetti({ particleCount: 60, spread: 60, origin: { y: 0.6 } });
    setSelectedSubmission(null);
  };

  return (
    <div className="page-stack">
      <PageHeader icon={CheckCircle2} title={t('Chấm và duyệt bài')}
        description={t('Xem bài học sinh đã nộp, kiểm tra điểm và viết nhận xét. Học sinh thấy kết quả sau khi thầy cô duyệt.')}
        actions={pendingCount > 0
          ? <span className="badge badge-warning badge-lg"><AlertCircle size={15} aria-hidden="true" />{t('{count} bài chờ duyệt', { count: pendingCount })}</span>
          : <span className="badge badge-success badge-lg"><Check size={15} aria-hidden="true" />{t('Đã duyệt hết')}</span>} />

      <section className="panel">
        <div className="panel-toolbar">
          <Tabs ariaLabel={t('Trạng thái bài nộp')} value={filterStatus} onChange={setFilterStatus} options={[
            { value: 'pending', label: t('Chờ duyệt'), count: statusCounts.pending },
            { value: 'published', label: t('Đã công bố'), count: statusCounts.published },
            { value: 'all', label: t('Tất cả'), count: statusCounts.all },
          ]} />
          <div className="toolbar-controls">
            <SelectField ariaLabel={t('Lọc theo lớp')} value={filterClassId} onValueChange={changeClass} compact className="w-full sm:w-52"
              options={[{ value: 'all', label: t('Tất cả các lớp') }, ...classes.map(c => ({ value: c.id, label: c.name }))]} />
            <SelectField ariaLabel={t('Lọc theo bài tập')} value={filterAssessmentId} onValueChange={setFilterAssessmentId} compact className="w-full sm:w-60"
              options={[{ value: 'all', label: t('Tất cả bài tập') }, ...assessmentOptions.map(a => ({ value: a.id, label: a.title }))]} />
            <label className="search-field">
              <Search size={16} aria-hidden="true" />
              <input type="search" aria-label={t('Tìm học sinh')} placeholder={t('Tìm tên học sinh...')} value={query} onChange={e => setQuery(e.target.value)} />
            </label>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table min-w-[960px]">
            <thead>
              <tr>
                <th>{t('Học sinh')}</th>
                <th>{t('Bài tập')}</th>
                <th>{t('Lớp')}</th>
                <th>{t('Nộp lúc')}</th>
                <th className="text-center">{t('Tự chấm')}</th>
                <th className="text-center">{t('Điểm chốt')}</th>
                <th>{t('Trạng thái')}</th>
                <th className="text-right">{t('Thao tác')}</th>
              </tr>
            </thead>
            <tbody>
              {pager.error ? (
                <tr><td colSpan={8} className="empty-cell"><span role="alert">{pager.error}</span></td></tr>
              ) : pager.loading && !pager.data ? (
                <tr><td colSpan={8} className="empty-cell"><span>{t('Đang tải...')}</span></td></tr>
              ) : pager.total === 0 ? (
                <tr><td colSpan={8} className="empty-cell">
                  <ClipboardCheck size={28} aria-hidden="true" />
                  <span>{filterStatus === 'pending' && !query && filterAssessmentId === 'all' && filterClassId === 'all' ? t('Không còn bài nào chờ duyệt.') : t('Không có bài nộp nào khớp với bộ lọc.')}</span>
                </td></tr>
              ) : pager.pageItems.map((sub) => {
                const isPending = sub.status === 'pending_review';
                return (
                  <tr key={sub.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <StudentAvatar src={sub.studentAvatar} name={sub.studentName} className="h-9 w-9 rounded-full text-xs" />
                        <span className="whitespace-nowrap font-bold text-slate-900">{sub.studentName}</span>
                      </div>
                    </td>
                    <td className="max-w-[260px]"><span className="line-clamp-2 font-medium text-slate-800" title={sub.assessmentTitle}>{sub.assessmentTitle || t('Bài đã xóa')}</span></td>
                    <td className="max-w-[200px] truncate text-slate-600" title={sub.className}>{sub.className || '—'}</td>
                    <td className="whitespace-nowrap text-slate-600">{formatTime(sub.submittedAt, locale)}</td>
                    <td className="text-center font-semibold text-slate-700">{sub.autoScore}</td>
                    <td className="text-center font-bold">{sub.finalScore !== null ? <span className="text-emerald-600">{sub.finalScore}</span> : <span className="text-slate-400">—</span>}</td>
                    <td>{isPending ? <span className="badge badge-warning">{t('Chờ duyệt')}</span> : <span className="badge badge-success">{t('Đã công bố')}</span>}</td>
                    <td className="text-right">
                      <Button size="sm" variant={isPending ? 'primary' : 'secondary'} onClick={() => handleOpenReviewModal(sub)}>
                        {isPending ? t('Chấm bài') : t('Xem lại')}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination state={pager} unit={t('bài nộp')} />
      </section>

      {selectedSubmission && (
        <Modal
          size="lg"
          title={selectedSubmission.studentName}
          onClose={() => setSelectedSubmission(null)}
          dismissible={!publishing}
          header={<div className="flex items-center gap-3">
            <StudentAvatar src={selectedSubmission.studentAvatar} name={selectedSubmission.studentName} className="h-11 w-11 rounded-full" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">{selectedSubmission.studentName}</h2>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${selectedSubmission.status === 'pending_review' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                  {selectedSubmission.status === 'pending_review' ? t('Chờ chốt điểm') : t('Đã công bố')}
                </span>
              </div>
              <p className="truncate text-xs text-slate-700">{selectedAssessment?.title}</p>
            </div>
          </div>}
          footer={<>
            <span className="mr-auto text-xs text-slate-700">{t('Học sinh thấy điểm và nhận xét sau khi thầy cô công bố.')}</span>
            <button type="button" disabled={publishing} onClick={() => setSelectedSubmission(null)} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 disabled:opacity-50">{t('Đóng')}</button>
            <button type="button" disabled={publishing || parsedScore === null} onClick={handlePublishReview}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-700 disabled:opacity-50">
              <Send className="h-4 w-4" aria-hidden="true" />{publishing ? t('Đang lưu...') : t('Chốt điểm & công bố')}
            </button>
          </>}
        >
          <div className="space-y-6">
            <section className="space-y-4">
              <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
                <BookOpen className="h-4 w-4 text-indigo-600" aria-hidden="true" />{t('Chi tiết từng câu')}
              </h3>
              {selectedAssessment
                ? selectedAssessment.questions.map((q, idx) => <QuestionReview key={q.id} question={q} index={idx} answer={selectedSubmission.answers[q.id]} pickLabel={t('Học sinh chọn')} />)
                : <p className="text-xs text-slate-700">{t('Không tìm thấy đề của bài nộp này.')}</p>}
            </section>

            <section className="space-y-4 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-5">
              <h3 className="flex items-center gap-2 text-sm font-bold text-indigo-950"><Award className="h-4 w-4 text-indigo-600" aria-hidden="true" />{t('Chốt điểm & nhận xét')}</h3>
              {modalError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{modalError}</p>}
              {selectedAssessment?.questions.some(q => q.type === 'essay') && <p className="rounded-xl border border-indigo-200 bg-white p-3 text-xs text-indigo-900">
                {t('Bài có câu tự luận ({essay} / {total} điểm của đề). Điểm tự động chưa tính phần này — thầy cô đọc bài viết rồi nhập điểm chính thức.', {
                  essay: selectedAssessment.questions.filter(q => q.type === 'essay').reduce((s, q) => s + q.points, 0),
                  total: selectedAssessment.totalPoints,
                })}
              </p>}
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <span className="mb-1 block text-xs font-bold text-slate-700">{t('Điểm tự động')}</span>
                  <span className="text-sm font-bold text-slate-600">{selectedSubmission.autoScore} / 10</span>
                </div>
                <div className="hidden h-8 w-px bg-indigo-200 sm:block" />
                <label className="block text-xs font-bold text-indigo-950">{t('Điểm chính thức (thang 10)')}
                  <span className="mt-1 flex items-center gap-2">
                    <input type="number" inputMode="decimal" step="0.1" min="0" max="10" value={scoreInput} onChange={(e) => setScoreInput(e.target.value)}
                      aria-invalid={parsedScore === null}
                      className={`w-24 rounded-xl border-2 bg-white px-3 py-1.5 text-center text-base font-bold text-indigo-900 focus:outline-hidden ${parsedScore === null ? 'border-rose-500' : 'border-indigo-500'}`} />
                    <span className="text-xs font-normal text-slate-700">/ 10</span>
                  </span>
                </label>
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label htmlFor="review-feedback" className="block text-xs font-bold text-slate-700">{t('Nhận xét gửi học sinh')}</label>
                  <button type="button" disabled={isGeneratingAiFeedback || publishing} onClick={handleGenerateAiFeedback}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1 text-[11px] font-bold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50">
                    {isGeneratingAiFeedback
                      ? <><span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />{t('Đang soạn gợi ý...')}</>
                      : <><Sparkles className="h-3 w-3 text-amber-300" aria-hidden="true" />{t('Gợi ý nhận xét')}</>}
                  </button>
                </div>
                <textarea id="review-feedback" rows={3} value={feedbackInput} onChange={(e) => setFeedbackInput(e.target.value)}
                  placeholder={t('Viết nhận xét về điểm mạnh và điều học sinh cần cải thiện...')}
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 text-xs leading-relaxed focus:outline-hidden focus:ring-2 focus:ring-indigo-500" />
              </div>
            </section>
          </div>
        </Modal>
      )}
    </div>
  );
};
