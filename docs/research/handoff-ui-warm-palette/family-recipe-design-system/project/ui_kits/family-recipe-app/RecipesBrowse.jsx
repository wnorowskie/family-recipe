// Recipes browse
function RecipesBrowse({ onOpenPost }) {
  const [activeTags, setActiveTags] = React.useState([
    'quick',
    'family classic',
  ]);
  const recipes = [
    {
      title: 'Lemon Chicken',
      author: 'Mom',
      tags: ['Dinner', 'quick'],
      stats: 'Cooked 3 times · 4.3⭐',
    },
    {
      title: 'Chocolate Chip Cookies',
      author: 'Dad',
      tags: ['Dessert', 'family classic'],
      stats: 'Cooked 12 times · 4.8⭐',
    },
    {
      title: "Grandma's Apple Pie",
      author: 'Sarah',
      tags: ['Dessert', 'family classic'],
      stats: 'Cooked 8 times · 5.0⭐',
    },
    {
      title: 'Sunday Pot Roast',
      author: 'Mom',
      tags: ['Dinner', 'comfort food'],
      stats: 'Cooked 5 times · 4.6⭐',
    },
    {
      title: 'Breakfast Pancakes',
      author: 'Eric',
      tags: ['Breakfast', 'quick'],
      stats: 'Cooked 15 times · 4.5⭐',
    },
  ];
  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-page)' }}>
      <div
        style={{
          background: '#fff',
          padding: '16px 24px',
          borderBottom: '1px solid var(--border-card)',
        }}
      >
        <h2
          style={{
            margin: '0 0 16px 0',
            fontSize: 20,
            fontWeight: 500,
            color: 'var(--fg-strong)',
          }}
        >
          Recipes
        </h2>
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <i
            data-lucide="search"
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 18,
              height: 18,
              color: 'var(--fg-placeholder)',
            }}
          ></i>
          <input
            placeholder="Search by title, author, or ingredient…"
            style={{
              width: '100%',
              paddingLeft: 36,
              paddingRight: 16,
              paddingTop: 8,
              paddingBottom: 8,
              border: '1px solid var(--border-input)',
              borderRadius: 10,
              fontSize: 14,
              fontFamily: 'inherit',
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <FilterBtn>Course</FilterBtn>
          <FilterBtn active>Tags</FilterBtn>
          <div style={{ flex: 1 }} />
          <FilterBtn>Newest</FilterBtn>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {activeTags.map((t) => (
            <Chip
              key={t}
              variant="active"
              onRemove={() => setActiveTags(activeTags.filter((x) => x !== t))}
            >
              {t}
            </Chip>
          ))}
        </div>
      </div>
      <div
        style={{
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {recipes.map((r) => (
          <RecipeRow key={r.title} {...r} onClick={onOpenPost} />
        ))}
      </div>
    </div>
  );
}

function FilterBtn({ children, active }) {
  return (
    <button
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '6px 12px',
        borderRadius: 10,
        background: active ? 'var(--bg-primary)' : '#fff',
        color: active ? '#fff' : 'var(--fg-strong)',
        border: active ? 0 : '1px solid var(--border-input)',
        fontSize: 13,
        fontFamily: 'inherit',
        fontWeight: 500,
        cursor: 'pointer',
      }}
    >
      {children}
      <i data-lucide="chevron-down" style={{ width: 14, height: 14 }}></i>
    </button>
  );
}

window.RecipesBrowse = RecipesBrowse;
