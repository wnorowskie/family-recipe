import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'text' | 'destructive';
export type ButtonSize = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
  leftIcon?: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--bg-primary)] text-[var(--fg-on-primary)] border-0 hover:opacity-92 active:opacity-85',
  secondary:
    'bg-[var(--bg-surface)] text-[var(--fg-strong)] border border-[var(--border-input)] hover:bg-[var(--bg-muted)]',
  text: 'bg-transparent text-[var(--fg-strong)] border-0 underline p-0',
  destructive:
    'bg-[var(--bg-surface)] text-[var(--fg-destructive)] border border-[var(--border-input)] hover:bg-[var(--bg-muted)]',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-[13px]',
  md: 'px-4 py-3 text-sm',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    full = false,
    leftIcon,
    className = '',
    children,
    type = 'button',
    ...rest
  },
  ref
) {
  const isText = variant === 'text';
  const baseClasses =
    'inline-flex items-center justify-center gap-2 rounded-input font-medium transition-opacity disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-active)] focus-visible:ring-offset-1';

  const composed = [
    baseClasses,
    variantClasses[variant],
    isText ? '' : sizeClasses[size],
    full ? 'w-full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button ref={ref} type={type} className={composed} {...rest}>
      {leftIcon ? <span aria-hidden="true">{leftIcon}</span> : null}
      {children}
    </button>
  );
});

export default Button;
