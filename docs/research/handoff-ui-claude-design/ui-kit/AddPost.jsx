// AddPost — new post composer with optional collapsible Recipe Details
function AddPost() {
  const [open, setOpen] = React.useState(false);
  const [course, setCourse] = React.useState('Dinner');
  const [difficulty, setDifficulty] = React.useState('Easy');
  const [tags, setTags] = React.useState(['quick', 'family classic']);

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-page)' }}>
      <div
        style={{
          background: '#fff',
          padding: '24px 24px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          borderBottom: '1px solid var(--border-card)',
        }}
      >
        {/* Photos */}
        <div>
          <label style={fieldLabel}>Photos</label>
          <div
            style={{
              border: '2px dashed var(--color-gray-300)',
              borderRadius: 10,
              padding: '24px 16px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              background: 'var(--bg-page)',
            }}
          >
            <i
              data-lucide="camera"
              style={{ width: 28, height: 28, color: 'var(--fg-caption)' }}
            ></i>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--fg-meta)' }}>
              Tap to add photos
            </p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-caption)' }}>
              Up to 5 — JPG, PNG, HEIC
            </p>
          </div>
        </div>

        <Field label="Title" placeholder="Recipe or post title" required />

        <div>
          <label style={fieldLabel}>Caption (optional)</label>
          <textarea
            placeholder="Share the story behind this dish…"
            rows={3}
            style={{
              width: '100%',
              padding: '12px 14px',
              border: '1px solid var(--border-input)',
              borderRadius: 10,
              fontFamily: 'inherit',
              fontSize: 14,
              color: 'var(--fg-strong)',
              boxSizing: 'border-box',
              outline: 'none',
              resize: 'vertical',
              background: '#fff',
            }}
          />
        </div>
      </div>

      {/* Collapsible recipe details */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          textAlign: 'left',
          background: '#fff',
          border: 0,
          borderBottom: '1px solid var(--border-card)',
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <span
          style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-strong)' }}
        >
          Add Recipe Details (Optional)
        </span>
        <i
          data-lucide="chevron-down"
          style={{
            width: 18,
            height: 18,
            color: 'var(--fg-meta)',
            transform: open ? 'rotate(180deg)' : 'rotate(0)',
            transition: 'transform 150ms cubic-bezier(0.4,0,0.2,1)',
          }}
        ></i>
      </button>

      {open && (
        <div
          style={{
            background: '#fff',
            padding: '0 24px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <Field
            label="Origin"
            placeholder="e.g. Grandma's recipe, NYT Cooking…"
          />

          <div>
            <label style={fieldLabel}>Ingredients</label>
            <textarea
              placeholder={
                '4 chicken breasts\n2 lemons (juiced)\n3 cloves garlic'
              }
              rows={4}
              style={textareaStyle}
            />
          </div>

          <div>
            <label style={fieldLabel}>Steps</label>
            <textarea
              placeholder={
                '1. Marinate chicken\n2. Heat oil in pan\n3. Cook 6–8 min per side'
              }
              rows={4}
              style={textareaStyle}
            />
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <Field label="Time" placeholder="45 min" />
            </div>
            <div style={{ flex: 1 }}>
              <Field label="Serves" placeholder="4" />
            </div>
          </div>

          <div>
            <label style={fieldLabel}>Course</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['Breakfast', 'Lunch', 'Dinner', 'Dessert', 'Snack'].map((c) => (
                <PillSelect
                  key={c}
                  active={course === c}
                  onClick={() => setCourse(c)}
                >
                  {c}
                </PillSelect>
              ))}
            </div>
          </div>

          <div>
            <label style={fieldLabel}>Difficulty</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['Easy', 'Medium', 'Hard'].map((d) => (
                <PillSelect
                  key={d}
                  active={difficulty === d}
                  onClick={() => setDifficulty(d)}
                >
                  {d}
                </PillSelect>
              ))}
            </div>
          </div>

          <div>
            <label style={fieldLabel}>Tags</label>
            <div
              style={{
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
                marginBottom: 8,
              }}
            >
              {tags.map((t) => (
                <Chip
                  key={t}
                  variant="active"
                  onRemove={() => setTags(tags.filter((x) => x !== t))}
                >
                  {t}
                </Chip>
              ))}
            </div>
            <input
              placeholder="Add a tag and press enter…"
              style={{
                width: '100%',
                padding: '10px 14px',
                border: '1px solid var(--border-input)',
                borderRadius: 10,
                fontFamily: 'inherit',
                fontSize: 14,
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>
        </div>
      )}

      {/* Footer actions */}
      <div style={{ padding: 16, display: 'flex', gap: 8 }}>
        <Button variant="secondary" full>
          Cancel
        </Button>
        <Button variant="primary" full>
          Post
        </Button>
      </div>
    </div>
  );
}

const fieldLabel = {
  display: 'block',
  fontSize: 14,
  color: 'var(--fg-body)',
  marginBottom: 6,
  fontWeight: 400,
};
const textareaStyle = {
  width: '100%',
  padding: '12px 14px',
  border: '1px solid var(--border-input)',
  borderRadius: 10,
  fontFamily: 'inherit',
  fontSize: 14,
  color: 'var(--fg-strong)',
  boxSizing: 'border-box',
  outline: 'none',
  resize: 'vertical',
  background: '#fff',
  lineHeight: 1.5,
};

function PillSelect({ children, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 14px',
        borderRadius: 9999,
        background: active ? 'var(--bg-primary)' : '#fff',
        color: active ? '#fff' : 'var(--fg-body)',
        border: active ? 0 : '1px solid var(--border-input)',
        fontSize: 13,
        fontWeight: 500,
        fontFamily: 'inherit',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

window.AddPost = AddPost;
