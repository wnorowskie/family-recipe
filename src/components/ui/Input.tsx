import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid = false, className = '', type = 'text', ...rest },
  ref
) {
  const composed = [
    'w-full px-4 py-3 rounded-input border bg-[var(--bg-surface)] text-[var(--fg-strong)] text-base placeholder:text-[var(--fg-placeholder)]',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-active)] focus-visible:ring-offset-1',
    invalid ? 'border-[var(--border-error)]' : 'border-[var(--border-input)]',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <input ref={ref} type={type} className={composed} {...rest} />;
});

export default Input;
