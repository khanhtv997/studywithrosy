import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Link2, Link2Off, Search, UserPlus, X } from 'lucide-react';
import { eduApi } from '../../api/client';
import { useApp } from '../../context/AppContext';
import type { Assessment, AssessmentShareInfo, StaffMember } from '../../types';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { StudentAvatar } from '../ui/StudentAvatar';
import { useI18n } from '../../i18n';

const shareUrl = (token: string) => `${window.location.origin}/shared/${encodeURIComponent(token)}`;

/**
 * Shares an assessment with other teachers, directly or by link. Either way they get a read-only
 * view and make their own copy to assign, so nothing they do changes the original.
 */
export function ShareAssessmentModal({ assessment, onClose }: { assessment: Assessment; onClose: () => void }) {
  const { currentUser } = useApp();
  const { t, locale } = useI18n();
  const [info, setInfo] = useState<AssessmentShareInfo | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([eduApi.assessmentShares(assessment.id), eduApi.staff()])
      .then(([shares, people]) => { if (!cancelled) { setInfo(shares); setStaff(people); } })
      .catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { cancelled = true; };
  }, [assessment.id]);

  const run = async (key: string, action: () => Promise<AssessmentShareInfo>) => {
    setBusy(key);
    setError(null);
    try { setInfo(await action()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(null); }
  };

  const sharedIds = new Set(info?.recipients.map(r => r.id));
  const q = query.trim().toLowerCase();
  const candidates = useMemo(() => staff
    .filter(p => p.id !== currentUser?.id && !sharedIds.has(p.id))
    .filter(p => !q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [staff, info, q, currentUser?.id]);

  const copyLink = async () => {
    if (!info?.linkToken) return;
    try { await navigator.clipboard.writeText(shareUrl(info.linkToken)); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setError(t('Không sao chép được. Hãy chọn liên kết và sao chép thủ công.')); }
  };

  return <Modal title={t('Chia sẻ đề')} subtitle={assessment.title} onClose={onClose} size="lg"
    footer={<Button onClick={onClose}>{t('Xong')}</Button>}>
    <div className="form-stack">
      {error && <p role="alert" className="form-error">{error}</p>}
      <p className="text-sm text-slate-600">{t('Giáo viên được chia sẻ sẽ xem được đề và đáp án, rồi tạo bản sao của riêng họ để giao cho lớp mình. Bản gốc và bài làm của học sinh lớp bạn không bị ảnh hưởng.')}</p>

      <section aria-labelledby="share-people" className="grid gap-3">
        <h3 id="share-people" className="text-sm font-bold text-slate-900">{t('Chia sẻ với giáo viên')}</h3>
        {info === null && !error ? <p className="text-sm text-slate-500">{t('Đang tải...')}</p> : <>
          {info && info.recipients.length > 0 && <ul className="grid gap-2">
            {info.recipients.map(person => <li key={person.id} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2">
              <StudentAvatar name={person.name} className="h-8 w-8 rounded-full text-[11px]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-900">{person.name}</span>
                <span className="block truncate text-xs text-slate-500">{person.email} · {t('đã chia sẻ {date}', { date: new Date(person.sharedAt).toLocaleDateString(locale) })}</span>
              </span>
              <button type="button" className="icon-btn" disabled={busy !== null} aria-label={t('Bỏ chia sẻ với {name}', { name: person.name })} title={t('Bỏ chia sẻ')}
                onClick={() => run(`remove-${person.id}`, () => eduApi.unshareAssessment(assessment.id, person.id))}><X size={16} aria-hidden="true" /></button>
            </li>)}
          </ul>}
          <label className="search-field">
            <Search size={16} aria-hidden="true" />
            <input type="search" aria-label={t('Tìm giáo viên')} placeholder={t('Tìm giáo viên theo tên hoặc email...')} value={query} onChange={e => setQuery(e.target.value)} />
          </label>
          <ul className="grid max-h-56 gap-1 overflow-y-auto">
            {candidates.length === 0 ? <li className="px-1 py-2 text-sm text-slate-500">{staff.length <= 1 ? t('Chưa có giáo viên nào khác trên hệ thống.') : t('Không có giáo viên nào khớp.')}</li>
              : candidates.map(person => <li key={person.id} className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-slate-50">
                <StudentAvatar name={person.name} className="h-8 w-8 rounded-full text-[11px]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900">{person.name}</span>
                  <span className="block truncate text-xs text-slate-500">{person.email}</span>
                </span>
                <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => run(`add-${person.id}`, () => eduApi.shareAssessment(assessment.id, [person.id]))}>
                  <UserPlus size={15} aria-hidden="true" />{busy === `add-${person.id}` ? t('Đang chia sẻ...') : t('Chia sẻ')}
                </Button>
              </li>)}
          </ul>
        </>}
      </section>

      <section aria-labelledby="share-link" className="grid gap-3 border-t border-slate-100 pt-4">
        <h3 id="share-link" className="text-sm font-bold text-slate-900">{t('Chia sẻ qua liên kết')}</h3>
        {info?.linkToken ? <>
          <div className="flex flex-wrap items-center gap-2">
            <input readOnly value={shareUrl(info.linkToken)} aria-label={t('Liên kết chia sẻ')} onFocus={e => e.target.select()}
              className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700" />
            <Button variant="secondary" onClick={copyLink}>{copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}{copied ? t('Đã sao chép') : t('Sao chép')}</Button>
            <Button variant="ghost" disabled={busy !== null} onClick={() => run('revoke', () => eduApi.revokeShareLink(assessment.id))}>
              <Link2Off size={15} aria-hidden="true" />{t('Tắt liên kết')}
            </Button>
          </div>
          <p className="text-xs text-slate-500">{t('Ai có liên kết và có tài khoản giáo viên trên hệ thống đều mở được. Tắt liên kết thì liên kết cũ hết hiệu lực.')}</p>
        </> : <div>
          <Button variant="secondary" disabled={busy !== null || info === null} onClick={() => run('link', () => eduApi.createShareLink(assessment.id))}>
            <Link2 size={15} aria-hidden="true" />{busy === 'link' ? t('Đang tạo...') : t('Tạo liên kết chia sẻ')}
          </Button>
        </div>}
      </section>
    </div>
  </Modal>;
}
