import { redirect } from 'next/navigation';
import RecipesBrowseClient from '@/components/recipes/RecipesBrowseClient';
import { resolvePageUser } from '@/lib/session';
import { getRecipes } from '@/lib/recipes';
import { getAllTags } from '@/lib/tags';
import { getFamilyMembers } from '@/lib/family';

const INITIAL_LIMIT = 12;

interface RecipesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RecipesPage(_props: RecipesPageProps) {
  const user = await resolvePageUser();

  if (!user) {
    // `_se=1` marks a session error so the middleware lets /login through;
    // see resolvePageUser in src/lib/session.ts.
    redirect('/login?_se=1');
  }

  const [recipesResult, tagGroups, members] = await Promise.all([
    getRecipes({
      familySpaceId: user.familySpaceId,
      limit: INITIAL_LIMIT,
      offset: 0,
    }),
    getAllTags(),
    getFamilyMembers(user.familySpaceId),
  ]);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Browse Recipes</h2>
        <p className="text-sm text-gray-500">
          Filter and search the family cookbook.
        </p>
      </div>
      <RecipesBrowseClient
        initialItems={recipesResult.items}
        initialHasMore={recipesResult.hasMore}
        initialNextOffset={recipesResult.nextOffset}
        tagGroups={Object.entries(tagGroups).reduce(
          (acc, [key, value]) => {
            acc[key] = value.map((tag) => ({ id: tag.id, name: tag.name }));
            return acc;
          },
          {} as Record<string, { id: string; name: string }[]>
        )}
        members={members.map((member) => ({
          id: member.userId,
          name: member.name,
        }))}
      />
    </section>
  );
}
