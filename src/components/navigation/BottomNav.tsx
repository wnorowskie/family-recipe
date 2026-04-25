'use client';

import { Book, Home, Plus, User } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavItem = {
  href: string;
  label: string;
  Icon: LucideIcon;
  fab?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: '/timeline', label: 'Timeline', Icon: Home },
  { href: '/recipes', label: 'Recipes', Icon: Book },
  { href: '/add', label: 'Add', Icon: Plus, fab: true },
  { href: '/profile', label: 'Profile', Icon: User },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--border-input)] bg-[var(--bg-surface)]">
      <div className="mx-auto flex max-w-3xl items-center justify-around px-4 py-2">
        {NAV_ITEMS.map(({ href, label, Icon, fab }) => {
          const active = pathname ? pathname.startsWith(href) : false;

          if (fab) {
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                aria-label={label}
                className="flex items-center justify-center rounded-full bg-[var(--bg-primary)] p-3 text-[var(--fg-on-primary)] transition-colors hover:bg-[var(--color-gray-900)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-active)]"
              >
                <Icon size={24} aria-hidden="true" />
              </Link>
            );
          }

          const colorClass = active
            ? 'text-[var(--fg-strong)]'
            : 'text-[var(--color-gray-400)] hover:text-[var(--fg-strong)]';

          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center gap-1 px-4 py-1 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-active)] ${colorClass}`}
            >
              <Icon size={24} aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
