import { AlertTriangle, Check, Trash2 } from 'lucide-react';
import { EXERCISE_FORMATS, formatInfo } from '../../../shared/exercise-formats';
import { isChoiceQuestion, type ExerciseFormat, type Question, type SchoolLevel } from '../../types';
import { UnderlineInput } from '../ui/UnderlineInput';
import { SelectField } from '../ui/SelectField';
import { useI18n } from '../../i18n';

/** A question in the editor; answerSource comes from OCR and is dropped by the API on save. */
export type DraftQuestion = Question & { answerSource?: 'document' | 'inferred' };

const DEFAULT_OPTIONS = ['A. ', 'B. ', 'C. ', 'D. '];
const inputClass = 'w-full text-xs px-3 py-1.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden';

/** Format options for a level, with the level's own formats first and the rest marked. Pass t to translate the labels. */
export function formatOptions(level: SchoolLevel, t: (text: string) => string = text => text) {
  const own = EXERCISE_FORMATS.filter(f => f.levels.includes(level));
  const other = EXERCISE_FORMATS.filter(f => !f.levels.includes(level));
  return [...own.map(f => ({ value: f.value, label: t(f.label) })), ...other.map(f => ({ value: f.value, label: `${t(f.label)} (${f.levels.join('/')})` }))];
}

/** Applies a new format: switches the grading type and keeps whatever still fits. */
export function withFormat(q: DraftQuestion, format: ExerciseFormat): DraftQuestion {
  const info = formatInfo(format)!;
  const choice = info.type === 'multiple_choice' || info.type === 'reading_comprehension';
  const wasChoice = isChoiceQuestion(q);
  return {
    ...q,
    format,
    type: info.type,
    options: choice ? (q.options?.length ? q.options : DEFAULT_OPTIONS) : undefined,
    correctAnswer: info.type === q.type || (choice && wasChoice) ? q.correctAnswer
      : choice ? 'A' : info.type === 'true_false' ? 'T' : '',
    readingPassage: info.usesPassage ? q.readingPassage ?? '' : q.readingPassage,
  };
}

/** Problems that would make the API reject this question, or null. Returns the Vietnamese key; translate with t(). */
export function questionProblem(q: DraftQuestion): string | null {
  if (!q.text.trim()) return 'chưa có nội dung câu hỏi';
  if (!(q.points > 0)) return 'điểm phải lớn hơn 0';
  if (isChoiceQuestion(q)) {
    if (q.options!.length < 2) return 'cần ít nhất 2 phương án';
    if (q.options!.some(o => o.replace(/^[A-H][.)]\s*/i, '').trim() === '')) return 'còn phương án trống';
    const index = q.correctAnswer.toUpperCase().charCodeAt(0) - 65;
    if (!(index >= 0 && index < q.options!.length)) return 'chưa chọn đáp án đúng';
  } else if (q.type === 'true_false') {
    if (q.correctAnswer !== 'T' && q.correctAnswer !== 'F') return 'chưa chọn Đúng/Sai';
  } else if (q.type !== 'essay' && !q.correctAnswer.trim()) return 'chưa có đáp án đúng';
  return null;
}

interface QuestionEditorProps {
  question: DraftQuestion;
  index: number;
  level: SchoolLevel;
  onChange: (next: DraftQuestion) => void;
  onDelete: () => void;
}

export function QuestionEditor({ question: q, index, level, onChange, onDelete }: QuestionEditorProps) {
  const { t } = useI18n();
  const info = formatInfo(q.format);
  const choice = isChoiceQuestion(q);
  const update = (patch: Partial<DraftQuestion>) => onChange({ ...q, ...patch, answerSource: patch.correctAnswer !== undefined ? 'document' : q.answerSource });

  return <li className={`space-y-3 rounded-2xl border bg-white p-5 shadow-xs ${q.answerSource === 'inferred' ? 'border-amber-300' : 'border-slate-200'}`}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-xs font-bold text-white">{index + 1}</span>
        <SelectField ariaLabel={t('Dạng bài câu {n}', { n: index + 1 })} value={q.format ?? ''} placeholder={t('Chọn dạng bài')}
          onValueChange={value => onChange(withFormat(q, value as ExerciseFormat))} options={formatOptions(level, t)} compact className="w-60" />
        {q.answerSource === 'inferred' && <span className="badge badge-warning" title={t('Tài liệu không có đáp án; AI đã tự giải. Hãy kiểm tra.')}>
          <AlertTriangle size={12} aria-hidden="true" />{t('AI tự giải – cần kiểm tra')}
        </span>}
      </div>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1 text-xs text-slate-700">{t('Điểm')}
          <input type="number" step={0.25} min={0.25} value={q.points} onChange={e => update({ points: Number(e.target.value) || 0 })}
            className="w-16 rounded-md border border-slate-300 px-1.5 py-0.5 text-center text-xs font-bold" />
        </label>
        <button type="button" onClick={onDelete} aria-label={t('Xóa câu {n}', { n: index + 1 })} title={t('Xóa câu này')} className="icon-btn icon-btn-danger"><Trash2 size={16} aria-hidden="true" /></button>
      </div>
    </div>
    {info && <p className="text-[11px] italic text-indigo-700">{t(info.instruction)}</p>}

    {(info?.usesPassage || q.readingPassage !== undefined) && <div className="text-[11px] font-bold text-slate-700">{t('Đoạn văn')}
      <UnderlineInput multiline ariaLabel={t('Đoạn văn câu {n}', { n: index + 1 })} value={q.readingPassage || ''} onChange={readingPassage => update({ readingPassage })} className="mt-1 is-passage" />
    </div>}

    <div className="text-[11px] font-bold text-slate-700">{t('Nội dung câu hỏi')}
      <UnderlineInput multiline ariaLabel={t('Nội dung câu {n}', { n: index + 1 })} value={q.text} onChange={text => update({ text })} className="mt-1" />
    </div>

    {choice && <fieldset>
      <legend className="mb-1.5 text-[11px] font-bold text-slate-700">{t('Các phương án (bấm chữ cái để chọn đáp án đúng)')}</legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {q.options!.map((option, optIdx) => {
          const letter = String.fromCharCode(65 + optIdx);
          const isKey = q.correctAnswer.toUpperCase().startsWith(letter);
          return <div key={optIdx} className={`flex items-center gap-2 rounded-xl border-2 p-2 transition-colors ${isKey ? 'border-emerald-500 bg-emerald-50/70' : 'border-slate-200 bg-slate-50/60'}`}>
            <button type="button" onClick={() => update({ correctAnswer: letter })} aria-pressed={isKey} aria-label={t('Đặt {letter} là đáp án đúng của câu {n}', { letter, n: index + 1 })}
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${isKey ? 'bg-emerald-600 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:border-emerald-500'}`}>
              {isKey ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : letter}
            </button>
            <UnderlineInput ariaLabel={t('Phương án {letter} câu {n}', { letter, n: index + 1 })} value={option} className="is-bare min-w-0 flex-1"
              onChange={value => update({ options: q.options!.map((o, i) => i === optIdx ? value : o) })} />
          </div>;
        })}
      </div>
    </fieldset>}

    {q.type === 'true_false' && <div className="flex items-center gap-2 text-[11px] font-bold text-slate-700">{t('Đáp án đúng:')}
      {(['T', 'F'] as const).map(value => <button key={value} type="button" aria-pressed={q.correctAnswer === value} onClick={() => update({ correctAnswer: value })}
        className={`rounded-lg border-2 px-3 py-1 text-xs ${q.correctAnswer === value ? 'border-emerald-500 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white text-slate-600'}`}>
        {value === 'T' ? t('Đúng (True)') : t('Sai (False)')}
      </button>)}
    </div>}

    {q.type === 'essay' && <label className="block text-[11px] font-bold text-slate-700">{t('Gợi ý chấm / bài mẫu (học sinh chỉ thấy sau khi được duyệt)')}
      <textarea rows={3} value={q.correctAnswer} onChange={e => update({ correctAnswer: e.target.value })} className={`mt-1 ${inputClass}`} />
    </label>}

    {!choice && q.type !== 'true_false' && q.type !== 'essay' && <label className="block text-[11px] font-bold text-slate-700">{t('Đáp án đúng (nhiều đáp án chấp nhận được thì ngăn cách bằng / hoặc ;)')}
      <input type="text" value={q.correctAnswer} onChange={e => update({ correctAnswer: e.target.value })} className={`mt-1 ${inputClass}`} />
    </label>}


    <div className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-2 md:grid-cols-2">
      <label className="block text-[11px] font-bold text-slate-700">{t('Chủ điểm kiến thức')}
        <input type="text" value={q.grammarTopic} placeholder={t('Ví dụ: Passive Voice')} onChange={e => update({ grammarTopic: e.target.value })} className={`mt-1 ${inputClass}`} />
      </label>
      <label className="block text-[11px] font-bold text-slate-700">{t('Giải thích (học sinh xem sau khi được duyệt)')}
        <input type="text" value={q.explanation} onChange={e => update({ explanation: e.target.value })} className={`mt-1 ${inputClass}`} />
      </label>
    </div>
  </li>;
}
