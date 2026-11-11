import React, { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { AlertCircle, ArrowLeft, CheckCircle2, Download, FileSpreadsheet, FileUp, RefreshCw, Save, UsersRound } from 'lucide-react';
import { eduApi } from '../../api/client';
import { useApp } from '../../context/AppContext';
import { useI18n } from '../../i18n';
import type { StudentAccountAction, StudentImportAction, StudentImportPreview, StudentImportResult } from '../../types';
import { Button } from '../ui/Button';
import { PageHeader } from '../ui/PageHeader';
import { Pagination, usePagination } from '../ui/Pagination';
import { SelectField } from '../ui/SelectField';
import { Tabs } from '../ui/Tabs';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

// Labels are Vietnamese source text, translated where rendered.
const ACTION: Record<StudentImportAction, { label: string; badge: string }> = {
  create: { label: 'Thêm mới', badge: 'badge-success' },
  move: { label: 'Chuyển lớp', badge: 'badge-info' },
  update: { label: 'Cập nhật', badge: 'badge-info' },
  unchanged: { label: 'Đã có, giữ nguyên', badge: 'badge-muted' },
  error: { label: 'Lỗi, bỏ qua', badge: 'badge-danger' },
};

const ACCOUNT: Record<Exclude<StudentAccountAction, 'none'>, { label: string; tone: string }> = {
  create: { label: 'Tạo mới', tone: 'text-emerald-700' },
  exists: { label: 'Đã có tài khoản', tone: 'text-slate-500' },
  conflict: { label: 'Tên đăng nhập đã được dùng — không tạo', tone: 'text-amber-700' },
};

const readAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

/** Upload an Excel class list, check every row, then save the valid ones in one go. */
export function StudentImport({ initialClassId, onDone }: { initialClassId?: string; onDone: (classId: string) => void }) {
  const { classes, syncData } = useApp();
  const { t } = useI18n();
  const [classId, setClassId] = useState(initialClassId && classes.some(c => c.id === initialClassId) ? initialClassId : classes[0]?.id || '');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<StudentImportPreview | null>(null);
  const [result, setResult] = useState<StudentImportResult | null>(null);
  const [filter, setFilter] = useState<'all' | StudentImportAction>('all');
  const [busy, setBusy] = useState<'template' | 'preview' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<string | null>(null);
  const [createAccounts, setCreateAccounts] = useState(true);
  // Opening the link directly: classes may arrive after the first render.
  useEffect(() => {
    if (classId || !classes.length) return;
    setClassId(initialClassId && classes.some(c => c.id === initialClassId) ? initialClassId : classes[0].id);
  }, [classes, classId, initialClassId]);

  const run = async (kind: NonNullable<typeof busy>, action: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(null); }
  };

  const loadPreview = (targetClassId: string, dataUrl: string, withAccounts = createAccounts) => run('preview', async () => {
    setPreview(await eduApi.previewStudentImport(targetClassId, dataUrl, withAccounts));
    setFilter('all');
  });

  const pickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) { setError(t('Hãy chọn tệp Excel .xlsx. Tệp .xls cũ hoặc .csv: mở bằng Excel rồi "Lưu thành" .xlsx.')); return; }
    if (file.size > MAX_FILE_BYTES) { setError(t('Tệp lớn hơn 10 MB.')); return; }
    setResult(null);
    setFileName(file.name);
    const dataUrl = await readAsDataUrl(file);
    setLastFile(dataUrl);
    await loadPreview(classId, dataUrl);
  };

  // The plan depends on the class (who is new, who moves), so changing it re-checks the same file.
  const changeClass = (id: string) => {
    setClassId(id);
    if (lastFile && !result) void loadPreview(id, lastFile);
  };
  const toggleAccounts = (value: boolean) => {
    setCreateAccounts(value);
    if (lastFile && !result) void loadPreview(classId, lastFile, value);
  };

  const toSave = preview ? preview.counts.create + preview.counts.move + preview.counts.update : 0;
  // Students already in the class may still get an account, so that also counts as something to save.
  const accountsToCreate = preview ? preview.rows.filter(r => r.account === 'create').length : 0;
  const save = () => run('save', async () => {
    if (!preview) return;
    const rows = preview.rows.filter(r => r.action !== 'error').map(({ row, name, code, email }) => ({ row, name, code, email }));
    setResult(await eduApi.importStudents(classId, rows, createAccounts));
    await syncData();
  });

  const reset = () => { setPreview(null); setResult(null); setFileName(''); setLastFile(null); setError(null); };

  const visibleRows = preview ? preview.rows.filter(r => filter === 'all' || r.action === filter) : [];
  const pager = usePagination(visibleRows, `${filter}|${fileName}|${classId}`, 20);
  const className = classes.find(c => c.id === classId)?.name ?? '';
  const backTo = initialClassId ? `/classes/${encodeURIComponent(initialClassId)}` : '/students';

  return <div className="page-stack">
    <PageHeader icon={FileSpreadsheet} title={t('Nhập học sinh từ Excel')}
      eyebrow={<Link to={backTo} className="back-link"><ArrowLeft size={14} aria-hidden="true" />{initialClassId ? t('Về lớp học') : t('Quản lý học sinh')}</Link>}
      description={t('Tải tệp mẫu, điền danh sách rồi tải lên. Hệ thống cho xem trước từng dòng trước khi lưu.')}
      actions={<Button variant="secondary" disabled={busy !== null} onClick={() => run('template', eduApi.downloadStudentTemplate)}>
        <Download size={17} aria-hidden="true" />{busy === 'template' ? t('Đang tải...') : t('Tải tệp mẫu')}
      </Button>} />

    {error && <p role="alert" className="form-error flex items-center gap-2"><AlertCircle size={16} aria-hidden="true" />{error}</p>}

    {result ? <section className="panel composer-body">
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <CheckCircle2 size={44} className="text-emerald-600" aria-hidden="true" />
        <h2 className="text-xl font-bold text-slate-900">{t('Đã lưu danh sách vào {className}', { className })}</h2>
        <p className="text-sm text-slate-600">
          {t('Thêm mới')} <strong>{result.created}</strong> · {t('Chuyển lớp')} <strong>{result.moved}</strong> · {t('Cập nhật')} <strong>{result.updated}</strong>
          {' '}· {t('Giữ nguyên')} <strong>{result.unchanged}</strong> · {t('Bỏ qua do lỗi')} <strong>{result.skipped}</strong>
        </p>
        {result.accountsCreated > 0 && <p className="max-w-xl rounded-xl bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
          <strong>{t('Đã tạo {count} tài khoản.', { count: result.accountsCreated })}</strong>
          {' '}{t('Học sinh đăng nhập bằng mã học sinh, mật khẩu cũng là mã học sinh (viết đúng như trong tệp), và phải đổi mật khẩu ở lần đăng nhập đầu.')}
        </p>}
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Button variant="secondary" onClick={reset}><RefreshCw size={16} aria-hidden="true" />{t('Nhập tệp khác')}</Button>
          <Button onClick={() => onDone(classId)}><UsersRound size={16} aria-hidden="true" />{t('Xem danh sách lớp')}</Button>
        </div>
      </div>
    </section> : <>
      <section className="panel composer-body space-y-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <div className="form-field">{t('Lớp nhận học sinh')}
            <SelectField ariaLabel={t('Lớp nhận học sinh')} value={classId} onValueChange={changeClass} placeholder={t('Chọn lớp')}
              options={classes.map(c => ({ value: c.id, label: c.name }))} className="w-full" disabled={busy !== null} />
            <span className="form-hint font-normal">{t('Học sinh có mã đã ở lớp khác sẽ được chuyển sang lớp này.')}</span>
            <label className="mt-2 flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3 font-normal">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-indigo-600" checked={createAccounts} disabled={busy !== null}
                onChange={e => toggleAccounts(e.target.checked)} />
              <span className="text-[13px] text-slate-700"><strong className="text-slate-900">{t('Tạo tài khoản đăng nhập')}</strong><br />
                {t('Tên đăng nhập và mật khẩu đều là mã học sinh; lần đầu đăng nhập học sinh phải đổi mật khẩu.')}</span>
            </label>
          </div>
          <label className={`flex min-h-[140px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-5 text-center transition-colors focus-within:border-indigo-500 ${classId ? 'border-slate-300 bg-slate-50/60 hover:border-indigo-400' : 'pointer-events-none opacity-50'}`}>
            <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={pickFile} disabled={!classId || busy !== null} />
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-indigo-50 text-indigo-600"><FileUp size={22} aria-hidden="true" /></span>
            <strong className="text-sm text-slate-800">{busy === 'preview' ? t('Đang đọc tệp...') : fileName || t('Bấm để chọn tệp Excel (.xlsx)')}</strong>
            <span className="text-xs text-slate-600">{fileName ? t('Bấm để chọn tệp khác') : t('Cột bắt buộc: Họ và tên, Mã học sinh (Email không bắt buộc) — tối đa 1.000 dòng, 10 MB')}</span>
          </label>
        </div>
      </section>

      {preview && <section className="panel">
        <div className="panel-toolbar">
          <h2 className="panel-title">{t('Xem trước')}<span className="count-pill">{t('{count} dòng', { count: preview.rows.length })}</span></h2>
          <Tabs ariaLabel={t('Lọc theo kết quả')} value={filter} onChange={setFilter} options={[
            { value: 'all', label: t('Tất cả'), count: preview.rows.length },
            ...(Object.keys(ACTION) as StudentImportAction[]).filter(a => preview.counts[a] > 0).map(a => ({ value: a, label: t(ACTION[a].label), count: preview.counts[a] })),
          ]} />
        </div>
        {preview.counts.error > 0 && <p className="border-b border-rose-100 bg-rose-50 px-6 py-3 text-sm text-rose-800">
          {t('{count} dòng có lỗi sẽ bị bỏ qua. Sửa trong Excel rồi tải lại nếu muốn nhập cả các dòng này.', { count: preview.counts.error })}
        </p>}
        <div className="overflow-x-auto">
          <table className="data-table min-w-[760px]">
            <thead><tr><th className="w-16">{t('Dòng')}</th><th>{t('Họ và tên')}</th><th>{t('Mã học sinh')}</th><th>Email</th><th>{t('Kết quả')}</th>{preview.createAccounts && <th>{t('Tài khoản')}</th>}</tr></thead>
            <tbody>
              {pager.total === 0 ? <tr><td colSpan={preview.createAccounts ? 6 : 5} className="empty-cell"><span>{preview.rows.length ? t('Không có dòng nào ở mục này.') : t('Tệp không có dòng dữ liệu nào.')}</span></td></tr>
                : pager.pageItems.map(row => <tr key={row.row} className={row.action === 'error' ? 'bg-rose-50/40' : ''}>
                  <td className="font-mono text-slate-500">{row.row}</td>
                  <td className="font-semibold text-slate-900">{row.name || <span className="text-rose-600">—</span>}</td>
                  <td className="whitespace-nowrap font-mono text-slate-700">{row.code || <span className="text-rose-600">—</span>}</td>
                  <td className="text-slate-700">{row.email || <span className="text-slate-400">—</span>}</td>
                  <td>
                    <span className={`badge ${ACTION[row.action].badge}`}>{t(ACTION[row.action].label)}</span>
                    {row.fromClassName && <div className="mt-1 text-[12px] text-slate-500">{t('từ {className}', { className: row.fromClassName })}</div>}
                    {row.errors.length > 0 && <div className="mt-1 text-[12px] text-rose-700">{row.errors.join(' · ')}</div>}
                  </td>
                  {preview.createAccounts && <td className="text-[13px]">
                    {row.account === 'none' ? <span className="text-slate-400">—</span> : <>
                      <span className={`font-semibold ${ACCOUNT[row.account].tone}`}>{t(ACCOUNT[row.account].label)}</span>
                      {row.account !== 'conflict' && row.login && <div className="font-mono text-[12px] text-slate-500">{row.login}</div>}
                    </>}
                  </td>}
                </tr>)}
            </tbody>
          </table>
        </div>
        <Pagination state={pager} unit={t('dòng')} sizes={[20, 50, 100]} />
      </section>}

      {preview && <div className="composer-actions">
        <span className="mr-auto text-sm text-slate-600">
          {!toSave && !accountsToCreate ? t('Không có dòng nào cần lưu.')
            : accountsToCreate ? t('Sẽ lưu {count} học sinh vào {className} và tạo {accounts} tài khoản.', { count: toSave, className, accounts: accountsToCreate })
            : t('Sẽ lưu {count} học sinh vào {className}.', { count: toSave, className })}
        </span>
        <Button variant="ghost" disabled={busy !== null} onClick={reset}>{t('Huỷ')}</Button>
        <Button disabled={busy !== null || (toSave === 0 && accountsToCreate === 0)} onClick={save}>
          <Save size={16} aria-hidden="true" />{busy === 'save' ? t('Đang lưu...') : toSave ? t('Lưu {count} học sinh', { count: toSave }) : t('Tạo {count} tài khoản', { count: accountsToCreate })}
        </Button>
      </div>}
    </>}
  </div>;
}
