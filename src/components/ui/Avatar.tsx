import type { HTMLAttributes } from 'react';

interface AvatarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  size?: number;
  name?: string | null;
}

export default function Avatar({
  size = 40,
  name,
  className = '',
  style,
  ...rest
}: AvatarProps) {
  const initial = name?.trim().charAt(0).toUpperCase() ?? '';
  const composed = [
    'inline-flex items-center justify-center rounded-full bg-[var(--color-gray-300)] text-white font-medium select-none flex-shrink-0',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={composed}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        ...style,
      }}
      aria-hidden={initial ? undefined : 'true'}
      {...rest}
    >
      {initial}
    </div>
  );
}
