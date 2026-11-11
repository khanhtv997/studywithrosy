import { useEffect, useState } from 'react';
import { Check, FileImage, FileText, Loader2, Sparkles, X } from 'lucide-react';
import { useI18n } from '../../i18n';

/**
 * Stages shown while Gemini reads the exam. The server answers in one go, so these advance on a
 * timer that matches typical runs (10–30 s); the last stage waits until the answer arrives.
 */
const STAGES = [
  { at: 0, label: 'Đọc tài liệu', detail: 'Nhận diện chữ, bảng và phần gạch chân' },
  { at: 3, label: 'Nhận diện dạng bài', detail: 'Phát âm, ngữ pháp, đọc hiểu, viết lại câu…' },
  { at: 8, label: 'Tách câu hỏi & phương án', detail: 'Ghép đoạn văn với các câu hỏi đi kèm' },
  { at: 14, label: 'Tìm đáp án', detail: 'Dùng đáp án trong đề, hoặc AI tự giải' },
  { at: 20, label: 'Chuẩn hoá kết quả', detail: 'Kiểm tra định dạng trước khi hiển thị' },
];

const FORMAT_CHIPS = ['Phát âm', 'Trọng âm', 'Ngữ pháp', 'Đọc hiểu', 'Điền từ', 'Tìm lỗi sai', 'Viết lại câu', 'Đồng nghĩa'];

interface OcrProgressProps {
  /** File name or "Nội dung dán vào". */
  sourceName: string;
  isImage: boolean;
  onCancel: () => void;
}

/** "AI is analysing" panel: a scanned page, stage checklist, timer and an estimated progress bar. */
export function OcrProgress({ sourceName, isImage, onCancel }: OcrProgressProps) {
  const { t } = useI18n();
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setSeconds((Date.now() - started) / 1000), 250);
    return () => window.clearInterval(timer);
  }, []);

  const current = STAGES.reduce((index, stage, i) => (seconds >= stage.at ? i : index), 0);
  // Never reaches 100% on its own: it approaches 95% and the result replaces the panel.
  const percent = Math.min(95, Math.round(95 * (1 - Math.exp(-seconds / 18))));
  const SourceIcon = isImage ? FileImage : FileText;

  return <div className="ocr-progress" role="status" aria-live="polite" aria-label={t('Đang phân tích đề: {stage}', { stage: t(STAGES[current].label) })}>
    <div className="ocr-visual" aria-hidden="true">
      <div className="ocr-page">
        <div className="ocr-page-head"><SourceIcon size={14} /><span>{sourceName}</span></div>
        {Array.from({ length: 9 }, (_, i) => <i key={i} className="ocr-line" style={{ width: `${[92, 70, 84, 60, 88, 76, 66, 90, 54][i]}%`, animationDelay: `${i * 0.35}s` }} />)}
        <div className="ocr-beam" />
      </div>
      <div className="ocr-chips">
        {FORMAT_CHIPS.map((chip, i) => <span key={chip} className="ocr-chip" style={{ animationDelay: `${0.6 + i * 1.1}s` }}>{t(chip)}</span>)}
      </div>
      <div className="ocr-orbit"><Sparkles size={18} /></div>
    </div>

    <div className="ocr-panel">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[.14em] text-indigo-500">{t('Gemini đang phân tích')}</p>
          <h3 className="text-lg font-bold text-slate-900">{t(STAGES[current].label)}…</h3>
        </div>
        <span className="ocr-timer">{t('{n} giây', { n: Math.floor(seconds) })}</span>
      </div>

      <div className="ocr-bar" aria-hidden="true"><span style={{ width: `${percent}%` }} /></div>

      <ol className="ocr-steps">
        {STAGES.map((stage, i) => {
          const state = i < current ? 'done' : i === current ? 'active' : 'todo';
          return <li key={stage.label} className={`ocr-step is-${state}`}>
            <span className="ocr-step-dot">
              {state === 'done' ? <Check size={13} strokeWidth={3} /> : state === 'active' ? <Loader2 size={14} className="ocr-spin" /> : i + 1}
            </span>
            <span>
              <strong>{t(stage.label)}</strong>
              <small>{t(stage.detail)}</small>
            </span>
          </li>;
        })}
      </ol>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <p className="text-xs text-slate-500">{seconds > 45 ? t('Đề dài hoặc ảnh nhiều trang có thể mất 1–3 phút.') : t('Thường mất 10–30 giây.')}</p>
        <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm"><X size={14} aria-hidden="true" />{t('Huỷ')}</button>
      </div>
    </div>
  </div>;
}
