// Post / Recipe Detail
function PostDetail({ onBack }) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-page)' }}>
      {/* Title block */}
      <div
        style={{
          background: '#fff',
          padding: '16px 24px',
          borderBottom: '1px solid var(--border-card)',
        }}
      >
        <h1
          style={{
            margin: '0 0 12px 0',
            fontSize: 24,
            fontWeight: 500,
            color: 'var(--fg-strong)',
          }}
        >
          Lemon Chicken
        </h1>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Avatar size={40} name="Mom" />
            <div>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--fg-strong)' }}>
                Mom
              </p>
              <p
                style={{ margin: 0, fontSize: 12, color: 'var(--fg-caption)' }}
              >
                2 hours ago
              </p>
            </div>
          </div>
          <Button variant="secondary" size="sm">
            Edit
          </Button>
        </div>
      </div>

      {/* Photo */}
      <div style={{ position: 'relative' }}>
        <div
          style={{
            width: '100%',
            height: 256,
            background: 'var(--color-gray-200)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: 4,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              background: '#fff',
              borderRadius: 9999,
            }}
          />
          <span
            style={{
              width: 8,
              height: 8,
              background: 'rgba(255,255,255,0.5)',
              borderRadius: 9999,
            }}
          />
          <span
            style={{
              width: 8,
              height: 8,
              background: 'rgba(255,255,255,0.5)',
              borderRadius: 9999,
            }}
          />
        </div>
      </div>

      {/* Body */}
      <div
        style={{
          background: '#fff',
          padding: '16px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Chip variant="soft">Dinner</Chip>
          <Chip variant="soft">Easy</Chip>
          <Chip variant="soft">quick</Chip>
          <Chip variant="soft">family classic</Chip>
        </div>
        <div style={{ display: 'flex', gap: 24, fontSize: 14 }}>
          <div>
            <span style={{ color: 'var(--fg-caption)' }}>Time: </span>
            <span style={{ color: 'var(--fg-strong)' }}>45 min</span>
          </div>
          <div>
            <span style={{ color: 'var(--fg-caption)' }}>Serves: </span>
            <span style={{ color: 'var(--fg-strong)' }}>4</span>
          </div>
        </div>
        <div>
          <h3
            style={{
              margin: '0 0 8px 0',
              fontSize: 18,
              fontWeight: 500,
              color: 'var(--fg-strong)',
            }}
          >
            Ingredients
          </h3>
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: 'none',
              fontSize: 14,
              color: 'var(--fg-body)',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <li>• 4 chicken breasts</li>
            <li>• 2 lemons (juiced)</li>
            <li>• 3 cloves garlic (minced)</li>
            <li>• 2 tbsp olive oil</li>
            <li>• Salt and pepper to taste</li>
          </ul>
        </div>
        <div>
          <h3
            style={{
              margin: '0 0 8px 0',
              fontSize: 18,
              fontWeight: 500,
              color: 'var(--fg-strong)',
            }}
          >
            Steps
          </h3>
          <ol
            style={{
              margin: 0,
              padding: 0,
              listStyle: 'none',
              fontSize: 14,
              color: 'var(--fg-body)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <li>
              1. Marinate chicken in lemon juice and garlic for 30 minutes.
            </li>
            <li>2. Heat olive oil in a large pan over medium-high heat.</li>
            <li>3. Cook chicken 6–8 minutes per side until golden.</li>
            <li>4. Let rest 5 minutes before serving.</li>
          </ol>
        </div>
      </div>

      {/* Version note */}
      <div
        style={{
          background: 'var(--bg-muted)',
          padding: '12px 24px',
          borderTop: '1px solid var(--border-card)',
          borderBottom: '1px solid var(--border-card)',
        }}
      >
        <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-meta)' }}>
          Last updated by <span style={{ color: 'var(--fg-strong)' }}>Mom</span>{' '}
          on Jan 5: Reduced garlic from 6 cloves to 3.
        </p>
      </div>

      {/* Stats + reactions */}
      <div
        style={{
          background: '#fff',
          padding: '16px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <p style={{ margin: 0, fontSize: 14, color: 'var(--fg-meta)' }}>
          Cooked 3 times · Avg 4.3⭐
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <ReactionBtn emoji="❤️" count={5} />
          <ReactionBtn emoji="😋" count={3} />
          <ReactionBtn emoji="👍" count={2} />
          <div style={{ flex: 1 }} />
          <Button variant="primary" size="sm">
            Cooked this
          </Button>
          <button
            style={{
              background: 'transparent',
              border: 0,
              padding: 0,
              cursor: 'pointer',
            }}
          >
            <i
              data-lucide="bookmark"
              style={{ width: 20, height: 20, color: 'var(--fg-meta)' }}
            ></i>
          </button>
        </div>
      </div>

      {/* Comments */}
      <div style={{ background: '#fff', padding: '16px 24px', marginTop: 8 }}>
        <h3
          style={{
            margin: '0 0 16px 0',
            fontSize: 18,
            fontWeight: 500,
            color: 'var(--fg-strong)',
          }}
        >
          Comments (3)
        </h3>
        <div
          style={{
            display: 'flex',
            gap: 8,
            marginBottom: 16,
            paddingBottom: 16,
            borderBottom: '1px solid var(--border-card)',
          }}
        >
          <Avatar size={32} name="You" />
          <input
            placeholder="Add a comment…"
            style={{
              flex: 1,
              padding: '8px 12px',
              border: '1px solid var(--border-input)',
              borderRadius: 10,
              fontSize: 14,
              fontFamily: 'inherit',
              outline: 'none',
            }}
          />
          <button
            style={{
              padding: 8,
              border: '1px solid var(--border-input)',
              borderRadius: 10,
              background: '#fff',
              cursor: 'pointer',
            }}
          >
            <i
              data-lucide="camera"
              style={{ width: 18, height: 18, color: 'var(--fg-meta)' }}
            ></i>
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <CommentItem
            name="Eric"
            time="5 hours ago"
            body="This was amazing! The lemon flavor was perfect."
            photo
          />
          <CommentItem
            name="Dad"
            time="1 day ago"
            body="Adding this to our weekly rotation!"
          />
          <CommentItem
            name="Sarah"
            time="2 days ago"
            body="Made this tonight — so good! 🍋"
          />
        </div>
      </div>
    </div>
  );
}

function ReactionBtn({ emoji, count }) {
  return (
    <button
      style={{
        background: 'transparent',
        border: 0,
        padding: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        cursor: 'pointer',
      }}
    >
      <span style={{ fontSize: 18 }}>{emoji}</span>
      <span style={{ fontSize: 14, color: 'var(--fg-meta)' }}>{count}</span>
    </button>
  );
}

window.PostDetail = PostDetail;
