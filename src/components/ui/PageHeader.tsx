import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  /** Small line above the title, e.g. a back link or breadcrumb. */
  eyebrow?: ReactNode;
  /** Buttons on the right; they never wrap under each other on wide screens. */
  actions?: ReactNode;
  /** Extra content under the description, e.g. info chips. */
  children?: ReactNode;
}

/** The intro block at the top of every page: title, short description and the page's main actions. */
export function PageHeader({ title, description, icon: Icon, eyebrow, actions, children }: PageHeaderProps) {
  return <header className="page-header">
    <div className="page-header-main">
      {Icon && <span className="page-header-icon"><Icon size={22} aria-hidden="true" /></span>}
      <div className="page-header-text">
        {eyebrow && <div className="page-header-eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
        {children}
      </div>
    </div>
    {actions && <div className="page-header-actions">{actions}</div>}
  </header>;
}

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  tone?: 'indigo' | 'emerald' | 'amber' | 'rose';
}

/** One number with a label, used in the summary row under a page header. */
export function StatCard({ icon: Icon, label, value, tone = 'indigo' }: StatCardProps) {
  return <div className={`stat-card stat-card-${tone}`}>
    <span className="stat-card-icon"><Icon size={20} aria-hidden="true" /></span>
    <div>
      <div className="stat-card-value">{value}</div>
      <div className="stat-card-label">{label}</div>
    </div>
  </div>;
}
