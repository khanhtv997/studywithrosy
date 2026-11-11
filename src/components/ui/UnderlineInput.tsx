import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Underline } from 'lucide-react';
import { useI18n } from '../../i18n';

/**
 * Text field that shows underlines instead of <u>…</u> tags. The value is still stored as
 * plain text with <u>…</u> (what the API, grading and RichText use); only underline is kept,
 * any other formatting that gets in (paste, Ctrl+B) is dropped when reading the field back.
 */
interface UnderlineInputProps {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  /** Single line (options) or several lines (question text, passage). */
  multiline?: boolean;
  placeholder?: string;
  className?: string;
}

/** Builds DOM nodes from the stored markup without ever parsing it as HTML. */
function fillFromMarkup(el: HTMLElement, markup: string) {
  el.replaceChildren();
  const appendText = (parent: Node, text: string) => text.split('\n').forEach((line, i) => {
    if (i > 0) parent.appendChild(document.createElement('br'));
    if (line) parent.appendChild(document.createTextNode(line));
  });
  for (const part of markup.split(/(<u>[\s\S]*?<\/u>)/gi)) {
    const underlined = part.match(/^<u>([\s\S]*?)<\/u>$/i);
    if (underlined) {
      const u = document.createElement('u');
      appendText(u, underlined[1]);
      el.appendChild(u);
    } else {
      appendText(el, part.replace(/<\/?u>/gi, ''));
    }
  }
}

const isUnderlined = (el: HTMLElement) => el.tagName === 'U' || el.tagName === 'INS' || /underline/.test(el.style.textDecoration || el.style.textDecorationLine || '');

/** Reads the field back into markup: text, line breaks and underline only. */
function readMarkup(root: HTMLElement, multiline: boolean): string {
  const walk = (node: Node, underline: boolean): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent || '').replace(/​/g, '').replace(/ /g, ' ');
      return underline && text ? `<u>${text}</u>` : text;
    }
    if (!(node instanceof HTMLElement)) return '';
    if (node.tagName === 'BR') return multiline ? '\n' : ' ';
    const inner = [...node.childNodes].map(child => walk(child, underline || isUnderlined(node))).join('');
    // Chrome wraps new lines in <div>; treat each block as its own line.
    const block = node !== root && (node.tagName === 'DIV' || node.tagName === 'P');
    return block ? (multiline ? `\n${inner}` : ` ${inner}`) : inner;
  };
  return walk(root, false)
    .replace(/<\/u><u>/g, '')        // join neighbouring underlined pieces
    .replace(/<u>(\s*)<\/u>/g, '$1') // drop empty underlines
    .replace(/^\n/, '');
}

export function UnderlineInput({ value, onChange, ariaLabel, multiline = false, placeholder, className = '' }: UnderlineInputProps) {
  const ref = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef<string | null>(null);
  const [focused, setFocused] = useState(false);
  const { t } = useI18n();

  // Only rewrite the DOM when the value changed from outside, so typing keeps the caret in place.
  useEffect(() => {
    if (ref.current && value !== lastEmitted.current) {
      fillFromMarkup(ref.current, value);
      lastEmitted.current = value;
    }
  }, [value]);

  const emit = () => {
    if (!ref.current) return;
    const next = readMarkup(ref.current, multiline);
    lastEmitted.current = next;
    if (next !== value) onChange(next);
  };

  const toggleUnderline = () => {
    ref.current?.focus();
    document.execCommand('underline');
    emit();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === 'u') { event.preventDefault(); toggleUnderline(); return; }
    // Bold/italic would be dropped on save anyway; don't show formatting that won't be kept.
    if ((event.ctrlKey || event.metaKey) && (key === 'b' || key === 'i')) { event.preventDefault(); return; }
    if (event.key === 'Enter' && !multiline) event.preventDefault();
  };

  return <div className={`underline-input ${focused ? 'is-focused' : ''} ${className}`}>
    <div
      ref={ref}
      role="textbox"
      aria-label={ariaLabel}
      aria-multiline={multiline}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-placeholder={placeholder}
      className={`underline-input-field ${multiline ? 'is-multiline' : ''}`}
      onInput={emit}
      onBlur={() => { setFocused(false); emit(); }}
      onFocus={() => setFocused(true)}
      onKeyDown={onKeyDown}
      onPaste={event => {
        // Paste as plain text; underline is added with the U button.
        event.preventDefault();
        const text = event.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, multiline ? text : text.replace(/\s*\n\s*/g, ' '));
      }}
    />
    <button type="button" className="underline-input-button" title={t('Gạch chân phần đang bôi đen (Ctrl+U)')} aria-label={t('Gạch chân phần đang chọn')}
      onMouseDown={event => event.preventDefault()} onClick={toggleUnderline}>
      <Underline size={14} aria-hidden="true" />
    </button>
  </div>;
}
