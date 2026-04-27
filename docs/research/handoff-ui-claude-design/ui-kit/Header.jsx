// Top header — supports title-only, with-back, and with-action variants
function Header({
  title,
  leftIcon,
  rightIcon,
  onLeft,
  onRight,
  center = false,
}) {
  return (
    <div
      style={{
        background: '#fff',
        borderBottom: '1px solid var(--border-card)',
        padding: '14px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: center ? 'center' : 'space-between',
        gap: 16,
        flexShrink: 0,
      }}
    >
      {leftIcon && (
        <button onClick={onLeft} style={iconBtnStyle}>
          <i data-lucide={leftIcon} style={{ width: 24, height: 24 }}></i>
        </button>
      )}
      <h2
        style={{
          margin: 0,
          fontSize: 20,
          fontWeight: 500,
          color: 'var(--fg-strong)',
          flex: center ? '0' : '1',
          textAlign: center ? 'center' : 'left',
        }}
      >
        {title}
      </h2>
      {rightIcon ? (
        <button onClick={onRight} style={iconBtnStyle}>
          <i
            data-lucide={rightIcon}
            style={{ width: 24, height: 24, color: 'var(--fg-meta)' }}
          ></i>
        </button>
      ) : (
        typeof onRight === 'string' && (
          <button
            onClick={() => {}}
            style={{
              background: 'transparent',
              border: 0,
              color: 'var(--fg-strong)',
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            {onRight}
          </button>
        )
      )}
    </div>
  );
}

const iconBtnStyle = {
  background: 'transparent',
  border: 0,
  padding: 0,
  cursor: 'pointer',
  color: 'var(--fg-strong)',
  display: 'flex',
  alignItems: 'center',
};

window.Header = Header;
