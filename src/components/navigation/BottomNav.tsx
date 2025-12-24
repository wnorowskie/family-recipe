'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/timeline', label: 'Timeline', icon: '🏠' },
  { href: '/recipes', label: 'Recipes', icon: '📚' },
  { href: '/add', label: 'Add', icon: '➕' },
  { href: '/profile', label: 'Profile', icon: '👤' },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-around px-2 py-3">
        {NAV_ITEMS.map((item) => {
          const active = pathname ? pathname.startsWith(item.href) : false;
          const baseClasses =
            'flex flex-col items-center gap-1 rounded-full px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900/40';
          const colorClasses = active
            ? 'text-gray-900 bg-gray-900/5 shadow-sm'
            : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100/80';

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`${baseClasses} ${colorClasses}`}
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
