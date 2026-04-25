// Timeline activity card — used for posted / commented / cooked events
function TimelineCard({
  kind,
  who,
  target,
  time,
  photo,
  comment,
  rating,
  onClick,
}) {
  const ICONS = {
    posted: 'file-text',
    commented: 'message-circle',
    cooked: 'chef-hat',
  };
  const VERBS = {
    posted: ' posted ',
    commented: ' commented on ',
    cooked: ' cooked ',
  };
  return (
    <div
      onClick={onClick}
      style={{
        background: '#fff',
        border: '1px solid var(--border-card)',
        borderRadius: 14,
        padding: 16,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <i
          data-lucide={ICONS[kind]}
          style={{
            width: 20,
            height: 20,
            color: 'var(--fg-caption)',
            marginTop: 4,
            flexShrink: 0,
          }}
        ></i>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
            <span style={{ color: 'var(--fg-strong)' }}>{who}</span>
            <span style={{ color: 'var(--fg-meta)' }}>{VERBS[kind]}</span>
            <span style={{ color: 'var(--fg-strong)' }}>'{target}'</span>
          </p>
          {photo && (
            <div
              style={{
                marginTop: 8,
                width: '100%',
                height: 128,
                background: 'var(--color-gray-200)',
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
                padding: 12,
                fontSize: 14,
                color: 'var(--fg-body)',
              }}
            >
              "{comment}"
            </div>
          )}
          {rating && (
            <div
              style={{
                marginTop: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span style={{ fontSize: 14 }}>{'⭐'.repeat(rating)}</span>
              <span style={{ fontSize: 12, color: 'var(--fg-caption)' }}>
                ({rating} stars)
              </span>
            </div>
          )}
          <p
            style={{
              margin: '8px 0 0 0',
              fontSize: 12,
              color: 'var(--fg-caption)',
            }}
          >
            {time}
          </p>
        </div>
      </div>
    </div>
  );
}

// Recipe row — thumb + title + author + tags + stats
function RecipeRow({ title, author, tags, stats, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: '#fff',
        border: '1px solid var(--border-card)',
        borderRadius: 14,
        padding: 12,
        display: 'flex',
        gap: 12,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div
        style={{
          width: 96,
          height: 96,
          background: 'var(--color-gray-200)',
          borderRadius: 10,
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3
          style={{
            margin: '0 0 4px 0',
            fontSize: 16,
            fontWeight: 500,
            color: 'var(--fg-strong)',
          }}
        >
          {title}
        </h3>
        <p
          style={{ margin: '0 0 8px 0', fontSize: 12, color: 'var(--fg-meta)' }}
        >
          by {author}
        </p>
        <div
          style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}
        >
          {tags.map((t) => (
            <Chip key={t} variant="muted" size="sm">
              {t}
            </Chip>
          ))}
        </div>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-caption)' }}>
          {stats}
        </p>
      </div>
    </div>
  );
}

// Comment
function CommentItem({ name, time, body, photo }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <Avatar size={32} name={name} />
      <div style={{ flex: 1 }}>
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            marginBottom: 4,
          }}
        >
          <span style={{ fontSize: 14, color: 'var(--fg-strong)' }}>
            {name}
          </span>
          <span style={{ fontSize: 12, color: 'var(--fg-caption)' }}>
            {time}
          </span>
        </div>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--fg-body)' }}>
          {body}
        </p>
        {photo && (
          <div
            style={{
              marginTop: 8,
              width: 80,
              height: 80,
              background: 'var(--color-gray-200)',
              borderRadius: 10,
            }}
          />
        )}
      </div>
    </div>
  );
}

window.TimelineCard = TimelineCard;
window.RecipeRow = RecipeRow;
window.CommentItem = CommentItem;
