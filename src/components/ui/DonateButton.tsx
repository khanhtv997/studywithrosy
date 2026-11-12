import { useState } from 'react';
import { Coffee, Download } from 'lucide-react';
import { Modal } from './Modal';
import { useI18n } from '../../i18n';
import './donate.css';

const QR_SRC = '/donate.jpg';

/** "Buy me a coffee": a button that opens the bank transfer QR code. */
export function DonateButton({ rail = false, onOpen }: { rail?: boolean; onOpen?: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const label = t('Mời mình một ly cà phê');
  return <>
    <button type="button" className="app-coffee"
      onClick={() => { onOpen?.(); setOpen(true); }}
      data-tooltip={rail ? label : undefined} aria-label={rail ? label : undefined}>
      <Coffee size={18} aria-hidden="true" />
      <span className="app-nav-label">{label}</span>
    </button>
    {open && <DonateModal onClose={() => setOpen(false)} />}
  </>;
}

function DonateModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  return <Modal title={<span className="donate-title"><Coffee size={20} aria-hidden="true" />Buy me a coffee</span>} onClose={onClose}>
    <div className="donate-body">
      <p>{t('Nếu EduPath giúp ích cho việc dạy và học, bạn có thể mời mình một ly cà phê để duy trì máy chủ và làm thêm tính năng mới. Cảm ơn bạn rất nhiều!')}</p>
      <img src={QR_SRC} alt={t('Mã QR chuyển khoản Techcombank (VietQR)')} className="donate-qr" width={756} height={796} />
      <p className="donate-hint">{t('Mở ứng dụng ngân hàng hoặc ví điện tử, chọn quét mã QR (VietQR · Napas 247).')}</p>
      <a href={QR_SRC} download="EduPath-donate-QR.jpg" className="btn btn-secondary btn-sm"><Download size={15} aria-hidden="true" />{t('Tải mã QR')}</a>
    </div>
  </Modal>;
}
