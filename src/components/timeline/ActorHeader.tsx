import Image from 'next/image';
import { formatRelativeTime } from '@/lib/timeline';

interface ActorHeaderProps {
  actor: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
  action: string;
  timestamp: Date;
  metadata?: string | null;
}

export default function ActorHeader({ actor, action, timestamp, metadata }: ActorHeaderProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold overflow-hidden">
        {actor.avatarUrl ? (
          <Image
            src={actor.avatarUrl}
            alt={actor.name}
            width={40}
            height={40}
            className="w-10 h-10 object-cover"
            unoptimized
          />
        ) : (
          <span>{actor.name.charAt(0).toUpperCase()}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-900">
          <span className="font-semibold">{actor.name}</span>{' '}
          <span className="text-gray-600">{action}</span>
        </p>
        <p className="text-xs text-gray-500">{formatRelativeTime(timestamp)}</p>
      </div>
      {metadata && (
        <span className="text-sm font-semibold text-gray-700">{metadata}</span>
      )}
    </div>
  );
}
