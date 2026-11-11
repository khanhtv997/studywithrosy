interface BrandLogoProps {
  /** Rendered size in pixels; the image is 128/192 px so it stays sharp on retina screens. */
  size?: number;
  className?: string;
}

/** The EduAssess mark (public/logo-*.png, cut from eduassess_logo_icon.jpg). Decorative: the name is always written next to it. */
export function BrandLogo({ size = 40, className = '' }: BrandLogoProps) {
  return <img src={size > 64 ? '/logo-192.png' : '/logo-128.png'} width={size} height={size} alt="" aria-hidden="true"
    className={`brand-logo ${className}`} draggable={false} />;
}
