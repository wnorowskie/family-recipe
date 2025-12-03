import Image from 'next/image';
import Link from 'next/link';

interface PostPreviewProps {
  post: {
    id: string;
    title: string;
    mainPhotoUrl: string | null;
  };
}

export default function PostPreview({ post }: PostPreviewProps) {
  return (
    <Link
      href={`/posts/${post.id}`}
      className="block mt-2 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
    >
      <div className="flex items-center gap-3">
        {post.mainPhotoUrl && (
          <Image
            src={post.mainPhotoUrl}
            alt={post.title}
            width={64}
            height={64}
            className="w-16 h-16 object-cover rounded"
            unoptimized
          />
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-gray-900 truncate">{post.title}</h3>
        </div>
      </div>
    </Link>
  );
}
