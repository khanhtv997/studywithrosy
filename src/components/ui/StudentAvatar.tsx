import { avatarTone, initialsOf } from '../../utils/initials';

interface StudentAvatarProps {
  name: string;
  /** Kept for callers that still pass a photo URL; avatars always show initials. */
  src?: string | null;
  className?: string;
}

const TONES = [
  'bg-indigo-50 text-indigo-700 border-indigo-100',
  'bg-emerald-50 text-emerald-700 border-emerald-100',
  'bg-amber-50 text-amber-800 border-amber-100',
  'bg-rose-50 text-rose-700 border-rose-100',
  'bg-sky-50 text-sky-700 border-sky-100',
  'bg-violet-50 text-violet-700 border-violet-100',
  'bg-teal-50 text-teal-700 border-teal-100',
  'bg-orange-50 text-orange-700 border-orange-100',
];

/** Initials avatar, e.g. "Tống Văn Khánh" → TK, with a stable colour per name. */
export function StudentAvatar({ name, className = '' }: StudentAvatarProps) {
  return <span role="img" aria-label={name}
    className={`inline-flex shrink-0 select-none items-center justify-center overflow-hidden border font-bold ${TONES[avatarTone(name)]} ${className}`}>
    {initialsOf(name)}
  </span>;
}
