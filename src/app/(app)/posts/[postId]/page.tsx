import { notFound, redirect } from 'next/navigation';
import PostDetailView from '@/components/post/PostDetailView';
import { resolvePageUser } from '@/lib/session';
import { getPostDetail } from '@/lib/posts';

interface PostDetailPageProps {
  params: Promise<{
    postId: string;
  }>;
}

export default async function PostDetailPage(props: PostDetailPageProps) {
  const params = await props.params;
  const user = await resolvePageUser();

  if (!user) {
    // `_se=1` marks a session error so the middleware lets /login through;
    // see resolvePageUser in src/lib/session.ts.
    redirect('/login?_se=1');
  }

  const post = await getPostDetail(params.postId, user.familySpaceId, user.id);

  if (!post) {
    notFound();
  }

  const canEdit =
    post.author.id === user.id ||
    user.role === 'owner' ||
    user.role === 'admin';

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
