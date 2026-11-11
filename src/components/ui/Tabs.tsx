interface TabOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

interface TabsProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: TabOption<T>[];
  ariaLabel: string;
}

/** Segmented control for a small set of mutually exclusive filters. */
export function Tabs<T extends string>({ value, onChange, options, ariaLabel }: TabsProps<T>) {
  return <div className="segmented" role="group" aria-label={ariaLabel}>
    {options.map(option => <button key={option.value} type="button" aria-pressed={option.value === value}
      className={option.value === value ? 'is-active' : ''} onClick={() => onChange(option.value)}>
      {option.label}
      {option.count !== undefined && <span className="segmented-count">{option.count}</span>}
    </button>)}
  </div>;
}
