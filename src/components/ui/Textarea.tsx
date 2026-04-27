import { forwardRef } from 'react';
import type { TextareaHTMLAttributes } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    { invalid = false, className = '', rows = 3, ...rest },
    ref
  ) {
    const composed = [
      'w-full px-4 py-3 rounded-input border bg-[var(--bg-surface)] text-[var(--fg-strong)] text-base placeholder:text-[var(--fg-placeholder)]',
      'resize-y leading-normal',
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-active)] focus-visible:ring-offset-1',
      invalid ? 'border-[var(--border-error)]' : 'border-[var(--border-input)]',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return <textarea ref={ref} rows={rows} className={composed} {...rest} />;
  }
);

export default Textarea;
