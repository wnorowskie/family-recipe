// Mobile device frame — 375x812 with 4px gray-800 border, 40px radius
function MobileFrame({ children, scale = 1 }) {
  return (
    <div
      style={{
        width: 375,
        height: 812,
        background: '#fff',
        border: '4px solid var(--color-gray-800)',
        borderRadius: 40,
        overflow: 'hidden',
        boxShadow: 'var(--shadow-frame)',
        display: 'flex',
        flexDirection: 'column',
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
      }}
    >
      {children}
    </div>
  );
}

window.MobileFrame = MobileFrame;
