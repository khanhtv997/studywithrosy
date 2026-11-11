import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import './select-field.css';
import { useI18n } from '../../i18n';

export interface SelectOption { value: string; label: string; disabled?: boolean; }

interface SelectFieldProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  ariaLabel: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  compact?: boolean;
}

export function SelectField({ value, onValueChange, options, ariaLabel, placeholder, className = '', disabled, required, compact }: SelectFieldProps) {
  const { t } = useI18n();
  return <Select.Root value={value} onValueChange={onValueChange} disabled={disabled} required={required}>
    <Select.Trigger aria-label={ariaLabel} className={`app-select-trigger ${compact ? 'is-compact' : ''} ${className}`}>
      <Select.Value placeholder={placeholder ?? t('Chọn một mục')}/>
      <Select.Icon className="app-select-icon"><ChevronDown size={16} aria-hidden="true"/></Select.Icon>
    </Select.Trigger>
    <Select.Portal>
      <Select.Content className="app-select-content" position="popper" sideOffset={6} collisionPadding={12}>
        <Select.Viewport className="app-select-viewport">
          {options.filter(option => option.value !== '').map(option => <Select.Item key={option.value} value={option.value} disabled={option.disabled} className="app-select-item" textValue={option.label}>
            <Select.ItemText>{option.label}</Select.ItemText>
            <Select.ItemIndicator className="app-select-check"><Check size={15} aria-hidden="true"/></Select.ItemIndicator>
          </Select.Item>)}
        </Select.Viewport>
      </Select.Content>
    </Select.Portal>
  </Select.Root>;
}
