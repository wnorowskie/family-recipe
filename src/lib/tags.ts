export interface TagRecord {
  id: string;
  name: string;
  type: string | null;
}

export type TagGroup = Record<string, TagRecord[]>;

const TAG_GROUP_DEFINITIONS: Array<{ type: string; names: string[] }> = [
  {
    type: 'diet-preference',
    names: ['vegetarian', 'vegan', 'pescatarian'],
  },
  {
    type: 'allergen-safe',
    names: ['nut-free', 'dairy-free', 'gluten-free'],
  },
];

export async function getAllTags(): Promise<TagGroup> {
  return TAG_GROUP_DEFINITIONS.reduce((groups: TagGroup, group) => {
    groups[group.type] = group.names.map((name) => ({
      id: `${group.type}:${name}`,
      name,
      type: group.type,
    }));
    return groups;
  }, {} as TagGroup);
}
