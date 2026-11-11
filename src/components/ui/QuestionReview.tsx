import { Check, HelpCircle, PenLine, X } from 'lucide-react';
import { formatInfo } from '../../../shared/exercise-formats';
import { isChoiceQuestion, type Question } from '../../types';
import { isAnswerCorrect, isManuallyGraded, normalizeTrueFalse } from '../../utils/assessmentLogic';
import { RichText } from './RichText';
import { useI18n } from '../../i18n';

interface QuestionReviewProps {
  question: Question;
  index: number;
  answer: string | undefined;
  /** Wording for the student's own pick: "Em chọn" for students, "Học sinh chọn" for teachers. */
  pickLabel?: string;
}

const optionLetter = (index: number) => String.fromCharCode(65 + index);
const TRUE_FALSE = { T: 'Đúng (True)', F: 'Sai (False)' } as const;

/** One answered question with the key and explanation; shared by grading and result screens. */
export function QuestionReview({ question, index, answer, pickLabel }: QuestionReviewProps) {
  const { t } = useI18n();
  const pickText = pickLabel ?? t('Em chọn');
  const trueFalseLabel = (value: string | undefined) => { const v = normalizeTrueFalse(value); return v ? t(TRUE_FALSE[v]) : t('(Bỏ trống)'); };
  const manual = isManuallyGraded(question);
  const correct = isAnswerCorrect(question, answer);
  const format = formatInfo(question.format);
  const tone = manual ? 'border-indigo-200 bg-indigo-50/20' : correct ? 'border-emerald-200 bg-emerald-50/20' : 'border-rose-200 bg-rose-50/20';

  return <div className={`rounded-2xl border p-4 ${tone}`}>
    <div className="mb-2 flex items-start justify-between gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`flex h-6 w-6 items-center justify-center rounded-lg text-xs font-bold text-white ${manual ? 'bg-indigo-500' : correct ? 'bg-emerald-600' : 'bg-rose-500'}`}>{index + 1}</span>
        {format && <span className="badge badge-info">{t(format.label)}</span>}
        <span className="text-xs font-bold text-slate-800">{question.grammarTopic || t('Ngữ pháp')}</span>
      </div>
      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${manual ? 'bg-indigo-100 text-indigo-800' : correct ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
        {manual ? <PenLine className="h-3.5 w-3.5" aria-hidden="true" /> : correct ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <X className="h-3.5 w-3.5" aria-hidden="true" />}
        {manual ? t('Giáo viên chấm ({points} điểm)', { points: question.points }) : correct ? t('Đúng ({points} điểm)', { points: question.points }) : t('Chưa đúng (0 điểm)')}
      </span>
    </div>

    {question.readingPassage && <details className="mb-2 rounded-xl bg-amber-50/60 p-3 text-xs text-slate-700">
      <summary className="cursor-pointer font-bold text-amber-900">{t('Đoạn văn')}</summary>
      <p className="mt-2"><RichText text={question.readingPassage} /></p>
    </details>}
    <p className="mb-3 text-xs font-semibold text-slate-900"><RichText text={question.text} /></p>

    {isChoiceQuestion(question) ? (
      <div className="mb-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
        {question.options!.map((option, optionIndex) => {
          const letter = optionLetter(optionIndex);
          const isPicked = answer?.trim().toUpperCase().startsWith(letter);
          const isKey = question.correctAnswer.trim().toUpperCase().startsWith(letter);
          const style = isKey ? 'border-emerald-500 bg-emerald-50 font-bold text-emerald-950'
            : isPicked ? 'border-rose-400 bg-rose-50 font-bold text-rose-900' : 'border-slate-200 bg-white text-slate-700';
          return <div key={optionIndex} className={`flex items-center justify-between gap-2 rounded-xl border p-2 ${style}`}>
            <RichText text={option} className={isPicked && !isKey ? 'line-through' : ''} />
            <span className="flex shrink-0 items-center gap-1 text-[10px]">
              {isPicked && <span className="rounded bg-slate-900 px-1.5 py-0.5 font-bold text-white">{pickText}</span>}
              {isKey && <span className="rounded bg-emerald-600 px-1.5 py-0.5 font-bold text-white">{t('Đáp án đúng')}</span>}
            </span>
          </div>;
        })}
      </div>
    ) : manual ? (
      <div className="mb-3 space-y-2 text-xs">
        <div className="rounded-xl border border-indigo-200 bg-white p-3">
          <div className="mb-1 text-[11px] font-bold text-slate-600">{t('Bài làm')}</div>
          <p className="whitespace-pre-line text-slate-900">{answer?.trim() || t('(Bỏ trống)')}</p>
          {answer?.trim() && <p className="mt-2 text-[11px] text-slate-500">{t('{count} từ', { count: answer.trim().split(/\s+/).length })}</p>}
        </div>
        {question.correctAnswer && <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="mb-1 text-[11px] font-bold text-slate-600">{t('Gợi ý / bài mẫu')}</div>
          <p className="whitespace-pre-line text-slate-800">{question.correctAnswer}</p>
        </div>}
      </div>
    ) : (
      <dl className="mb-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
        <div className={`rounded-xl border p-2 ${correct ? 'border-emerald-300 bg-emerald-50' : 'border-rose-300 bg-rose-50'}`}>
          <dt className="text-[11px] text-slate-700">{t('Bài làm')}</dt>
          <dd className="font-bold text-slate-900">{question.type === 'true_false' ? trueFalseLabel(answer) : answer?.trim() || t('(Bỏ trống)')}</dd>
        </div>
        <div className="rounded-xl border border-emerald-500 bg-emerald-50 p-2">
          <dt className="text-[11px] text-slate-700">{t('Đáp án đúng')}</dt>
          <dd className="font-bold text-emerald-950">{question.type === 'true_false' ? trueFalseLabel(question.correctAnswer) : question.correctAnswer}</dd>
        </div>
      </dl>
    )}

    {question.explanation && <div className="flex items-start gap-1.5 rounded-xl bg-slate-100 p-2.5 text-[11px] text-slate-700">
      <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-600" aria-hidden="true" />
      <span><strong>{t('Giải thích:')}</strong> {question.explanation}</span>
    </div>}
  </div>;
}
