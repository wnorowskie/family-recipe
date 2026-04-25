// Profile
function Profile() {
  const [tab, setTab] = React.useState('posts');
  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-page)' }}>
      <div
        style={{
          background: '#fff',
          padding: '24px',
          borderBottom: '1px solid var(--border-card)',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <Avatar size={80} name="Eric" />
          <h3
            style={{
              margin: '12px 0 0 0',
              fontSize: 18,
              fontWeight: 500,
              color: 'var(--fg-strong)',
            }}
          >
            Eric
          </h3>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-around' }}>
          <Stat n={12} label="Posts" />
          <Stat n={24} label="Cooked" />
          <Stat n={8} label="Favorites" />
        </div>
      </div>

      <div
        style={{
          background: '#fff',
          borderBottom: '1px solid var(--border-card)',
          display: 'flex',
        }}
      >
        <TabBtn id="posts" active={tab} onChange={setTab}>
          My Posts
        </TabBtn>
        <TabBtn id="cooked" active={tab} onChange={setTab}>
          Cooked
        </TabBtn>
        <TabBtn id="favorites" active={tab} onChange={setTab}>
          Favorites
        </TabBtn>
      </div>

      <div
        style={{
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {tab === 'posts' && (
          <>
            <RecipeRow
              title="Breakfast Pancakes"
              author="Eric"
              tags={['Breakfast', 'quick']}
              stats="3 days ago · Cooked 15 times · 4.5⭐"
            />
            <RecipeRow
              title="Spaghetti Carbonara"
              author="Eric"
              tags={['Dinner']}
              stats="1 week ago · Cooked 7 times · 4.2⭐"
            />
          </>
        )}
        {tab === 'cooked' && (
          <>
            <CookedItem
              title="Lemon Chicken"
              author="Mom"
              time="1 day ago"
              rating={4}
            />
            <CookedItem
              title="Chocolate Chip Cookies"
              author="Dad"
              time="5 days ago"
              rating={5}
            />
            <CookedItem
              title="Sunday Pot Roast"
              author="Mom"
              time="1 week ago"
              rating={5}
            />
          </>
        )}
        {tab === 'favorites' && (
          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}
          >
            {['Lemon Chicken', 'Apple Pie', 'Cookies', 'Pot Roast'].map((t) => (
              <div
                key={t}
                style={{
                  background: '#fff',
                  border: '1px solid var(--border-card)',
                  borderRadius: 14,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: 96,
                    background: 'var(--color-gray-200)',
                  }}
                />
                <div style={{ padding: 8 }}>
                  <h4
                    style={{
                      margin: 0,
                      fontSize: 14,
                      fontWeight: 500,
                      color: 'var(--fg-strong)',
                    }}
                  >
                    {t}
                  </h4>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12,
                      color: 'var(--fg-caption)',
                    }}
                  >
                    by Mom
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        <div
          style={{
            marginTop: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            paddingBottom: 16,
          }}
        >
          <Button variant="secondary" full leftIcon="users">
            Family Members
          </Button>
          <Button variant="destructive" full leftIcon="log-out">
            Log Out
          </Button>
        </div>
      </div>
    </div>
  );
}

function Stat({ n, label }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--fg-strong)' }}>
        {n}
      </div>
      <div style={{ fontSize: 12, color: 'var(--fg-caption)' }}>{label}</div>
    </div>
  );
}

function TabBtn({ id, active, onChange, children }) {
  const isActive = id === active;
  return (
    <button
      onClick={() => onChange(id)}
      style={{
        flex: 1,
        padding: '12px 0',
        fontSize: 14,
        fontFamily: 'inherit',
        cursor: 'pointer',
        background: 'transparent',
        border: 0,
        color: isActive ? 'var(--fg-strong)' : 'var(--fg-caption)',
        borderBottom: isActive
          ? '2px solid var(--fg-strong)'
          : '2px solid transparent',
        fontWeight: 500,
      }}
    >
      {children}
    </button>
  );
}

function CookedItem({ title, author, time, rating }) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid var(--border-card)',
        borderRadius: 14,
        padding: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 6,
        }}
      >
        <h4
          style={{
            margin: 0,
            fontSize: 14,
            fontWeight: 500,
            color: 'var(--fg-strong)',
          }}
        >
          {title}
        </h4>
        <span style={{ fontSize: 12, color: 'var(--fg-caption)' }}>{time}</span>
      </div>
      <p style={{ margin: '0 0 6px 0', fontSize: 12, color: 'var(--fg-meta)' }}>
        by {author}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 14 }}>{'⭐'.repeat(rating)}</span>
        <span style={{ fontSize: 12, color: 'var(--fg-caption)' }}>
          ({rating} stars)
        </span>
      </div>
    </div>
  );
}

window.Profile = Profile;
