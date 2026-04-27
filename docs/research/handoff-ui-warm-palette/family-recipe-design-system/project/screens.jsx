// ── Photos: warm-toned realistic food photos via Unsplash CDN.
// Same images for both variants so the only difference is chrome.
const PHOTOS = {
  lemonChicken:
    'https://images.unsplash.com/photo-1532550907401-a500c9a57435?w=900&q=80&auto=format&fit=crop',
  cookies:
    'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=600&q=80&auto=format&fit=crop',
  potRoast:
    'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&q=80&auto=format&fit=crop',
  sourdough:
    'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&q=80&auto=format&fit=crop',
};

// ── TIMELINE CARD ──────────────────────────────────────────────
function TLCard({
  kind,
  who,
  target,
  time,
  photo,
  comment,
  rating,
  avatarTint,
}) {
  const ICONS = {
    posted: 'file-text',
    commented: 'message-circle',
    cooked: 'chef-hat',
    reaction: 'heart',
  };
  const VERBS = {
    posted: ' posted ',
    commented: ' commented on ',
    cooked: ' cooked ',
    reaction: ' reacted to ',
  };
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-card)',
        borderRadius: 14,
        padding: 14,
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <i
          data-lucide={ICONS[kind]}
          style={{
            width: 18,
            height: 18,
            color: 'var(--fg-caption)',
            marginTop: 3,
            flexShrink: 0,
          }}
        ></i>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, lineHeight: 1.45 }}>
            <span style={{ color: 'var(--fg-strong)', fontWeight: 500 }}>
              {who}
            </span>
            <span style={{ color: 'var(--fg-meta)' }}>{VERBS[kind]}</span>
            <span style={{ color: 'var(--fg-strong)' }}>‘{target}’</span>
          </p>
          {photo && (
            <div
              style={{
                marginTop: 10,
                width: '100%',
                height: 150,
                background: `var(--photo-placeholder) center/cover no-repeat`,
                backgroundImage: `url(${photo})`,
                borderRadius: 10,
              }}
            />
          )}
          {comment && (
            <div
              style={{
                marginTop: 8,
                background: 'var(--bg-page)',
                border: '1px solid var(--border-card)',
                borderRadius: 10,
                padding: '10px 12px',
                fontSize: 13.5,
                color: 'var(--fg-body)',
                lineHeight: 1.5,
              }}
            >
              “{comment}”
            </div>
          )}
          {rating && (
            <div
              style={{
                marginTop: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span style={{ fontSize: 13 }}>{'⭐'.repeat(rating)}</span>
              <span style={{ fontSize: 12, color: 'var(--fg-caption)' }}>
                · loved it
              </span>
            </div>
          )}
          {kind === 'reaction' && (
            <div
              style={{ marginTop: 8, fontSize: 13.5, color: 'var(--fg-body)' }}
            >
              <span style={{ fontSize: 16, marginRight: 6 }}>❤️</span>
              with “delicious!”
            </div>
          )}
          <p style={{ marginTop: 8, fontSize: 12, color: 'var(--fg-caption)' }}>
            {time}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── TIMELINE SCREEN ────────────────────────────────────────────
function Timeline() {
  return (
    <>
      <Header title="Family Timeline" rightIcon="bell" />
      <div
        style={{
          flex: 1,
          overflowY: 'hidden',
          background: 'var(--bg-page)',
          padding: '14px 14px 80px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <TLCard
          kind="posted"
          who="Mom"
          target="Lemon Chicken"
          time="2 hours ago"
          photo={PHOTOS.lemonChicken}
        />
        <TLCard
          kind="commented"
          who="Eric"
          target="Lemon Chicken"
          time="5 hours ago"
          comment="This was amazing! The lemon flavor was perfect."
        />
        <TLCard
          kind="cooked"
          who="Sarah"
          target="Sunday Pot Roast"
          time="1 day ago"
          rating={5}
        />
        <TLCard
          kind="reaction"
          who="Dad"
          target="Chocolate Chip Cookies"
          time="2 days ago"
        />
      </div>
    </>
  );
}

// ── POST DETAIL SCREEN ─────────────────────────────────────────
function PostDetail() {
  return (
    <>
      <Header
        title="Lemon Chicken"
        leftIcon="arrow-left"
        rightIcon="more-vertical"
      />
      <div
        style={{ flex: 1, overflowY: 'hidden', background: 'var(--bg-page)' }}
      >
        {/* Title block */}
        <div
          style={{
            background: 'var(--bg-surface)',
            padding: '14px 20px',
            borderBottom: '1px solid var(--border-card)',
          }}
        >
          <h1 style={{ fontSize: 24, marginBottom: 10 }}>Lemon Chicken</h1>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar size={36} name="Mom" />
              <div>
                <p
                  style={{
                    fontSize: 14,
                    color: 'var(--fg-strong)',
                    fontWeight: 500,
                  }}
                >
                  Mom
                </p>
                <p style={{ fontSize: 12, color: 'var(--fg-caption)' }}>
                  2 hours ago
                </p>
              </div>
            </div>
            <Button variant="secondary" size="sm">
              Edit
            </Button>
          </div>
        </div>

        {/* Hero photo */}
        <div style={{ position: 'relative' }}>
          <div
            style={{
              width: '100%',
              height: 220,
              background: `var(--photo-placeholder) center/cover no-repeat`,
              backgroundImage: `url(${PHOTOS.lemonChicken})`,
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: 10,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: 5,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                background: '#fff',
                borderRadius: 9999,
              }}
            />
            <span
              style={{
                width: 7,
                height: 7,
                background: 'rgba(255,255,255,0.55)',
                borderRadius: 9999,
              }}
            />
            <span
              style={{
                width: 7,
                height: 7,
                background: 'rgba(255,255,255,0.55)',
                borderRadius: 9999,
              }}
            />
          </div>
        </div>

        {/* Body */}
        <div
          style={{
            background: 'var(--bg-surface)',
            padding: '14px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Chip variant="soft">Dinner</Chip>
            <Chip variant="soft">Easy</Chip>
            <Chip variant="muted">quick</Chip>
            <Chip variant="muted">family classic</Chip>
          </div>
          <div style={{ display: 'flex', gap: 22, fontSize: 13 }}>
            <div>
              <span style={{ color: 'var(--fg-caption)' }}>Time </span>
              <span style={{ color: 'var(--fg-strong)' }}>45 min</span>
            </div>
            <div>
              <span style={{ color: 'var(--fg-caption)' }}>Serves </span>
              <span style={{ color: 'var(--fg-strong)' }}>4</span>
            </div>
          </div>
          <div>
            <h3 style={{ fontSize: 17, marginBottom: 6 }}>Ingredients</h3>
            <ul
              style={{
                margin: 0,
                padding: 0,
                listStyle: 'none',
                fontSize: 13.5,
                color: 'var(--fg-body)',
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
              }}
            >
              <li>• 4 chicken breasts</li>
              <li>• 2 lemons (juiced)</li>
              <li>• 3 cloves garlic, minced</li>
              <li>• 2 tbsp olive oil</li>
              <li>• Salt and pepper to taste</li>
            </ul>
          </div>
          <div>
            <h3 style={{ fontSize: 17, marginBottom: 6 }}>Steps</h3>
            <ol
              style={{
                margin: 0,
                padding: 0,
                listStyle: 'none',
                fontSize: 13.5,
                color: 'var(--fg-body)',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <li>1. Marinate chicken in lemon juice and garlic for 30 min.</li>
              <li>2. Heat olive oil over medium-high heat.</li>
              <li>3. Cook 6–8 minutes per side until golden.</li>
            </ol>
          </div>
        </div>

        {/* Version note */}
        <div
          style={{
            background: 'var(--bg-muted)',
            padding: '10px 20px',
            borderTop: '1px solid var(--border-card)',
            borderBottom: '1px solid var(--border-card)',
          }}
        >
          <p style={{ fontSize: 12, color: 'var(--fg-meta)' }}>
            Last updated by{' '}
            <span style={{ color: 'var(--fg-strong)' }}>Mom</span> on Jan 5:
            Reduced garlic from 6 cloves to 3.
          </p>
        </div>

        {/* Reactions row */}
        <div
          style={{
            background: 'var(--bg-surface)',
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <p style={{ fontSize: 13, color: 'var(--fg-meta)' }}>
            Cooked 3 times · 4.3⭐
          </p>
          <div style={{ flex: 1 }} />
          <Button variant="primary" size="sm">
            Cooked this
          </Button>
        </div>

        {/* Reactions counts */}
        <div
          style={{
            background: 'var(--bg-surface)',
            padding: '0 20px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            borderBottom: '1px solid var(--border-card)',
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 13,
              color: 'var(--fg-meta)',
            }}
          >
            <span style={{ fontSize: 15 }}>❤️</span>5
          </span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 13,
              color: 'var(--fg-meta)',
            }}
          >
            <span style={{ fontSize: 15 }}>😋</span>3
          </span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 13,
              color: 'var(--fg-meta)',
            }}
          >
            <span style={{ fontSize: 15 }}>👍</span>2
          </span>
          <div style={{ flex: 1 }} />
          <i
            data-lucide="bookmark"
            style={{ width: 18, height: 18, color: 'var(--fg-meta)' }}
          ></i>
        </div>

        {/* Comments */}
        <div
          style={{ background: 'var(--bg-surface)', padding: '12px 20px 16px' }}
        >
          <h3 style={{ fontSize: 16, marginBottom: 12 }}>Comments (2)</h3>
          <div
            style={{
              display: 'flex',
              gap: 8,
              marginBottom: 14,
              paddingBottom: 12,
              borderBottom: '1px solid var(--border-card)',
            }}
          >
            <Avatar size={28} name="You" />
            <input
              placeholder="Add a comment…"
              style={{
                flex: 1,
                padding: '6px 10px',
                border: '1px solid var(--border-input)',
                borderRadius: 10,
                fontSize: 13,
                fontFamily: 'inherit',
                outline: 'none',
                background: 'var(--bg-surface)',
                color: 'var(--fg-body)',
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Comment
              name="Eric"
              time="5 hours ago"
              body="This was amazing! The lemon flavor was perfect."
            />
            <Comment
              name="Dad"
              time="1 day ago"
              body="Adding this to our weekly rotation!"
            />
          </div>
        </div>
      </div>
    </>
  );
}

function Comment({ name, time, body }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <Avatar size={28} name={name} />
      <div style={{ flex: 1 }}>
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'baseline',
            marginBottom: 2,
          }}
        >
          <span
            style={{
              fontSize: 13.5,
              color: 'var(--fg-strong)',
              fontWeight: 500,
            }}
          >
            {name}
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--fg-caption)' }}>
            {time}
          </span>
        </div>
        <p style={{ fontSize: 13.5, color: 'var(--fg-body)' }}>{body}</p>
      </div>
    </div>
  );
}

Object.assign(window, { Timeline, PostDetail });
