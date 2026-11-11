import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, CheckCircle2, Eye, EyeOff, KeyRound, Pencil, Plus, Power, RefreshCw, ShieldCheck, Trash2, XCircle, Zap } from 'lucide-react';
import { eduApi } from '../../api/client';
import type { AiApiKey, AiKeyTestResult } from '../../types';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { PageHeader } from '../ui/PageHeader';
import { useI18n } from '../../i18n';

type KeyState = 'current' | 'standby' | 'resting' | 'error' | 'off';

/** What the key is doing right now, in the order AI requests would use the keys. */
function keyStates(keys: AiApiKey[]): Map<string, KeyState> {
  const now = Date.now();
  let currentFound = false;
  return new Map(keys.map(key => {
    if (!key.active) return [key.id, 'off'];
    if (key.cooldownUntil && new Date(key.cooldownUntil).getTime() > now) return [key.id, key.lastError?.startsWith('Khoá bị từ chối') ? 'error' : 'resting'];
    if (!currentFound) { currentFound = true; return [key.id, 'current']; }
    return [key.id, 'standby'];
  }));
}

const STATE_BADGE: Record<KeyState, { label: string; badge: string }> = {
  current: { label: 'Đang dùng', badge: 'badge-success' },
  standby: { label: 'Dự phòng', badge: 'badge-info' },
  resting: { label: 'Tạm nghỉ – hết hạn mức', badge: 'badge-warning' },
  error: { label: 'Lỗi khoá', badge: 'badge-danger' },
  off: { label: 'Đã tắt', badge: 'badge-muted' },
};

const formatTime = (iso: string | null, locale: string) => iso ? new Date(iso).toLocaleString(locale, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—';

/** Label + key form for adding a key or replacing one (the key is never shown again after saving). */
function KeyFormModal({ editing, onClose, onSaved }: { editing: AiApiKey | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const [label, setLabel] = useState(editing?.label ?? '');
  const [key, setKey] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editing) await eduApi.updateAiKey(editing.id, { label: label.trim(), ...(key.trim() ? { key: key.trim() } : {}) });
      else await eduApi.createAiKey(label.trim(), key.trim());
      onSaved();
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); setSaving(false); }
  };

  return <Modal title={editing ? t('Sửa khoá API') : t('Thêm khoá API')} onClose={onClose} dismissible={!saving}
    footer={<>
      <Button variant="ghost" disabled={saving} onClick={onClose}>{t('Huỷ')}</Button>
      <Button type="submit" form="ai-key-form" disabled={saving}>{saving ? t('Đang lưu...') : t('Lưu')}</Button>
    </>}>
    <form id="ai-key-form" onSubmit={submit} className="form-stack">
      {error && <p role="alert" className="form-error">{error}</p>}
      <label className="form-field">{t('Tên gợi nhớ')}
        <input required maxLength={80} placeholder={t('Ví dụ: Khoá chính, Khoá dự phòng 1')} value={label} onChange={e => setLabel(e.target.value)} />
      </label>
      <label className="form-field">{editing ? t('Khoá mới (để trống để giữ khoá …{last4})', { last4: editing.keyLast4 }) : t('Khoá API Gemini')}
        <span className="relative block">
          <input type={show ? 'text' : 'password'} required={!editing} minLength={20} autoComplete="off" spellCheck={false}
            placeholder={t('Dán khoá từ Google AI Studio')} value={key} onChange={e => setKey(e.target.value)} className="pr-10 font-mono" />
          <button type="button" onClick={() => setShow(v => !v)} aria-label={show ? t('Ẩn khoá') : t('Hiện khoá')}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 hover:text-slate-800">{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
        </span>
      </label>
      <p className="form-hint">{t('Khoá được mã hoá trước khi lưu và không hiển thị lại; màn này chỉ hiện 4 ký tự cuối.')}</p>
    </form>
  </Modal>;
}

export function AiKeysManagement() {
  const { t, locale } = useI18n();
  const [keys, setKeys] = useState<AiApiKey[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, AiKeyTestResult>>({});
  const [form, setForm] = useState<{ editing: AiApiKey | null } | null>(null);

  const load = async () => {
    try { const data = await eduApi.aiKeys(); setKeys(data.keys); setModels(data.models); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const act = async (id: string, action: () => Promise<unknown>) => {
    setBusyId(id);
    setError(null);
    try { await action(); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusyId(null); }
  };
  const move = (index: number, delta: number) => {
    const ids = keys.map(k => k.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    void act(keys[index].id, () => eduApi.reorderAiKeys(ids));
  };
  const test = (key: AiApiKey) => act(key.id, async () => {
    const result = await eduApi.testAiKey(key.id);
    setTestResults(prev => ({ ...prev, [key.id]: result }));
  });
  const remove = (key: AiApiKey) => {
    if (!window.confirm(t('Xoá khoá "{label}" (…{last4})?', { label: key.label, last4: key.keyLast4 }))) return;
    void act(key.id, () => eduApi.deleteAiKey(key.id));
  };

  const states = keyStates(keys);
  const usable = [...states.values()].filter(s => s === 'current' || s === 'standby').length;

  return <div className="page-stack">
    <PageHeader icon={KeyRound} title={t('Khoá API AI')}
      description={t('Khoá Gemini dùng để đọc đề (OCR), gợi ý nhận xét và phân tích lớp. Khi một khoá hết hạn mức, hệ thống tự chuyển sang khoá kế tiếp.')}
      actions={<>
        <Button variant="secondary" onClick={() => { setLoading(true); void load(); }}><RefreshCw size={16} aria-hidden="true" />{t('Làm mới')}</Button>
        <Button onClick={() => setForm({ editing: null })}><Plus size={17} aria-hidden="true" />{t('Thêm khoá')}</Button>
      </>} />

    {error && <p role="alert" className="form-error">{error}</p>}
    {!loading && usable === 0 && <p role="alert" className="form-error">
      {keys.length ? t('Hiện không có khoá nào dùng được (tất cả đang tắt, tạm nghỉ hoặc lỗi).') : t('Hiện không có khoá nào dùng được.')} {t('Đọc ảnh/PDF và các gợi ý AI sẽ không hoạt động cho tới khi có khoá dùng được.')}
    </p>}

    <section className="panel">
      <div className="panel-toolbar">
        <h2 className="panel-title">{t('Thứ tự sử dụng')}<span className="count-pill">{t('{count} khoá', { count: keys.length })}</span></h2>
        <span className="text-xs text-slate-500">Model: {models.join(' → ') || '—'}</span>
      </div>
      {loading ? <p className="empty-state">{t('Đang tải...')}</p> : keys.length === 0 ? (
        <div className="empty-state">
          <KeyRound size={30} aria-hidden="true" />
          <strong>{t('Chưa có khoá API nào')}</strong>
          <span className="text-sm">{t('Lấy khoá tại Google AI Studio (aistudio.google.com) rồi bấm "Thêm khoá".')}</span>
        </div>
      ) : <ol className="divide-y divide-slate-100">
        {keys.map((key, index) => {
          const state = states.get(key.id)!;
          const result = testResults[key.id];
          const busy = busyId === key.id;
          return <li key={key.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center">
            <div className="flex items-center gap-3">
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-extrabold ${state === 'current' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{index + 1}</span>
              <div className="flex flex-col gap-0.5">
                <button type="button" className="icon-btn h-6 w-6" disabled={busy || index === 0} onClick={() => move(index, -1)} aria-label={t('Ưu tiên {label} lên trước', { label: key.label })} title={t('Lên trước')}><ArrowUp size={14} /></button>
                <button type="button" className="icon-btn h-6 w-6" disabled={busy || index === keys.length - 1} onClick={() => move(index, 1)} aria-label={t('Đưa {label} xuống sau', { label: key.label })} title={t('Xuống sau')}><ArrowDown size={14} /></button>
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-slate-900">{key.label}</strong>
                <code className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">••••{key.keyLast4}</code>
                <span className={`badge ${STATE_BADGE[state].badge}`}>{t(STATE_BADGE[state].label)}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
                <span>{t('Đã dùng {count} lần', { count: key.useCount })}</span>
                <span>{t('Lần cuối: {time}', { time: formatTime(key.lastUsedAt, locale) })}</span>
                {state === 'resting' && key.cooldownUntil && <span className="font-semibold text-amber-700">{t('Thử lại lúc {time}', { time: formatTime(key.cooldownUntil, locale) })}</span>}
              </div>
              {key.lastError && (state === 'resting' || state === 'error') && <p className="mt-1 line-clamp-2 text-xs text-rose-700" title={key.lastError}>{key.lastError}</p>}
              {result && <p className={`mt-1 flex items-center gap-1.5 text-xs font-semibold ${result.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
                {result.ok ? <CheckCircle2 size={14} aria-hidden="true" /> : <XCircle size={14} aria-hidden="true" />}{result.message}
              </p>}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => void test(key)}><Zap size={14} aria-hidden="true" />{busy ? t('Đang thử...') : t('Kiểm tra')}</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setForm({ editing: key })}><Pencil size={14} aria-hidden="true" />{t('Sửa')}</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act(key.id, () => eduApi.updateAiKey(key.id, { active: !key.active }))}>
                <Power size={14} aria-hidden="true" />{key.active ? t('Tắt') : t('Bật')}
              </Button>
              <button type="button" className="icon-btn icon-btn-danger" disabled={busy} onClick={() => remove(key)} aria-label={t('Xoá khoá {label}', { label: key.label })} title={t('Xoá khoá')}><Trash2 size={16} /></button>
            </div>
          </li>;
        })}
      </ol>}
    </section>

    <section className="panel composer-body">
      <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-slate-900"><ShieldCheck size={18} className="text-indigo-600" aria-hidden="true" />{t('Cách hệ thống chọn khoá')}</h2>
      <ul className="grid gap-2 text-sm text-slate-700 md:grid-cols-2">
        <li>• {t('Mỗi yêu cầu AI dùng khoá đứng đầu danh sách còn dùng được; dùng mũi tên để đổi thứ tự.')}</li>
        <li>• {t('Khoá hết hạn mức hoặc bị giới hạn tốc độ được cho nghỉ 15 phút và hệ thống chuyển ngay sang khoá kế tiếp.')}</li>
        <li>• {t('Khoá sai hoặc bị thu hồi bị bỏ qua 24 giờ, hoặc tới khi bạn sửa khoá hay bật lại.')}</li>
        <li>• {t('Model quá tải không phải lỗi của khoá: hệ thống thử model kế tiếp ({models}) với cùng khoá.', { models: models.join(' → ') })}</li>
      </ul>
    </section>

    {form && <KeyFormModal editing={form.editing} onClose={() => setForm(null)} onSaved={() => void load()} />}
  </div>;
}
