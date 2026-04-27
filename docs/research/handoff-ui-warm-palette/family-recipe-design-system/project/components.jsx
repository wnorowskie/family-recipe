// Theme-aware primitives, identical shapes between gray + warm.

function Avatar({ size = 40, name, tint }) {
  // tint = optional initial bg (only used when we want differentiation)
  return (
    <div
      style={{
        width: size,
        height: size,
        background: tint || 'var(--color-gray-300)',
        borderRadius: 9999,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.38,
        color: '#fff',
        fontWeight: 500,
        fontFamily: 'var(--font-body)',
      }}
    >
      {name ? name.charAt(0) : ''}
    </div>
  );
}

function Chip({ children, variant = 'soft', size = 'md' }) {
  const variants = {
    active: {
      background: 'var(--bg-primary)',
      color: 'var(--fg-on-primary)',
      border: 0,
    },
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
        ...variants[variant],
      }}
    >
      {children}
    </span>
  );
}

function Button({ children, variant = 'primary', size = 'md', leftIcon }) {
  const variants = {
    primary: {
      background: 'var(--bg-primary)',
      color: 'var(--fg-on-primary)',
      border: 0,
    },
    secondary: {
      background: 'var(--bg-surface)',
      color: 'var(--fg-strong)',
      border: '1px solid var(--border-input)',
    },
  };
  const sizes = {
    sm: { padding: '6px 12px', fontSize: 13 },
    md: { padding: '12px 16px', fontSize: 14 },
  };
  return (
    <button
      style={{
        borderRadius: 10,
        fontWeight: 500,
        fontFamily: 'inherit',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        ...sizes[size],
        ...variants[variant],
      }}
    >
      {leftIcon && (
        <i data-lucide={leftIcon} style={{ width: 16, height: 16 }}></i>
      )}
      {children}
    </button>
  );
}

// ── Header ─────────────────────────────────────────────────────
function Header({ title, leftIcon, rightIcon }) {
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-card)',
        padding: '14px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        flexShrink: 0,
      }}
    >
      {leftIcon ? (
        <button style={iconBtn}>
          <i
            data-lucide={leftIcon}
            style={{ width: 22, height: 22, color: 'var(--fg-strong)' }}
          ></i>
        </button>
      ) : (
        <div style={{ width: 22 }} />
      )}
      <h2
        style={{
          fontSize: 19,
          fontWeight: 500,
          flex: 1,
          textAlign: leftIcon ? 'left' : 'left',
          marginLeft: leftIcon ? 4 : 0,
        }}
      >
        {title}
      </h2>
      {rightIcon && (
        <button style={iconBtn}>
          <i
            data-lucide={rightIcon}
            style={{ width: 22, height: 22, color: 'var(--fg-meta)' }}
          ></i>
        </button>
      )}
    </div>
  );
}
const iconBtn = {
  background: 'transparent',
  border: 0,
  padding: 0,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
};

// ── Bottom tab bar ─────────────────────────────────────────────
function BottomTabBar({ active = 'timeline' }) {
  const tabs = [
    { id: 'timeline', label: 'Timeline', icon: 'home' },
    { id: 'recipes', label: 'Recipes', icon: 'book' },
    { id: 'add', icon: 'plus', fab: true },
    { id: 'profile', label: 'Profile', icon: 'user' },
  ];
  return (
    <div
      style={{
        borderTop: '1px solid var(--color-gray-300)',
        background: 'var(--bg-surface)',
        padding: '8px 16px',
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        flexShrink: 0,
      }}
    >
      {tabs.map((t) => {
        const isActive = t.id === active;
        const color = isActive ? 'var(--fg-strong)' : 'var(--color-gray-400)';
        return (
          <button
            key={t.id}
            style={{
              background: 'transparent',
              border: 0,
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              padding: '4px 12px',
              color,
            }}
          >
            {t.fab ? (
              <span
                style={{
                  background: 'var(--bg-primary)',
                  borderRadius: 9999,
                  padding: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <i
                  data-lucide={t.icon}
                  style={{
                    width: 22,
                    height: 22,
                    color: 'var(--fg-on-primary)',
                  }}
                ></i>
              </span>
            ) : (
              <i data-lucide={t.icon} style={{ width: 22, height: 22 }}></i>
            )}
            {t.label && <span style={{ fontSize: 11 }}>{t.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ── Mobile frame ───────────────────────────────────────────────
function MobileFrame({ children, label }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <div
        style={{
          width: 390,
          height: 760,
          background: 'var(--bg-surface)',
          border: '4px solid var(--device-frame)',
          borderRadius: 40,
          overflow: 'hidden',
          boxShadow: 'var(--shadow-frame)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {children}
      </div>
      {label && (
        <span
          style={{
            fontSize: 11,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: '#7a6f64',
            fontFamily: 'var(--font-body)',
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}

Object.assign(window, {
  Avatar,
  Chip,
  Button,
  Header,
  BottomTabBar,
  MobileFrame,
});
