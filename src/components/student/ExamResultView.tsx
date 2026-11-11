import React from 'react';
import { BookOpen, MessageSquare } from 'lucide-react';
import type { Assessment, Submission } from '../../types';
import { Modal } from '../ui/Modal';
import { QuestionReview } from '../ui/QuestionReview';
import { useI18n } from '../../i18n';

interface ExamResultViewProps {
  assessment: Assessment;
  submission: Submission;
  onClose: () => void;
}

export const ExamResultView: React.FC<ExamResultViewProps> = ({ assessment, submission, onClose }) => {
  const { t, locale } = useI18n();
  return <Modal size="lg" onClose={onClose} title={assessment.title} subtitle={t('Học sinh: {name}', { name: submission.studentName })}
    footer={<button type="button" onClick={onClose} className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-bold text-white hover:bg-slate-800">{t('Đóng')}</button>}>
    <div className="space-y-6">
      <div className="flex flex-col items-center justify-between gap-6 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 p-6 text-white shadow-md sm:flex-row">
        <div className="space-y-1 text-center sm:text-left">
          <span className="text-xs font-semibold uppercase tracking-wider text-indigo-200">{t('Điểm số chính thức')}</span>
          <div className="text-4xl font-extrabold sm:text-5xl">
            {submission.finalScore ?? submission.autoScore}
            <span className="text-xl font-semibold text-indigo-200"> / 10</span>
          </div>
          <p className="text-xs text-indigo-200">
            {t('Thời gian nộp: {date}', { date: new Date(submission.submittedAt).toLocaleString(locale, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) })}
          </p>
        </div>
        {submission.teacherFeedback && <div className="max-w-md space-y-1.5 rounded-2xl border border-white/20 bg-white/10 p-4 text-xs leading-relaxed">
          <div className="flex items-center gap-1.5 font-bold text-amber-300"><MessageSquare className="h-4 w-4" aria-hidden="true" />{t('Lời nhận xét của Thầy/Cô:')}</div>
          <p className="font-medium italic text-indigo-50">"{submission.teacherFeedback}"</p>
        </div>}
      </div>

      <section className="space-y-4">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><BookOpen className="h-4 w-4 text-indigo-600" aria-hidden="true" />{t('Chi tiết câu trả lời & lời giải thích')}</h3>
        {assessment.questions.map((question, index) =>
          <QuestionReview key={question.id} question={question} index={index} answer={submission.answers[question.id]} />)}
      </section>
    </div>
  </Modal>;
};
