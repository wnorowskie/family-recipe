import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type PillButtonSize = 'sm' | 'md';

interface PillButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children'
> {
  pressed: boolean;
  size?: PillButtonSize;
  children: ReactNode;
}

const sizeClasses: Record<PillButtonSize, string> = {
  sm: 'px-2 py-0.5 text-[11px]',
  md: 'px-3 py-1 text-sm',
};

export default function PillButton({
  pressed,
  size = 'md',
  disabled = false,
  className = '',
  type = 'button',
  children,
  ...rest
}: PillButtonProps) {
  const composed = [
    'inline-flex items-center gap-1 rounded-full font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-active)]',
    sizeClasses[size],
    pressed
      ? 'bg-[var(--bg-primary)] text-[var(--fg-on-primary)] border border-transparent'
      : 'bg-[var(--bg-surface)] text-[var(--fg-body)] border border-[var(--border-input)] hover:border-[var(--border-active)]',
    disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      {...rest}
      type={type}
      aria-pressed={pressed}
      disabled={disabled}
      className={composed}
    >
      {children}
    </button>
  );
}
