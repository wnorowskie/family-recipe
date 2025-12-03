import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import AddPostForm, { type PostFormInitialData } from '@/components/add/AddPostForm';
import { getCurrentUser } from '@/lib/session';
import { getPostDetail } from '@/lib/posts';

interface EditPostPageParams {
  params: {
    postId: string;
  };
}

export default async function EditPostPage({ params }: EditPostPageParams) {
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
    redirect('/timeline');
  }

  const canEdit =
    post.author.id === user.id || user.role === 'owner' || user.role === 'admin';

  if (!canEdit) {
    redirect(`/posts/${params.postId}`);
  }

  const initialData: PostFormInitialData = {
    id: post.id,
    title: post.title,
    caption: post.caption,
    photos: post.photos.map((photo) => ({ id: photo.id, url: photo.url })),
    tags: post.tags,
    recipe: post.recipe
      ? {
          origin: post.recipe.origin,
          totalTime: post.recipe.totalTime,
          servings: post.recipe.servings,
          difficulty: post.recipe.difficulty,
          courses: post.recipe.courses,
          ingredients: post.recipe.ingredients.map((ingredient) => ({
            name: ingredient.name,
            unit: ingredient.unit,
            quantity:
              typeof ingredient.quantity === 'number' ? ingredient.quantity : null,
          })),
          steps: post.recipe.steps.map((step) => ({ text: step.text })),
        }
      : null,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto p-4 space-y-6">
        <div>
          <p className="text-sm font-semibold text-gray-500">Editing</p>
          <h1 className="text-2xl font-bold text-gray-900">{post.title}</h1>
          <p className="text-sm text-gray-600 mt-1">
            Make updates to your recipe details and share a quick note about what changed.
          </p>
        </div>
        <AddPostForm mode="edit" postId={post.id} initialData={initialData} />
      </div>
    </div>
  );
}
