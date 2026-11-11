import React, { useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { AlertCircle, BookOpen, CheckCircle, FileCheck2, FilePenLine, FileText, FileUp, Plus, Sparkles } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { eduApi } from '../../api/client';
import { formatInfo, levelFromGrade } from '../../../shared/exercise-formats';
import type { Assessment, ExerciseFormat, SchoolLevel } from '../../types';
import { Link } from 'react-router';
import { ArrowLeft, Eye } from 'lucide-react';
import { PageHeader } from '../ui/PageHeader';
import { ExamTaker } from '../student/ExamTaker';
import { SelectField } from '../ui/SelectField';
import { ClassMultiSelect } from '../ui/ClassMultiSelect';
import { formatOptions, QuestionEditor, questionProblem, withFormat, type DraftQuestion } from './QuestionEditor';
import { OcrProgress } from './OcrProgress';
import { useI18n } from '../../i18n';

interface AssessmentComposerProps {
  onCancel: () => void;
  onCreated: (assessmentId: string) => void;
}

// Gemini accepts about 20 MB per request; base64 adds a third, so keep files under 12 MB.
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const ACCEPTED = ['image/', 'application/pdf', DOCX_MIME, 'text/plain'];

/** Value for <input type="datetime-local"> in the user's own time zone. */
function toLocalInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const readAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

/** Windows often reports .docx with an empty type; fall back to the extension. */
function mimeOf(file: File) {
  if (file.type) return file.type;
  if (/\.docx$/i.test(file.name)) return DOCX_MIME;
  if (/\.txt$/i.test(file.name)) return 'text/plain';
  return '';
}

/** Returns the first problem that would make the API reject the exam, or null. */
function findProblem(title: string, classIds: string[], publishing: boolean, dueDate: string, questions: DraftQuestion[], t: (text: string, vars?: Record<string, string | number>) => string): string | null {
  if (!title.trim()) return t('Hãy nhập tiêu đề bài.');
  if (publishing && !classIds.length) return t('Hãy chọn ít nhất một lớp được giao bài.');
  if (!dueDate || Number.isNaN(new Date(dueDate).getTime())) return t('Hạn nộp chưa hợp lệ.');
  if (!questions.length) return t('Đề chưa có câu hỏi nào.');
  for (const [index, q] of questions.entries()) {
    const problem = questionProblem(q);
    if (problem) return t('Câu {n}: {problem}.', { n: index + 1, problem: t(problem) });
  }
  return null;
}

let newQuestionCounter = 0;

/** Full page for creating an assessment: upload a document for OCR or write questions by hand. */
export const AssessmentComposer: React.FC<AssessmentComposerProps> = ({ onCancel, onCreated }) => {
  const { classes, selectedClassId, createAssessment } = useApp();
  const { t } = useI18n();

  const [step, setStep] = useState<'input' | 'preview'>('input');
  const [isLoadingOcr, setIsLoadingOcr] = useState(false);
  const ocrAbort = useRef<AbortController | null>(null);
  // Leaving the page cancels a running analysis.
  useEffect(() => () => ocrAbort.current?.abort(), []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);

  const [examText, setExamText] = useState('');
  const [file, setFile] = useState<{ name: string; type: string; dataUrl: string } | null>(null);

  const [title, setTitle] = useState('');
  const [type, setType] = useState<Assessment['type']>('exam');
  const [targetClassIds, setTargetClassIds] = useState<string[]>(() => {
    const initial = selectedClassId && classes.some(c => c.id === selectedClassId) ? selectedClassId : classes[0]?.id;
    return initial ? [initial] : [];
  });
  const [level, setLevel] = useState<SchoolLevel>(() => levelFromGrade(classes.find(c => c.id === (selectedClassId || classes[0]?.id))?.grade));
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [dueDate, setDueDate] = useState(() => toLocalInput(new Date(Date.now() + 14 * 86400000)));
  const [description, setDescription] = useState(() => t('Bài làm được chấm tự động. Thầy cô sẽ duyệt kết quả và gửi nhận xét cho từng em.'));
  const [questions, setQuestions] = useState<DraftQuestion[]>([]);
  const [newFormat, setNewFormat] = useState<ExerciseFormat>('grammar_vocab');
  const [previewing, setPreviewing] = useState(false);

  const changeClasses = (ids: string[]) => {
    // The first class picked sets the school level; the teacher can still change it.
    if (ids[0] && ids[0] !== targetClassIds[0]) setLevel(levelFromGrade(classes.find(c => c.id === ids[0])?.grade));
    setTargetClassIds(ids);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = '';
    if (!picked) return;
    const mime = mimeOf(picked);
    if (!ACCEPTED.some(type => mime.startsWith(type))) { setError(t('Chỉ hỗ trợ ảnh (PNG, JPG), PDF, Word (.docx) hoặc .txt. Tệp .doc cũ hãy lưu lại thành .docx.')); return; }
    if (picked.size > MAX_FILE_BYTES) { setError(t('Tệp lớn hơn 12 MB. Hãy tách đề thành nhiều phần hoặc giảm độ phân giải ảnh.')); return; }
    try {
      setFile({ name: picked.name, type: mime, dataUrl: await readAsDataUrl(picked) });
      setError(null);
    } catch { setError(t('Không đọc được tệp đã chọn.')); }
  };

  const handleStartOcr = async () => {
    if (!examText.trim() && !file) { setError(t('Hãy dán nội dung đề hoặc tải tệp lên.')); return; }
    setIsLoadingOcr(true);
    setError(null);
    const controller = new AbortController();
    ocrAbort.current = controller;
    try {
      const result = await eduApi.ocr({
        rawText: examText.trim() || undefined,
        imageBase64: file?.dataUrl,
        mimeType: file?.type,
        examTitle: title || undefined,
        gradeLevel: classes.find(c => c.id === targetClassIds[0])?.grade,
        level,
      }, controller.signal);
      if (!result.data.questions.length) throw new Error(t('Không tìm thấy câu hỏi nào trong đề.'));
      if (result.data.title) setTitle(result.data.title);
      setQuestions(result.data.questions);
      setSource(result.source);
      setStep('preview');
    } catch (err) {
      if (controller.signal.aborted) return; // cancelled by the teacher: no error to show
      setError(err instanceof Error ? err.message : t('Đã xảy ra lỗi khi tách câu hỏi.'));
    } finally {
      if (ocrAbort.current === controller) ocrAbort.current = null;
      setIsLoadingOcr(false);
    }
  };
  const cancelOcr = () => { ocrAbort.current?.abort(); setIsLoadingOcr(false); };

  const startManual = () => {
    setQuestions([]);
    setSource(null);
    setError(null);
    setStep('preview');
  };

  const addQuestion = () => setQuestions(prev => {
    const info = formatInfo(newFormat)!;
    // Passage formats usually continue the previous passage, so reuse it.
    const previousPassage = info.usesPassage ? [...prev].reverse().find(q => q.readingPassage)?.readingPassage : undefined;
    const draft: DraftQuestion = {
      id: `q-new-${Date.now()}-${++newQuestionCounter}`, order: prev.length + 1, type: info.type, format: info.value,
      text: info.template.text, options: info.template.options, correctAnswer: info.template.correctAnswer,
      grammarTopic: info.template.grammarTopic, explanation: info.template.explanation ?? '', points: 1,
      readingPassage: info.usesPassage ? previousPassage ?? info.template.readingPassage ?? '' : undefined,
    };
    return [...prev, withFormat(draft, info.value)];
  });

  const save = async (status: Assessment['status']) => {
    const problem = findProblem(title, targetClassIds, status === 'published', dueDate, questions, t);
    if (problem) { setError(problem); return; }
    setSaving(true);
    setError(null);
    try {
      const created = await createAssessment({
        title: title.trim(),
        type,
        subject: 'english',
        level,
        classIds: targetClassIds,
        description,
        durationMinutes: type === 'exam' ? durationMinutes : 0,
        dueDate: new Date(dueDate).toISOString(),
        // answerSource is editor-only; drop it before saving.
        questions: questions.map(({ answerSource: _source, ...q }, i) => ({ ...q, order: i + 1 })),
        status,
      });
      if (status === 'published') confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
      onCreated(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Không lưu được đề.'));
      setSaving(false);
    }
  };

  const busy = isLoadingOcr || saving;
  const inferredCount = questions.filter(q => q.answerSource === 'inferred').length;
  const targetNames = classes.filter(c => targetClassIds.includes(c.id)).map(c => c.name);
  const publishLabel = targetNames.length === 0 ? t('Giao bài') : targetNames.length <= 2
    ? t('Giao cho {className}', { className: targetNames.join(', ') }) : t('Giao cho {count} lớp', { count: targetNames.length });
  const inputClass = 'w-full text-xs px-3 py-1.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden';

  const dirty = questions.length > 0 || examText.trim() !== '' || file !== null;
  // Warn before a reload or tab close would throw away an exam in progress.
  useEffect(() => {
    if (!dirty || saving) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty, saving]);
  const cancel = () => {
    if (dirty && !window.confirm(t('Bỏ đề đang soạn? Nội dung chưa lưu sẽ mất.'))) return;
    onCancel();
  };

  const steps = <ol className="composer-steps" aria-label={t('Các bước')}>
    <li className={step === 'input' ? 'is-current' : 'is-done'} aria-current={step === 'input' ? 'step' : undefined}><span>1</span>{t('Nguồn đề')}</li>
    <li className={step === 'preview' ? 'is-current' : ''} aria-current={step === 'preview' ? 'step' : undefined}><span>2</span>{t('Soạn & giao bài')}</li>
  </ol>;

  const footer = <>
    {step === 'preview' && <button type="button" disabled={busy} onClick={() => { setStep('input'); setError(null); }}
      className="mr-auto px-4 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 disabled:opacity-50">← {t('Quay lại')}</button>}
    <button type="button" disabled={busy} onClick={cancel} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 disabled:opacity-50">{t('Hủy bỏ')}</button>
    {step === 'input' ? <>
      <button type="button" disabled={busy} onClick={startManual}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-800 hover:bg-slate-100 disabled:opacity-50">
        <FilePenLine className="h-4 w-4" aria-hidden="true" />{t('Soạn thủ công')}
      </button>
      <button type="button" disabled={busy} onClick={handleStartOcr}
        className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-indigo-600/20 hover:bg-indigo-700 disabled:opacity-50">
        {isLoadingOcr ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />{t('Đang đọc đề...')}</>
          : <><Sparkles className="h-4 w-4 text-amber-300" aria-hidden="true" />{t('Tách câu hỏi bằng AI')}</>}
      </button>
    </> : <>
      <button type="button" disabled={busy || !questions.length} onClick={() => { setError(null); setPreviewing(true); window.scrollTo({ top: 0 }); }}
        className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50">
        <Eye className="h-4 w-4" aria-hidden="true" />{t('Xem trước')}
      </button>
      <button type="button" disabled={busy} onClick={() => save('draft')}
        className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-800 hover:bg-slate-100 disabled:opacity-50">{t('Lưu nháp')}</button>
      <button type="button" disabled={busy} onClick={() => save('published')}
        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-700 disabled:opacity-50">
        <FileCheck2 className="h-4 w-4" aria-hidden="true" />{saving ? t('Đang lưu...') : publishLabel}
      </button>
    </>}
  </>;

  if (previewing) {
    // The unsaved draft, shaped like a saved assessment so the student screen can render it.
    const draft: Assessment = {
      id: 'draft-preview', title: title.trim() || t('Bài chưa đặt tên'), type, subject: 'english', level,
      classIds: targetClassIds, description,
      durationMinutes: type === 'exam' ? durationMinutes : 0,
      dueDate: new Date(dueDate).toISOString(), createdAt: new Date().toISOString(), status: 'draft',
      questions: questions.map(({ answerSource: _source, ...q }, i) => ({ ...q, order: i + 1 })),
      totalPoints: questions.reduce((sum, q) => sum + (q.points || 0), 0),
    };
    return <div className="page-stack">
      <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-5 py-3 text-sm text-indigo-900">
        <span>{t('Đang xem trước bản nháp. Nội dung đang soạn vẫn được giữ nguyên.')}</span>
        <button type="button" onClick={() => setPreviewing(false)} className="btn btn-secondary btn-md"><ArrowLeft size={16} aria-hidden="true" />{t('Quay lại soạn đề')}</button>
      </div>
      <ExamTaker assessment={draft} preview onExit={() => setPreviewing(false)} onCompleted={() => setPreviewing(false)} />
    </div>;
  }

  return <div className="page-stack">
    <PageHeader icon={Sparkles}
      eyebrow={<Link to="/assessments" className="back-link" onClick={e => { if (dirty && !window.confirm(t('Bỏ đề đang soạn? Nội dung chưa lưu sẽ mất.'))) e.preventDefault(); }}>
        <ArrowLeft size={14} aria-hidden="true" />{t('Đề thi & bài tập')}</Link>}
      title={step === 'input' ? t('Tạo bài tập Tiếng Anh') : t('Soạn câu hỏi và đáp án')}
      description={step === 'input' ? t('Tải đề (ảnh, PDF, Word) để AI tách câu hỏi, hoặc soạn thủ công.') : t('Kiểm tra dạng bài và đáp án từng câu, rồi giao bài hoặc lưu nháp.')}
      actions={steps} />

    {error && <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
      <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" /><span>{error}</span>
    </div>}

    <section className="panel composer-body">

      {step === 'input' && isLoadingOcr ? (
        <OcrProgress sourceName={file?.name ?? t('Nội dung dán vào')} isImage={!!file?.type.startsWith('image/')} onCancel={cancelOcr} />
      ) : step === 'input' ? <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
          <div className="text-[11px] font-bold text-slate-700">{t('Môn học')}
            <SelectField ariaLabel={t('Môn học')} value="english" onValueChange={() => undefined} options={[{ value: 'english', label: t('Tiếng Anh') }]} className="mt-1 w-full" compact />
          </div>
          <div className="text-[11px] font-bold text-slate-700">{t('Giao cho lớp')}
            <ClassMultiSelect ariaLabel={t('Giao cho lớp')} classes={classes} value={targetClassIds} onChange={changeClasses} className="mt-1 w-full" compact
              placeholder={t('Chọn lớp học')} />
          </div>
          <div className="text-[11px] font-bold text-slate-700">{t('Cấp học')}
            <SelectField ariaLabel={t('Cấp học')} value={level} onValueChange={v => setLevel(v as SchoolLevel)} className="mt-1 w-full" compact
              options={[{ value: 'THCS', label: t('THCS (lớp 6–9)') }, { value: 'THPT', label: t('THPT (lớp 10–12)') }]} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-2">
            <span className="block text-xs font-bold uppercase tracking-wider text-slate-700">{t('Tải đề lên')}</span>
            <label className="flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/50 p-6 text-center transition-colors focus-within:border-indigo-500 hover:border-indigo-500 hover:bg-indigo-50/20">
              <input type="file" accept="image/*,application/pdf,.docx,.txt" onChange={handleFileUpload} className="sr-only" />
              {file ? <div className="space-y-2">
                {file.type.startsWith('image/')
                  ? <img src={file.dataUrl} alt={t('Ảnh đề đã chọn')} className="mx-auto max-h-36 rounded-lg border border-slate-200 object-contain shadow-xs" />
                  : <FileText className="mx-auto h-12 w-12 text-indigo-600" aria-hidden="true" />}
                <p className="flex items-center justify-center gap-1 text-xs font-semibold text-emerald-600"><CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />{file.name}</p>
                <p className="text-[11px] text-slate-700">{t('Bấm để chọn tệp khác')}</p>
              </div> : <>
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600"><FileUp className="h-6 w-6" aria-hidden="true" /></div>
                <p className="text-xs font-bold text-slate-800">{t('Bấm để chọn tệp đề')}</p>
                <p className="mt-1 text-[11px] text-slate-700">{t('Ảnh chụp, PDF (kể cả bản scan), Word .docx hoặc .txt — tối đa 12 MB')}</p>
              </>}
            </label>
            {file && <button type="button" onClick={() => setFile(null)} className="text-xs font-semibold text-rose-700 hover:underline">{t('Bỏ tệp đã chọn')}</button>}
          </div>

          <div className="space-y-2">
            <label htmlFor="ocr-text" className="block text-xs font-bold uppercase tracking-wider text-slate-700">{t('Hoặc dán nội dung đề')}</label>
            <textarea id="ocr-text" rows={9} value={examText} onChange={e => setExamText(e.target.value)}
              placeholder={'I. Choose the best answer.\n1. She ___ to London last summer.\nA. goes  B. went  C. has gone  D. will go\n\nII. Give the correct form of the words.\n2. She is a very ___ student. (CARE)'}
              className="w-full resize-none rounded-2xl border border-slate-300 bg-slate-50 p-3 font-mono text-xs leading-relaxed focus:outline-hidden focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>

        <p className="rounded-xl bg-indigo-50/70 p-3 text-[11px] leading-relaxed text-indigo-900">
          {t('AI nhận diện 19 dạng bài Tiếng Anh THCS/THPT: phát âm, trọng âm, ngữ pháp – từ vựng, đồng nghĩa, trái nghĩa, tìm lỗi sai, giao tiếp, câu gần nghĩa, kết hợp câu, sắp xếp, điền từ vào đoạn văn, đọc hiểu (trắc nghiệm, Đúng/Sai), điền từ, dạng đúng của từ, chia động từ, viết lại câu, dựng câu và viết đoạn văn.')}
          {' '}{t('Nếu đề có đáp án, AI dùng đáp án đó; nếu không, AI tự giải và đánh dấu để thầy cô kiểm tra.')}
        </p>
      </div> : <div className="space-y-6">
        {source && <div role="status" className={`rounded-xl border p-3 text-xs ${source === 'text_parser' || inferredCount ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
          {source === 'text_parser'
            ? t('Không dùng được AI nên đề được tách bằng bộ đọc văn bản đơn giản. Hãy kiểm tra dạng bài và đáp án từng câu.')
            : inferredCount
              ? t('AI đã tách {count} câu. {inferred} câu không có đáp án trong tài liệu nên AI tự giải (viền vàng) — thầy cô hãy kiểm tra trước khi giao.', { count: questions.length, inferred: inferredCount })
              : t('AI đã tách {count} câu và lấy đáp án từ tài liệu.', { count: questions.length })}
        </div>}

        <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-[11px] font-bold text-slate-700 lg:col-span-2">{t('Tiêu đề bài giao')}
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder={t('Ví dụ: Kiểm tra giữa kỳ I – Tiếng Anh 9')} className={`mt-1 font-bold ${inputClass}`} />
          </label>
          <div className="text-[11px] font-bold text-slate-700">{t('Loại bài')}
            <SelectField ariaLabel={t('Loại bài')} value={type} onValueChange={value => setType(value as Assessment['type'])} className="mt-1 w-full" compact
              options={[{ value: 'exam', label: t('Bài kiểm tra (tính giờ)') }, { value: 'homework', label: t('Bài tập về nhà') }]} />
          </div>
          <div className="text-[11px] font-bold text-slate-700">{t('Giao cho lớp')}
            <ClassMultiSelect ariaLabel={t('Giao cho lớp')} classes={classes} value={targetClassIds} onChange={changeClasses} className="mt-1 w-full" compact
              placeholder={t('Chọn lớp học')} />
          </div>
          <label className="block text-[11px] font-bold text-slate-700">{t('Hạn nộp')}
            <input type="datetime-local" value={dueDate} onChange={e => setDueDate(e.target.value)} className={`mt-1 ${inputClass}`} />
          </label>
          {type === 'exam' && <label className="block text-[11px] font-bold text-slate-700">{t('Thời gian làm bài (phút)')}
            <input type="number" min={5} max={180} value={durationMinutes} onChange={e => setDurationMinutes(Math.max(1, Number(e.target.value) || 1))} className={`mt-1 ${inputClass}`} />
          </label>}
          <div className="text-[11px] font-bold text-slate-700">{t('Cấp học')}
            <SelectField ariaLabel={t('Cấp học')} value={level} onValueChange={v => setLevel(v as SchoolLevel)} className="mt-1 w-full" compact
              options={[{ value: 'THCS', label: t('THCS') }, { value: 'THPT', label: t('THPT') }]} />
          </div>
          <label className="block text-[11px] font-bold text-slate-700 sm:col-span-2 lg:col-span-4">{t('Ghi chú cho học sinh')}
            <input type="text" value={description} onChange={e => setDescription(e.target.value)} className={`mt-1 ${inputClass}`} />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><BookOpen className="h-4 w-4 text-indigo-600" aria-hidden="true" />{t('Câu hỏi ({count}) · Tổng {points} điểm', { count: questions.length, points: questions.reduce((s, q) => s + (q.points || 0), 0) })}</h3>
            <p className="mt-0.5 text-xs text-slate-700">{t('Gạch chân (dạng phát âm, tìm lỗi sai, đồng nghĩa...): bôi đen chữ rồi bấm nút')} <strong className="underline underline-offset-2">U</strong> {t('cạnh ô hoặc nhấn Ctrl+U.')}</p>
          </div>
          <div className="flex items-center gap-2">
            <SelectField ariaLabel={t('Dạng bài của câu mới')} value={newFormat} onValueChange={v => setNewFormat(v as ExerciseFormat)} options={formatOptions(level, t)} compact className="w-56" />
            <button type="button" onClick={addQuestion} className="inline-flex items-center gap-1 whitespace-nowrap rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />{t('Thêm câu')}
            </button>
          </div>
        </div>

        {questions.length === 0
          ? <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-600">{t('Chưa có câu hỏi. Chọn dạng bài rồi bấm “Thêm câu”.')}</p>
          : <ol className="space-y-4">
            {questions.map((q, idx) => <QuestionEditor key={q.id} question={q} index={idx} level={level}
              onChange={next => setQuestions(prev => prev.map(item => item.id === q.id ? next : item))}
              onDelete={() => setQuestions(prev => prev.filter(item => item.id !== q.id))} />)}
          </ol>}
      </div>}
    </section>

    {/* Sticky so the main actions stay reachable while scrolling a long question list. */}
    <div className="composer-actions">{footer}</div>
  </div>;
};
