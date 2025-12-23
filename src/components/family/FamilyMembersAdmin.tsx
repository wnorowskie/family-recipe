'use client';

import { useState } from 'react';
import Image from 'next/image';

interface FamilyMemberSummary {
  userId: string;
  membershipId: string;
  name: string;
  email: string;
  username: string;
  emailOrUsername: string;
  avatarUrl: string | null;
  role: string;
  joinedAt: string;
  postCount: number;
}

interface FamilyMembersAdminProps {
  initialMembers: FamilyMemberSummary[];
  currentUserId: string;
  currentUserRole: string;
}

function isAdmin(role: string): boolean {
  return role === 'owner' || role === 'admin';
}

export default function FamilyMembersAdmin({
  initialMembers,
  currentUserId,
  currentUserRole,
}: FamilyMembersAdminProps) {
  const [members, setMembers] = useState(initialMembers);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRemove = async (userId: string) => {
    if (!confirm('Remove this member from the family space?')) {
      return;
    }
    setLoadingId(userId);
    setError(null);
    try {
      const response = await fetch(`/api/family/members/${userId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error?.message ?? 'Unable to remove member');
      }
      setMembers((prev) => prev.filter((member) => member.userId !== userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove member');
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="rounded-3xl border border-gray-100 bg-white shadow-sm divide-y divide-gray-100">
        {members.map((member) => {
          const canRemove =
            isAdmin(currentUserRole) &&
            member.role !== 'owner' &&
            member.userId !== currentUserId;
          return (
            <article
              key={member.userId}
              className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-4">
                {member.avatarUrl ? (
                  <div className="relative h-12 w-12 overflow-hidden rounded-full">
                    <Image
                      src={member.avatarUrl}
                      alt={member.name}
                      fill
                      className="object-cover"
                      sizes="48px"
                      unoptimized
                    />
                  </div>
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-base font-semibold text-gray-600">
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="font-semibold text-gray-900">{member.name}</p>
                  <p className="text-sm text-gray-500">
                    @{member.username} · {member.email}
                  </p>
                  <p className="text-xs text-gray-400">
                    Joined{' '}
                    {new Intl.DateTimeFormat('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    }).format(new Date(member.joinedAt))}
                    {' · '}Posts {member.postCount}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                    member.role === 'owner'
                      ? 'bg-amber-100 text-amber-800'
                      : member.role === 'admin'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {member.role}
                </span>
                {canRemove && (
                  <button
                    type="button"
                    onClick={() => handleRemove(member.userId)}
                    disabled={loadingId === member.userId}
                    className="rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    {loadingId === member.userId ? 'Removing…' : 'Remove'}
                  </button>
                )}
              </div>
            </article>
          );
        })}
        {members.length === 0 && (
          <p className="p-6 text-center text-sm text-gray-500">
            No members found.
          </p>
        )}
      </div>
    </div>
  );
}
