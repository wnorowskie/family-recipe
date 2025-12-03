import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import PostDetailView from '@/components/post/PostDetailView';
import { getCurrentUser } from '@/lib/session';
import { getPostDetail } from '@/lib/posts';

interface PostDetailPageProps {
  params: {
    postId: string;
  };
}

export default async function PostDetailPage({ params }: PostDetailPageProps) {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('session');

  if (!sessionCookie) {
    redirect('/login');
  }

  const mockRequest = {
    cookies: {
      get: () => sessionCookie,
    },
  } as any;

  const user = await getCurrentUser(mockRequest);

  if (!user) {
    redirect('/login');
  }

  const post = await getPostDetail(params.postId, user.familySpaceId, user.id);

  if (!post) {
    notFound();
  }

  const canEdit =
    post.author.id === user.id || user.role === 'owner' || user.role === 'admin';

  return (
    <section className="max-w-2xl mx-auto space-y-4">
      <PostDetailView
        post={post}
        canEdit={canEdit}
        currentUser={{
          id: user.id,
          role: user.role,
        }}
      />
    </section>
  );
}
