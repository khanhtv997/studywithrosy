/**
 * Initials for an avatar: first letter of the family name and of the given name,
 * e.g. "Tống Văn Khánh" → "TK", "Lan" → "L".
 */
export function initialsOf(name: string | undefined | null, fallback = 'HS'): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return fallback;
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return (first + last).toLocaleUpperCase('vi');
}

const AVATAR_TONES = 8;
/** A stable colour slot (0–7) per name so the same student always gets the same colour. */
export function avatarTone(name: string | undefined | null): number {
  let hash = 0;
  for (const char of name ?? '') hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return hash % AVATAR_TONES;
}
