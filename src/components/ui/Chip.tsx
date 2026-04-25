import type { HTMLAttributes, ReactNode } from 'react';

export type ChipVariant = 'active' | 'soft' | 'outline' | 'muted';
export type ChipSize = 'sm' | 'md';

interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: ChipVariant;
  size?: ChipSize;
  onRemove?: () => void;
  children: ReactNode;
}

const variantClasses: Record<ChipVariant, string> = {
  active: 'bg-[var(--bg-primary)] text-[var(--fg-on-primary)] border-0',
  soft: 'bg-[var(--color-gray-200)] text-[var(--fg-body)] border-0',
  outline:
    'bg-transparent text-[var(--fg-body)] border border-[var(--border-input)]',
  muted: 'bg-[var(--color-gray-100)] text-[var(--fg-meta)] border-0',
};

const sizeClasses: Record<ChipSize, string> = {
  sm: 'px-2 py-0.5 text-[11px]',
  md: 'px-3 py-1 text-xs',
};

export default function Chip({
  variant = 'soft',
  size = 'md',
  onRemove,
  className = '',
  children,
  ...rest
}: ChipProps) {
  const radius = variant === 'muted' ? 'rounded' : 'rounded-full';
  const composed = [
    'inline-flex items-center gap-1 font-medium',
    radius,
    sizeClasses[size],
    variantClasses[variant],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={composed} {...rest}>
      {children}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove"
          className="ml-1 cursor-pointer bg-transparent border-0 p-0 leading-none text-current hover:opacity-70"
        >
          ×
        </button>
      ) : null}
    </span>
  );
}
