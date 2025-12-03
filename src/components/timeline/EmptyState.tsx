import Link from 'next/link';

export default function EmptyState() {
  return (
    <div className="bg-white rounded-lg shadow p-8 text-center">
      <div className="max-w-sm mx-auto">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 6v6m0 0v6m0-6h6m-6 0H6"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          No activity yet!
        </h3>
        <p className="text-gray-600 mb-6">
          Be the first to share a recipe or post what you&apos;re cooking.
        </p>
        <Link
          href="/add"
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Add Post
        </Link>
      </div>
    </div>
  );
}
