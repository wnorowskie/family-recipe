// Login screen
function AuthLogin({ onLogin, onSignup }) {
  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        background: 'var(--bg-page)',
        padding: '48px 24px',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginBottom: 48,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: 40,
            fontWeight: 500,
            letterSpacing: '-0.015em',
            color: 'var(--fg-strong)',
            fontVariationSettings: '"opsz" 40, "SOFT" 50, "WONK" 0',
          }}
        >
          Family Recipe
        </h1>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Email or Username" placeholder="email@example.com" />
        <Field label="Password" placeholder="••••••••" type="password" />
        <div style={{ textAlign: 'right' }}>
          <Button variant="text">Forgot password?</Button>
        </div>
        <div style={{ marginTop: 8 }}>
          <Button variant="primary" full onClick={onLogin}>
            Log In
          </Button>
        </div>
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <Button variant="text" onClick={onSignup}>
            Create account
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, placeholder, type = 'text', required, error, helper }) {
  return (
    <div>
      <label
        style={{
          display: 'block',
          fontSize: 14,
          color: 'var(--fg-body)',
          marginBottom: 4,
          fontWeight: 400,
        }}
      >
        {label}
        {required && <span style={{ color: 'var(--color-red-500)' }}> *</span>}
      </label>
      <input
        type={type}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '12px 14px',
          border: error
            ? '2px solid var(--border-error)'
            : '1px solid var(--border-input)',
          borderRadius: 10,
          background: '#fff',
          fontFamily: 'inherit',
          fontSize: 14,
          color: 'var(--fg-strong)',
          boxSizing: 'border-box',
          outline: 'none',
        }}
      />
      {helper && (
        <p
          style={{
            margin: '4px 0 0 0',
            fontSize: 12,
            color: 'var(--fg-caption)',
          }}
        >
          {helper}
        </p>
      )}
      {error && (
        <p
          style={{
            margin: '4px 0 0 0',
            fontSize: 12,
            color: 'var(--color-red-600)',
          }}
        >
          ⚠ {error}
        </p>
      )}
    </div>
  );
}

window.AuthLogin = AuthLogin;
window.Field = Field;
