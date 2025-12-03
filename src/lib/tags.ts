import { prisma } from '@/lib/prisma';

export interface TagRecord {
  id: string;
  name: string;
  type: string | null;
}

export type TagGroup = Record<string, TagRecord[]>;

export async function getAllTags(): Promise<TagGroup> {
  const tags = await prisma.tag.findMany({
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
  });

  return tags.reduce<TagGroup>((groups, tag) => {
    const key = tag.type ?? 'other';
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(tag);
    return groups;
  }, {});
}
