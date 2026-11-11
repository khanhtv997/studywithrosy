import { Fragment } from 'react';

/**
 * Renders question text that may mark underlined parts with <u>...</u>.
 * Only that tag is honoured; everything else stays plain text, so content from
 * OCR or teachers can never inject HTML.
 */
export function RichText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(<u>[\s\S]*?<\/u>)/gi);
  return <span className={className} style={{ whiteSpace: 'pre-line' }}>
    {parts.map((part, i) => {
      const underlined = part.match(/^<u>([\s\S]*?)<\/u>$/i);
      return underlined
        ? <u key={i} className="decoration-2 underline-offset-2">{underlined[1]}</u>
        : <Fragment key={i}>{part.replace(/<\/?u>/gi, '')}</Fragment>;
    })}
  </span>;
}

/** Plain text for places that cannot show formatting (titles, inputs, tooltips). */
export const plainText = (text: string) => text.replace(/<\/?u>/gi, '');
