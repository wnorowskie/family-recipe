// Avatar — circular gray-300 placeholder with optional initial
function Avatar({ size = 40, name }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        background: 'var(--color-gray-300)',
        borderRadius: 9999,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.38,
        color: '#fff',
        fontWeight: 500,
      }}
    >
      {name ? name.charAt(0) : ''}
    </div>
  );
}

// Chip — pill in 4 variants
function Chip({ children, variant = 'soft', onRemove, size = 'md' }) {
  const styles = {
    active: { background: 'var(--bg-primary)', color: '#fff', border: 0 },
    soft: {
      background: 'var(--color-gray-200)',
      color: 'var(--fg-body)',
      border: 0,
    },
    outline: {
      background: 'transparent',
      color: 'var(--fg-body)',
      border: '1px solid var(--border-input)',
    },
    muted: {
      background: 'var(--color-gray-100)',
      color: 'var(--fg-meta)',
      border: 0,
      borderRadius: 4,
    },
  };
  const sizes = {
    sm: { padding: '2px 8px', fontSize: 11 },
    md: { padding: '4px 12px', fontSize: 12 },
  };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        borderRadius: variant === 'muted' ? 4 : 9999,
        ...sizes[size],
        ...styles[variant],
      }}
    >
      {children}
      {onRemove && (
        <button
          onClick={onRemove}
          style={{
            background: 'transparent',
            border: 0,
            color: 'inherit',
            cursor: 'pointer',
            marginLeft: 4,
            padding: 0,
          }}
        >
          ×
        </button>
      )}
    </span>
  );
}

// Button
function Button({
  children,
  variant = 'primary',
  onClick,
  leftIcon,
  full = false,
  size = 'md',
}) {
  const variants = {
    primary: { background: 'var(--bg-primary)', color: '#fff', border: 0 },
    secondary: {
      background: '#fff',
      color: 'var(--fg-strong)',
      border: '1px solid var(--border-input)',
    },
    text: {
      background: 'transparent',
      color: 'var(--fg-strong)',
      border: 0,
      textDecoration: 'underline',
      padding: 0,
    },
    destructive: {
      background: '#fff',
      color: 'var(--color-red-600)',
      border: '1px solid var(--border-input)',
    },
  };
  const sizes = {
    sm: { padding: '6px 12px', fontSize: 13 },
    md: { padding: '12px 16px', fontSize: 14 },
  };
  return (
    <button
      onClick={onClick}
      style={{
        borderRadius: 10,
        fontWeight: 500,
        fontFamily: 'inherit',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        width: full ? '100%' : 'auto',
        ...sizes[size],
        ...(variant === 'text' ? { padding: 0, fontSize: 14 } : {}),
        ...variants[variant],
      }}
    >
      {leftIcon && (
        <i data-lucide={leftIcon} style={{ width: 18, height: 18 }}></i>
      )}
      {children}
    </button>
  );
}

window.Avatar = Avatar;
window.Chip = Chip;
window.Button = Button;
