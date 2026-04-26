// Bottom tab bar — 4 slots, "+" sits center as filled FAB
function BottomTabBar({ active, onChange }) {
  const tabs = [
    { id: 'timeline', label: 'Timeline', icon: 'home' },
    { id: 'recipes', label: 'Recipes', icon: 'book' },
    { id: 'add', label: null, icon: 'plus', fab: true },
    { id: 'profile', label: 'Profile', icon: 'user' },
  ];
  return (
    <div
      style={{
        borderTop: '1px solid var(--color-gray-300)',
        background: '#fff',
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
            onClick={() => onChange?.(t.id)}
            style={{
              background: 'transparent',
              border: 0,
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              padding: '4px 16px',
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
                  style={{ width: 24, height: 24, color: '#fff' }}
                ></i>
              </span>
            ) : (
              <i data-lucide={t.icon} style={{ width: 24, height: 24 }}></i>
            )}
            {t.label && <span style={{ fontSize: 12 }}>{t.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

window.BottomTabBar = BottomTabBar;
