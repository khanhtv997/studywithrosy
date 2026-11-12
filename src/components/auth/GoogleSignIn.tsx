import { useEffect, useRef, useState } from 'react';
import { eduApi } from '../../api/client';
import { useI18n } from '../../i18n';

interface GoogleIdApi {
  initialize: (options: {
    client_id: string;
    callback: (response: { credential?: string }) => void;
    ux_mode?: 'popup' | 'redirect';
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    use_fedcm_for_button?: boolean;
  }) => void;
  renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
  disableAutoSelect?: () => void;
}
declare global { interface Window { google?: { accounts?: { id?: GoogleIdApi } } } }

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
let scriptPromise: Promise<GoogleIdApi> | null = null;
let configPromise: Promise<string | null> | null = null;

/** Loads Google's sign-in script once. */
function loadGoogle(): Promise<GoogleIdApi> {
  scriptPromise ??= new Promise<GoogleIdApi>((resolve, reject) => {
    if (window.google?.accounts?.id) { resolve(window.google.accounts.id); return; }
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new Error('Google sign-in did not load'));
    script.onerror = () => reject(new Error('Google sign-in did not load'));
    document.head.appendChild(script);
  }).catch(error => { scriptPromise = null; throw error; });
  return scriptPromise;
}

/** The server decides whether Google sign-in is on (GOOGLE_CLIENT_ID), so it works without rebuilding the app. */
function googleClientId() {
  configPromise ??= eduApi.authConfig().then(config => config.googleClientId).catch(() => { configPromise = null; return null; });
  return configPromise;
}

let initializedFor: string | null = null;
let onCredentialRef: (credential: string) => void = () => {};

/**
 * Google's own "Continue with Google" button. Shows nothing when the server has no Google client ID.
 * The button is drawn by Google (their branding rules), in the app's language.
 */
export function GoogleSignIn({ onCredential, onError, disabled, hint }: { onCredential: (credential: string) => void; onError: (message: string) => void; disabled?: boolean; hint?: string }) {
  const { lang, t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const [clientId, setClientId] = useState<string | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  onCredentialRef = onCredential;

  useEffect(() => { let alive = true; void googleClientId().then(id => { if (alive) setClientId(id); }); return () => { alive = false; }; }, []);

  useEffect(() => {
    if (!clientId || !box.current) return;
    let alive = true;
    loadGoogle().then(google => {
      if (!alive || !box.current) return;
      if (initializedFor !== clientId) {
        google.initialize({
          client_id: clientId,
          callback: response => { if (response.credential) onCredentialRef(response.credential); },
          ux_mode: 'popup',
          auto_select: false,
          cancel_on_tap_outside: true,
          use_fedcm_for_button: true,
        });
        initializedFor = clientId;
      }
      box.current.replaceChildren();
      google.renderButton(box.current, {
        type: 'standard', theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', logo_alignment: 'center',
        width: Math.min(400, Math.max(220, Math.round(box.current.getBoundingClientRect().width) || 360)),
        locale: lang === 'vi' ? 'vi' : 'en',
      });
    }).catch(() => { if (alive) { setFailed(true); onError(t('Không tải được nút đăng nhập Google. Hãy kiểm tra mạng và tải lại trang.')); } });
    return () => { alive = false; };
    // onError and t only change with the language, which is already a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, lang]);

  if (!clientId || failed) return null;
  return <div className="login-google">
    <div className="login-divider"><span>{t('hoặc')}</span></div>
    <div ref={box} className={`login-google-button ${disabled ? 'is-disabled' : ''}`} aria-busy={disabled} />
    <p className="login-google-hint">{hint ?? t('Giáo viên mới: đăng nhập bằng Google để tạo tài khoản. Quản trị viên sẽ duyệt trước khi bạn sử dụng.')}</p>
  </div>;
}
