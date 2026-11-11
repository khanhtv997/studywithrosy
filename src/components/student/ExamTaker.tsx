import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { isChoiceQuestion, type Assessment, type Question } from '../../types';
import { Modal } from '../ui/Modal';
import { RichText } from '../ui/RichText';
import { formatInfo } from '../../../shared/exercise-formats';
import {
  Clock,
  Bookmark,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Send,
  HelpCircle,
  BookOpen,
  Check,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Eye, RotateCcw } from 'lucide-react';
import { gradeSubmission, isManuallyGraded } from '../../utils/assessmentLogic';
import { QuestionReview } from '../ui/QuestionReview';
import { useI18n } from '../../i18n';

/** What a teacher sees after a preview "submission": the automatic score and every question checked. */
function PreviewResult({ assessment, answers, onRestart, onExit }: { assessment: Assessment; answers: Record<string, string>; onRestart: () => void; onExit: () => void }) {
  const { t } = useI18n();
  const result = gradeSubmission(assessment.questions, answers);
  const essays = assessment.questions.filter(isManuallyGraded);
  const gradable = assessment.questions.length - essays.length;
  return <div className="mx-auto w-full max-w-6xl space-y-6 py-6">
    <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-200 px-3 py-1 text-xs font-bold text-amber-900"><Eye className="h-3.5 w-3.5" aria-hidden="true" />{t('Kết quả nộp thử – không được lưu')}</span>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{assessment.title}</h2>
          <p className="mt-1 text-sm text-slate-700">{t('Đúng {correct} / {total} câu chấm tự động', { correct: result.correctTotal, total: gradable })}{essays.length ? ` · ${t('{count} câu tự luận giáo viên chấm', { count: essays.length })}` : ''}</p>
        </div>
        <div className="text-right">
          <div className="text-4xl font-extrabold text-indigo-700">{result.autoScore}<span className="text-lg text-slate-500"> / 10</span></div>
          <div className="text-xs text-slate-600">{t('Điểm tự động')}</div>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-600">{t('Học sinh thật sẽ không thấy điểm và đáp án cho tới khi thầy cô duyệt bài.')}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={onRestart} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50"><RotateCcw className="h-4 w-4" aria-hidden="true" />{t('Làm lại từ đầu')}</button>
        <button type="button" onClick={onExit} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800">{t('Thoát xem trước')}</button>
      </div>
    </div>
    <div className="space-y-4">
      {assessment.questions.map((q, i) => <QuestionReview key={q.id} question={q} index={i} answer={answers[q.id]} pickLabel={t('Đã chọn')} />)}
    </div>
  </div>;
}

interface ExamTakerProps {
  assessment: Assessment;
  onExit: () => void;
  onCompleted: () => void;
  /** Teacher preview: nothing is sent to the server; submitting grades locally and shows the result. */
  preview?: boolean;
}

export const ExamTaker: React.FC<ExamTakerProps> = ({ assessment, onExit, onCompleted, preview = false }) => {
  const { submitAssessment, activeStudent } = useApp();
  const { t, locale } = useI18n();
  const [previewResult, setPreviewResult] = useState<Record<string, string> | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flaggedQuestions, setFlaggedQuestions] = useState<Record<string, boolean>>({});
  const [secondsRemaining, setSecondsRemaining] = useState(
    assessment.durationMinutes > 0 ? assessment.durationMinutes * 60 : 3600
  );
  const [timeSpentSeconds, setTimeSpentSeconds] = useState(0);
  const answersRef = useRef(answers);
  const timeSpentRef = useRef(timeSpentSeconds);
  const submittingRef = useRef(false);
  answersRef.current = answers;
  timeSpentRef.current = timeSpentSeconds;

  // Submit confirmation modal & Success state
  const [isConfirmSubmitOpen, setIsConfirmSubmitOpen] = useState(false);
  const [isSubmittedSuccess, setIsSubmittedSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Timer countdown
  useEffect(() => {
    if (isSubmittedSuccess) return;

    const timer = setInterval(() => {
      setTimeSpentSeconds((prev) => prev + 1);
      if (assessment.durationMinutes > 0) {
        setSecondsRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            handleAutoSubmit();
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [assessment.durationMinutes, isSubmittedSuccess]);

  // A reload or closed tab would lose every answer; ask the browser to confirm first.
  useEffect(() => {
    if (preview || isSubmittedSuccess) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (Object.values(answersRef.current).some(value => value.trim())) event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [preview, isSubmittedSuccess]);

  const questions = assessment.questions || [];
  const currentQuestion: Question | undefined = questions[currentIndex];

  const handleAnswer = (value: string) => {
    if (!currentQuestion) return;
    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: value,
    }));
  };

  const handleExit = () => {
    if (!preview && answeredCount > 0 && !window.confirm(t('Thoát bây giờ sẽ mất các câu trả lời chưa nộp. Em vẫn muốn thoát?'))) return;
    onExit();
  };

  const handleToggleFlag = () => {
    if (!currentQuestion) return;
    setFlaggedQuestions((prev) => ({
      ...prev,
      [currentQuestion.id]: !prev[currentQuestion.id],
    }));
  };

  const handleAutoSubmit = () => {
    performSubmission();
  };

  const performSubmission = async () => {
    if (preview) {
      // Grade with the same function the server uses, without saving anything.
      setPreviewResult({ ...answersRef.current });
      setIsConfirmSubmitOpen(false);
      window.scrollTo({ top: 0 });
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try { await submitAssessment(assessment.id, answersRef.current, timeSpentRef.current); }
    catch (error) {
      submittingRef.current = false;
      setSubmitting(false);
      // Keep the answers and let the student retry, also after an automatic submit at time-out.
      setSubmitError(error instanceof Error ? error.message : t('Không nộp được bài. Em hãy thử lại.'));
      setIsConfirmSubmitOpen(true);
      return;
    }
    setSubmitting(false);
    setIsSubmittedSuccess(true);
    setIsConfirmSubmitOpen(false);

    confetti({
      particleCount: 100,
      spread: 80,
      origin: { y: 0.6 },
    });
  };

  const answeredCount = Object.values(answers).filter((value) => value.trim() !== '').length;
  const unansweredCount = questions.length - answeredCount;

  // Format countdown string
  /** One numbered square for jumping to a question; used by the top strip and the side panel. */
  const paletteButton = (q: Question, idx: number, large = false) => {
    const isCurrent = idx === currentIndex;
    const hasAnswer = !!answers[q.id]?.trim();
    const isFlagged = !!flaggedQuestions[q.id];
    const style = isCurrent ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs font-bold ring-2 ring-indigo-300'
      : isFlagged ? 'bg-amber-100 border-amber-300 text-amber-900 font-bold'
      : hasAnswer ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-semibold'
      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100';
    return <button key={q.id} type="button"
      aria-label={[t('Câu {number}', { number: idx + 1 }), hasAnswer && t('đã trả lời'), isFlagged && t('cần xem lại')].filter(Boolean).join(', ')}
      aria-current={isCurrent ? 'step' : undefined}
      onClick={() => setCurrentIndex(idx)}
      className={`${large ? 'h-9 w-full' : 'w-8 h-8 shrink-0'} rounded-lg border text-xs flex items-center justify-center relative transition-all cursor-pointer ${style}`}>
      {idx + 1}
      {isFlagged && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-500 ring-1 ring-white" />}
    </button>;
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const restartPreview = () => {
    setAnswers({});
    setFlaggedQuestions({});
    setCurrentIndex(0);
    setTimeSpentSeconds(0);
    setSecondsRemaining(assessment.durationMinutes > 0 ? assessment.durationMinutes * 60 : 3600);
    setPreviewResult(null);
  };

  if (preview && previewResult) {
    return <PreviewResult assessment={assessment} answers={previewResult} onRestart={restartPreview} onExit={onExit} />;
  }

  if (isSubmittedSuccess) {
    return (
      <div className="max-w-2xl mx-auto my-12 p-8 bg-white rounded-3xl border border-slate-200 shadow-xl text-center space-y-6 animate-in zoom-in-95 duration-200">
        <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto shadow-md shadow-emerald-500/20">
          <CheckCircle className="w-10 h-10" />
        </div>

        <div>
          <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 mb-2">
            ⏳ {t('Đang chờ Giáo viên duyệt điểm')}
          </span>
          <h2 className="text-2xl font-bold text-slate-900">
            {t('Đã nộp bài thành công!')}
          </h2>
          <p className="text-sm text-slate-700 mt-2 max-w-md mx-auto leading-relaxed">
            {t('Hệ thống đã ghi nhận toàn bộ bài làm của em ({answered}/{total} câu) vào lúc {time}.', { answered: answeredCount, total: questions.length, time: new Date().toLocaleTimeString(locale) })}
          </p>
        </div>

        {/* Notice of teacher review workflow */}
        <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-100 text-left text-xs text-indigo-900 space-y-2">
          <div className="font-bold flex items-center gap-1.5 text-indigo-950">
            <HelpCircle className="w-4 h-4 text-indigo-600" />
            {t('Quy trình chấm thi & công bố kết quả:')}
          </div>
          <p className="leading-relaxed">
            {t('Bài làm của em đã được hệ thống tự động ghi nhận. Thầy/Cô sẽ trực tiếp xem lại bài thi, chốt điểm số chính thức và viết lời nhận xét chi tiết cho em.')}
          </p>
          <p className="font-semibold text-indigo-700">
            👉 {t('Em sẽ thấy thông báo điểm số kèm lời phê của thầy cô ngay trên bảng điều khiển học sinh sau khi được duyệt!')}
          </p>
        </div>

        <button
          onClick={onCompleted}
          className="px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-md cursor-pointer transition-colors"
        >
          {t('Trở về Bảng điều khiển Học sinh')}
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100/70 pb-16">
      {preview && <div role="status" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-100 px-4 py-2 text-center text-xs font-semibold text-amber-900">
        <Eye className="h-4 w-4" aria-hidden="true" />
        {t('Chế độ xem trước: đây là màn học sinh sẽ thấy. Bài làm không được lưu; bấm "Nộp bài" để xem thử điểm và đáp án.')}
      </div>}
      {/* Top Bar (Pear Deck / Assessment style) */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-xs">
        <div className="w-full px-3 sm:px-6 lg:px-8 min-h-16 py-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          
          {/* Back button & Title */}
          <div className="flex min-w-0 w-full items-center gap-3 sm:w-auto sm:flex-1">
            <button
              type="button"
              onClick={handleExit}
              className="p-2 rounded-xl text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
              title={preview ? t('Thoát xem trước') : t('Thoát màn làm bài')}
              aria-label={preview ? t('Thoát xem trước') : t('Thoát màn làm bài')}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                {assessment.title}
              </h1>
              <div className="flex items-center gap-2 whitespace-nowrap text-[11px] text-slate-700 font-medium">
                <span>{preview ? t('Xem trước với vai trò học sinh') : t('Học sinh: {name}', { name: activeStudent?.name ?? '' })}</span>
                <span>•</span>
                <span>{t('Câu {number} / {total}', { number: currentIndex + 1, total: questions.length })}</span>
              </div>
            </div>
          </div>

          {/* Center Timer Countdown */}
          {assessment.durationMinutes > 0 ? (
            <div
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                secondsRemaining < 300
                  ? 'bg-rose-50 border-rose-300 text-rose-700 animate-pulse'
                  : 'bg-slate-50 border-slate-200 text-slate-800'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>{formatTime(secondsRemaining)}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-xl border border-emerald-200">
              <span>{t('Bài tự luyện (Không giới hạn)')}</span>
            </div>
          )}

          {/* Flag button & Submit button */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleFlag}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                flaggedQuestions[currentQuestion?.id || '']
                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              <Bookmark
                className={`w-3.5 h-3.5 ${
                  flaggedQuestions[currentQuestion?.id || '']
                    ? 'fill-amber-500 text-amber-500'
                    : ''
                }`}
              />
              <span className="hidden sm:inline">{t('Xem lại')}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsConfirmSubmitOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs cursor-pointer transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{t('Nộp bài')}</span>
            </button>
          </div>
        </div>

        {/* Question Palette Navigation Strip */}
        <div className="bg-slate-50/90 border-t border-slate-200/80 px-3 sm:px-6 py-2 overflow-x-auto no-scrollbar xl:hidden">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider shrink-0 mr-1">
              {t('Câu hỏi:')}
            </span>
            {questions.map((q, idx) => paletteButton(q, idx))}
          </div>
        </div>
      </header>

      {/* Main Examination Canvas */}
      <main className="mx-auto w-full max-w-[1680px] px-3 sm:px-6 lg:px-8 pt-4 sm:pt-6 xl:grid xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start xl:gap-6">
        {currentQuestion && (
          <div className="min-w-0 bg-white rounded-3xl p-4 sm:p-6 lg:p-8 border border-slate-200 shadow-sm space-y-6">
            
            {/* Question Header */}
            <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-100">
              <div className="flex flex-wrap items-center gap-2">
                <span className="whitespace-nowrap px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-bold text-xs">
                  {t('Câu hỏi {number} / {total}', { number: currentIndex + 1, total: questions.length })}
                </span>
                {formatInfo(currentQuestion.format) && <span className="badge badge-info">{t(formatInfo(currentQuestion.format)!.label)}</span>}
              </div>

              <span className="whitespace-nowrap text-xs font-bold text-slate-700">
                {t('{count} điểm', { count: currentQuestion.points })}
              </span>
            </div>

            <div className={currentQuestion.readingPassage ? 'space-y-6 xl:grid xl:grid-cols-2 xl:items-start xl:gap-8 xl:space-y-0' : ''}>
            {/* Reading Passage if available: beside the question on wide screens, above it on phones */}
            {currentQuestion.readingPassage && (
              <div className="p-4 sm:p-5 rounded-2xl bg-amber-50/50 border border-amber-200/80 text-sm text-slate-800 leading-relaxed font-serif xl:sticky xl:top-40 xl:max-h-[calc(100vh-12rem)] xl:overflow-y-auto">
                <div className="font-sans font-bold text-[11px] text-amber-900 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5" /> {t('Đoạn văn đọc hiểu:')}
                </div>
                <RichText text={currentQuestion.readingPassage} />
              </div>
            )}
            <div className="min-w-0 space-y-6">

            {/* What the student has to do, worded as on Vietnamese test papers */}
            {formatInfo(currentQuestion.format) && (
              <p className="text-xs font-semibold italic text-indigo-700">{t(formatInfo(currentQuestion.format)!.instruction)}</p>
            )}

            {/* Question Stem Text */}
            <div className="text-base sm:text-lg font-bold text-slate-900 leading-relaxed">
              <RichText text={currentQuestion.text} />
            </div>

            {/* Options Interactive Picker */}
            {currentQuestion.type === 'true_false' && (
              <div className="grid grid-cols-2 gap-3 pt-2" role="radiogroup" aria-label={t('Đúng hay sai')}>
                {(['T', 'F'] as const).map(value => {
                  const selected = answers[currentQuestion.id] === value;
                  return <button key={value} type="button" role="radio" aria-checked={selected} onClick={() => handleAnswer(value)}
                    className={`rounded-2xl border-2 p-4 text-sm font-bold transition-all ${selected
                      ? value === 'T' ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-rose-500 bg-rose-50 text-rose-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}>
                    {value === 'T' ? t('Đúng (True)') : t('Sai (False)')}
                  </button>;
                })}
              </div>
            )}

            {currentQuestion.type === 'essay' && (
              <div className="space-y-1.5 pt-2">
                <label htmlFor={`answer-${currentQuestion.id}`} className="block text-xs font-bold text-slate-700">{t('Bài viết của em')}</label>
                <textarea
                  id={`answer-${currentQuestion.id}`}
                  rows={10}
                  value={answers[currentQuestion.id] || ''}
                  onChange={(e) => handleAnswer(e.target.value)}
                  placeholder={t('Viết bài của em ở đây...')}
                  className="w-full rounded-2xl border-2 border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-900 focus:border-indigo-500 focus:outline-hidden"
                />
                <p className="text-right text-xs text-slate-500">{t('{count} từ', { count: (answers[currentQuestion.id] || '').trim() ? (answers[currentQuestion.id] || '').trim().split(/\s+/).length : 0 })}</p>
              </div>
            )}

            {!isChoiceQuestion(currentQuestion) && currentQuestion.type !== 'true_false' && currentQuestion.type !== 'essay' && (
              <div className="space-y-1.5 pt-2">
                <label htmlFor={`answer-${currentQuestion.id}`} className="block text-xs font-bold text-slate-700">
                  {currentQuestion.type === 'sentence_transformation' ? t('Viết lại câu của em') : t('Câu trả lời của em')}
                </label>
                <textarea
                  id={`answer-${currentQuestion.id}`}
                  rows={currentQuestion.type === 'sentence_transformation' ? 3 : 2}
                  value={answers[currentQuestion.id] || ''}
                  onChange={(e) => handleAnswer(e.target.value)}
                  placeholder={t('Nhập câu trả lời...')}
                  className="w-full rounded-2xl border-2 border-slate-200 bg-white p-4 text-sm font-medium text-slate-900 focus:border-indigo-500 focus:outline-hidden"
                />
              </div>
            )}

            {isChoiceQuestion(currentQuestion) && (
              <div className={`grid gap-3 pt-2 ${!currentQuestion.readingPassage && currentQuestion.options!.every(o => o.length <= 48) ? 'md:grid-cols-2' : ''}`} role="radiogroup" aria-label={t('Các phương án')}>
                {currentQuestion.options!.map((option, optIdx) => {
                  const letter = String.fromCharCode(65 + optIdx); // A, B, C, D
                  const isSelected = answers[currentQuestion.id]?.toUpperCase().startsWith(letter);

                  return (
                    <button
                      key={optIdx}
                      type="button"
                      role="radio"
                      aria-checked={!!isSelected}
                      onClick={() => handleAnswer(letter)}
                      className={`w-full text-left p-4 rounded-2xl border-2 transition-all flex items-center gap-3.5 cursor-pointer ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50/70 shadow-xs'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/60 bg-white'
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 transition-colors ${
                          isSelected
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'border border-slate-300 text-slate-700 bg-slate-50'
                        }`}
                      >
                        {isSelected ? <Check className="w-4 h-4" /> : letter}
                      </div>

                      <span
                        className={`text-sm ${
                          isSelected ? 'font-bold text-indigo-950' : 'font-medium text-slate-800'
                        }`}
                      >
                        <RichText text={option} />
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            </div>
            </div>

            {/* Navigation buttons: Prev / Next */}
            <div className="flex items-center justify-between gap-2 pt-6 border-t border-slate-100">
              <button
                type="button"
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                className="inline-flex items-center gap-2 whitespace-nowrap px-3 sm:px-4 py-2 rounded-xl border border-slate-300 hover:bg-slate-100 disabled:opacity-40 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>{t('Câu trước')}</span>
              </button>

              <div className="hidden sm:block text-xs text-slate-700 font-medium">
                {t('Đã trả lời {answered} / {total} câu', { answered: answeredCount, total: questions.length })}
              </div>

              {currentIndex < questions.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))}
                  className="inline-flex items-center gap-2 whitespace-nowrap px-4 sm:px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  <span>{t('Câu tiếp theo')}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsConfirmSubmitOpen(true)}
                  className="inline-flex items-center gap-2 whitespace-nowrap px-4 sm:px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>{t('Hoàn tất & Nộp bài')}</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Wide screens: progress and the full question grid stay in view beside the question. */}
        <aside className="hidden xl:block xl:sticky xl:top-40 space-y-4" aria-label={t('Tiến độ làm bài')}>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-bold text-slate-900">{t('Tiến độ')}</span>
              <span className="text-xs font-semibold text-slate-600">{t('{answered} / {total} câu', { answered: answeredCount, total: questions.length })}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={answeredCount}>
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${questions.length ? answeredCount / questions.length * 100 : 0}%` }} />
            </div>
            <div className="mt-4 grid max-h-[calc(100vh-24rem)] grid-cols-6 gap-1.5 overflow-y-auto p-0.5">
              {questions.map((q, idx) => paletteButton(q, idx, true))}
            </div>
            <ul className="mt-4 space-y-1.5 text-[11px] text-slate-600">
              <li className="flex items-center gap-2"><span className="h-3 w-3 rounded border border-emerald-300 bg-emerald-50" />{t('Đã trả lời')}</li>
              <li className="flex items-center gap-2"><span className="h-3 w-3 rounded border border-amber-300 bg-amber-100" />{t('Đánh dấu xem lại')}</li>
              <li className="flex items-center gap-2"><span className="h-3 w-3 rounded border border-slate-200 bg-white" />{t('Chưa làm')}</li>
            </ul>
            <button type="button" onClick={() => setIsConfirmSubmitOpen(true)}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700">
              <Send className="h-4 w-4" aria-hidden="true" />{t('Nộp bài')}
            </button>
          </div>
        </aside>
      </main>

      {/* Confirmation before submitting */}
      {isConfirmSubmitOpen && (
        <Modal
          title={t('Xác nhận nộp bài')}
          onClose={() => setIsConfirmSubmitOpen(false)}
          dismissible={!submitting}
          footer={<>
            <button type="button" disabled={submitting} onClick={() => setIsConfirmSubmitOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 disabled:opacity-50">
              {t('Tiếp tục làm bài')}
            </button>
            <button type="button" disabled={submitting} onClick={performSubmission}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-bold shadow-xs">
              {submitting ? t('Đang nộp...') : submitError ? t('Thử nộp lại') : t('Xác nhận nộp ngay')}
            </button>
          </>}
        >
          <div className="space-y-3 text-xs text-slate-700">
            {submitError && <p role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800">{submitError}</p>}
            <p>{t('Em đã trả lời {answered} / {total} câu hỏi.', { answered: answeredCount, total: questions.length })}</p>
            {unansweredCount > 0 && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
                <span><strong>{t('Còn {count} câu chưa làm.', { count: unansweredCount })}</strong> {t('Em có chắc chắn muốn nộp bài bây giờ không?')}</span>
              </div>
            )}
            <p className="text-[11px] text-slate-700">
              {t('Sau khi nộp, hệ thống tự chấm và chờ thầy cô duyệt trước khi công bố kết quả.')}
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
};
