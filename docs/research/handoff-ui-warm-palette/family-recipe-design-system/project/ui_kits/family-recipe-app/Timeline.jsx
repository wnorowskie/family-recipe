// Family Timeline
function Timeline({ onOpenPost }) {
  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        background: 'var(--bg-page)',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <TimelineCard
        kind="posted"
        who="Mom"
        target="Lemon Chicken"
        time="2 hours ago"
        photo
        onClick={onOpenPost}
      />
      <TimelineCard
        kind="commented"
        who="Eric"
        target="Lemon Chicken"
        time="5 hours ago"
        comment="This was amazing!"
      />
      <TimelineCard
        kind="cooked"
        who="Eric"
        target="Lemon Chicken"
        time="1 day ago"
        rating={4}
      />
      <TimelineCard
        kind="posted"
        who="Dad"
        target="Chocolate Chip Cookies"
        time="3 days ago"
        photo
      />
      <TimelineCard
        kind="cooked"
        who="Sarah"
        target="Sunday Pot Roast"
        time="1 week ago"
        rating={5}
      />
    </div>
  );
}

window.Timeline = Timeline;
