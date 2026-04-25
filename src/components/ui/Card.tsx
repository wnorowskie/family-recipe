import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';

type CardProps = HTMLAttributes<HTMLDivElement>;

const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className = '', children, ...rest },
  ref
) {
  const composed = [
    'bg-[var(--bg-surface)] border border-[var(--border-card)] rounded-card p-4',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={ref} className={composed} {...rest}>
      {children}
    </div>
  );
});

export default Card;
