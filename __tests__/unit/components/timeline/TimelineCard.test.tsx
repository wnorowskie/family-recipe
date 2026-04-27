/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import TimelineCard from '@/components/timeline/TimelineCard';
import type { TimelineItem } from '@/lib/timeline';

const baseItem = {
  id: 'post-p1',
  timestamp: new Date('2026-01-01T12:00:00Z'),
  actor: { id: 'u1', name: 'Alice', avatarUrl: null },
  post: { id: 'p1', title: 'Sourdough Loaf', mainPhotoUrl: null },
} as const;

function renderCard(item: TimelineItem) {
  return render(<TimelineCard item={item} />);
}

describe('TimelineCard', () => {
  it('renders the whole card as a single link to the post', () => {
    renderCard({ ...baseItem, type: 'post_created' });

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('/posts/p1');
  });

  it('uses an accessible name that combines actor, verb, and post title', () => {
    renderCard({ ...baseItem, type: 'post_created' });

    expect(
      screen.getByRole('link', { name: /alice posted sourdough loaf/i })
    ).not.toBeNull();
  });

  it('exposes a single link for comment_added variant', () => {
    renderCard({
      ...baseItem,
      type: 'comment_added',
      comment: { id: 'c1', text: 'looks great' },
    });

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('/posts/p1');
  });

  it('exposes a single link for reaction_added variant', () => {
    renderCard({
      ...baseItem,
      type: 'reaction_added',
      reaction: { emoji: '❤️' },
    });

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('/posts/p1');
  });

  it('exposes a single link for cooked_logged variant', () => {
    renderCard({
      ...baseItem,
      type: 'cooked_logged',
      cooked: { rating: 5, note: 'family favorite' },
    });

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('/posts/p1');
  });
});
