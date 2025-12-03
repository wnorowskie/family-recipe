"use client";

import { useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { RecipeListItem } from '@/lib/recipes';

interface TagGroupRecord {
  id: string;
  name: string;
}

interface MemberOption {
  id: string;
  name: string;
}

interface RecipesBrowseClientProps {
  initialItems: RecipeListItem[];
  initialHasMore: boolean;
  initialNextOffset: number;
  tagGroups: Record<string, TagGroupRecord[]>;
  members: MemberOption[];
}

const COURSE_OPTIONS = [
  { value: '', label: 'All courses' },
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'dessert', label: 'Dessert' },
  { value: 'snack', label: 'Snack' },
  { value: 'other', label: 'Other' },
];

type RangeOption = {
  key: string;
  label: string;
  min?: number;
  max?: number;
};

const COOK_TIME_OPTIONS: RangeOption[] = [
  { key: 'any', label: 'Any cook time' },
  { key: 'under-30', label: 'Under 30 min', max: 30 },
  { key: '30-60', label: '30 – 60 min', min: 30, max: 60 },
  { key: '60-120', label: '60 – 120 min', min: 60, max: 120 },
  { key: 'over-120', label: 'Over 2 hours', min: 120 },
];

const SERVING_OPTIONS: RangeOption[] = [
  { key: 'any', label: 'Any servings' },
  { key: '1-2', label: 'Serves 1 – 2', min: 1, max: 2 },
  { key: '3-4', label: 'Serves 3 – 4', min: 3, max: 4 },
  { key: '5-6', label: 'Serves 5 – 6', min: 5, max: 6 },
  { key: '7-plus', label: 'Serves 7+', min: 7 },
];

const DIFFICULTY_OPTIONS = [
  { value: '', label: 'Any difficulty' },
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
];

const PAGE_SIZE = 12;
const TAG_LIMIT = 10;
const INGREDIENT_LIMIT = 5;

export default function RecipesBrowseClient({
  initialItems,
  initialHasMore,
  initialNextOffset,
  tagGroups,
  members,
}: RecipesBrowseClientProps) {
  const [items, setItems] = useState<RecipeListItem[]>(initialItems);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [nextOffset, setNextOffset] = useState(initialNextOffset);
  const [searchInput, setSearchInput] = useState('');
  const [searchValue, setSearchValue] = useState('');
  const [selectedCourses, setSelectedCourses] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedCookTimeKey, setSelectedCookTimeKey] = useState('any');
  const [selectedServingsKey, setSelectedServingsKey] = useState('any');
  const [selectedDifficulties, setSelectedDifficulties] = useState<string[]>([]);
  const [ingredientInput, setIngredientInput] = useState('');
  const [ingredientFilters, setIngredientFilters] = useState<string[]>([]);
  const [selectedAuthorId, setSelectedAuthorId] = useState('');
  const [sortMode, setSortMode] = useState<'recent' | 'alpha'>('recent');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    setIsReady(true);
  }, []);

  const memberOptions = useMemo(
    () => [...members].sort((a, b) => a.name.localeCompare(b.name)),
    [members]
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearchValue(searchInput.trim());
    }, 300);

    return () => clearTimeout(timeout);
  }, [searchInput]);

  const cookTimeSelection = useMemo(
    () => COOK_TIME_OPTIONS.find((option) => option.key === selectedCookTimeKey),
    [selectedCookTimeKey]
  );

  const servingsSelection = useMemo(
    () => SERVING_OPTIONS.find((option) => option.key === selectedServingsKey),
    [selectedServingsKey]
  );

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', '0');
    params.set('sort', sortMode);
    if (searchValue) {
      params.set('search', searchValue);
    }
    selectedCourses.forEach((course) => params.append('course', course));
    selectedDifficulties.forEach((difficulty) => params.append('difficulty', difficulty));
    if (cookTimeSelection) {
      if (typeof cookTimeSelection.min === 'number') {
        params.set('totalTimeMin', String(cookTimeSelection.min));
      }
      if (typeof cookTimeSelection.max === 'number') {
        params.set('totalTimeMax', String(cookTimeSelection.max));
      }
    }
    if (servingsSelection) {
      if (typeof servingsSelection.min === 'number') {
        params.set('servingsMin', String(servingsSelection.min));
      }
      if (typeof servingsSelection.max === 'number') {
        params.set('servingsMax', String(servingsSelection.max));
      }
    }
    selectedTags.forEach((tag) => params.append('tags', tag));
    ingredientFilters.forEach((keyword) => params.append('ingredients', keyword));
    if (selectedAuthorId) {
      params.set('authorId', selectedAuthorId);
    }
    return params.toString();
  }, [
    searchValue,
    selectedCourses,
    selectedTags,
    selectedDifficulties,
    cookTimeSelection,
    servingsSelection,
    ingredientFilters,
    selectedAuthorId,
    sortMode,
  ]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    let isCurrent = true;
    const controller = new AbortController();

    async function fetchRecipes() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/recipes?${queryString}`, {
          credentials: 'include',
          signal: controller.signal,
        });
        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(data?.error?.message ?? 'Failed to load recipes');
        }
        const data = await response.json();
        if (!isCurrent) return;
        setItems(data.items);
        setHasMore(data.hasMore);
        setNextOffset(data.nextOffset);
      } catch (err) {
        if (!isCurrent) return;
        if ((err as Error).name !== 'AbortError') {
          setError(err instanceof Error ? err.message : 'Failed to load recipes');
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false);
        }
      }
    }

    fetchRecipes();

    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [queryString, isReady]);

  const handleLoadMore = async () => {
    if (!hasMore || isLoadingMore) return;
    setIsLoadingMore(true);
    setError(null);
    try {
      const params = new URLSearchParams(queryString);
      params.set('offset', String(nextOffset));
      const response = await fetch(`/api/recipes?${params.toString()}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error?.message ?? 'Failed to load more recipes');
      }
      const data = await response.json();
      setItems((prev) => [...prev, ...data.items]);
      setHasMore(data.hasMore);
      setNextOffset(data.nextOffset);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more recipes');
    } finally {
      setIsLoadingMore(false);
    }
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      if (prev.includes(tag)) {
        return prev.filter((item) => item !== tag);
      }
      if (prev.length >= TAG_LIMIT) {
        return prev;
      }
      return [...prev, tag];
    });
  };

  const toggleCourse = (value: string) => {
    if (!value) {
      setSelectedCourses([]);
      return;
    }
    setSelectedCourses((prev) =>
      prev.includes(value) ? prev.filter((entry) => entry !== value) : [...prev, value]
    );
  };

  const handleCookTimeSelect = (key: string) => {
    if (key === 'any') {
      setSelectedCookTimeKey('any');
      return;
    }
    setSelectedCookTimeKey((prev) => (prev === key ? 'any' : key));
  };

  const handleServingsSelect = (key: string) => {
    if (key === 'any') {
      setSelectedServingsKey('any');
      return;
    }
    setSelectedServingsKey((prev) => (prev === key ? 'any' : key));
  };

  const toggleDifficulty = (value: string) => {
    if (!value) {
      setSelectedDifficulties([]);
      return;
    }
    setSelectedDifficulties((prev) =>
      prev.includes(value) ? prev.filter((entry) => entry !== value) : [...prev, value]
    );
  };

  const handleAddIngredient = () => {
    const trimmed = ingredientInput.trim();
    if (!trimmed) {
      return;
    }
    const normalized = trimmed.toLowerCase();
    setIngredientFilters((prev) => {
      if (prev.length >= INGREDIENT_LIMIT) {
        return prev;
      }
      if (prev.some((entry) => entry.toLowerCase() === normalized)) {
        return prev;
      }
      return [...prev, trimmed];
    });
    setIngredientInput('');
  };

  const handleIngredientKeyDown = (
    event: KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleAddIngredient();
    }
  };

  const removeIngredient = (value: string) => {
    setIngredientFilters((prev) => prev.filter((entry) => entry !== value));
  };

  const resetFilters = () => {
    setSearchInput('');
    setSearchValue('');
    setSelectedCourses([]);
    setSelectedTags([]);
    setSelectedCookTimeKey('any');
    setSelectedServingsKey('any');
    setSelectedDifficulties([]);
    setIngredientFilters([]);
    setIngredientInput('');
    setSelectedAuthorId('');
    setSortMode('recent');
  };

  const courseSummary = selectedCourses.length === 0
    ? 'All courses'
    : selectedCourses.length <= 2
      ? selectedCourses
          .map((course) => course.charAt(0).toUpperCase() + course.slice(1))
          .join(', ')
      : `${selectedCourses.length} selected`;

  const cookTimeSummary = COOK_TIME_OPTIONS.find((option) => option.key === selectedCookTimeKey)?.label ?? 'Any cook time';

  const servingsSummary = SERVING_OPTIONS.find((option) => option.key === selectedServingsKey)?.label ?? 'Any servings';

  const difficultySummary = selectedDifficulties.length === 0
    ? 'Any difficulty'
    : selectedDifficulties.length <= 2
      ? selectedDifficulties
          .map((difficulty) => difficulty.charAt(0).toUpperCase() + difficulty.slice(1))
          .join(', ')
      : `${selectedDifficulties.length} selected`;

  const ingredientSummary = ingredientFilters.length
    ? ingredientFilters.join(', ')
    : 'Any ingredient';

  const tagsSummary = selectedTags.length
    ? `${selectedTags.length}/${TAG_LIMIT} selected`
    : 'None selected';

  const selectedAuthorName = memberOptions.find((member) => member.id === selectedAuthorId)?.name;
  const authorSummary = selectedAuthorId ? selectedAuthorName ?? 'Selected member' : 'Any member';

  const pluralize = (count: number, singular: string, plural?: string) =>
    count === 1 ? `${count} ${singular}` : `${count} ${plural ?? `${singular}s`}`;

  const filterSummaryParts: string[] = [];
  if (selectedCourses.length) filterSummaryParts.push(pluralize(selectedCourses.length, 'course'));
  if (selectedDifficulties.length) filterSummaryParts.push(pluralize(selectedDifficulties.length, 'difficulty', 'difficulties'));
  if (selectedCookTimeKey !== 'any') filterSummaryParts.push('cook time set');
  if (selectedServingsKey !== 'any') filterSummaryParts.push('servings set');
  if (ingredientFilters.length) filterSummaryParts.push(pluralize(ingredientFilters.length, 'ingredient keyword'));
  if (selectedTags.length) filterSummaryParts.push(pluralize(selectedTags.length, 'tag'));
  if (selectedAuthorId) filterSummaryParts.push('author selected');
  const filterSummary = filterSummaryParts.length > 0 ? filterSummaryParts.join(' · ') : 'No filters applied';

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Recipes</h2>
            <p className="text-sm text-gray-500">Browse the family cookbook and find what to cook next.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 lg:justify-end">
            <div className="inline-flex rounded-full border border-gray-200 bg-gray-50 p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setSortMode('recent')}
                className={`rounded-full px-3 py-1.5 transition ${
                  sortMode === 'recent'
                    ? 'bg-white text-gray-900 shadow'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Most recent
              </button>
              <button
                type="button"
                onClick={() => setSortMode('alpha')}
                className={`rounded-full px-3 py-1.5 transition ${
                  sortMode === 'alpha'
                    ? 'bg-white text-gray-900 shadow'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                A-Z title
              </button>
            </div>
            <button
              type="button"
              onClick={resetFilters}
              className="self-start rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Reset filters
            </button>
          </div>
        </div>
        <div className="relative">
          <input
            type="text"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search by recipe title"
            className="w-full rounded-2xl border border-gray-200 px-5 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">⌕</span>
        </div>
      </section>

      <section className="bg-white rounded-2xl shadow-sm">
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-2xl px-6 py-5 text-left"
          onClick={() => setFiltersOpen((prev) => !prev)}
          aria-expanded={filtersOpen}
        >
          <div>
            <p className="text-sm font-semibold text-gray-900">Filters</p>
            <p className="text-xs text-gray-500">{filterSummary}</p>
          </div>
          <svg
            className={`h-5 w-5 text-gray-500 transition-transform ${filtersOpen ? 'rotate-180' : ''}`}
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M5 8l5 5 5-5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {filtersOpen && (
          <div className="border-t border-gray-100 p-6 space-y-3">
            <FilterGroup title="Course" summary={courseSummary}>
            <div className="flex flex-wrap gap-2">
              {COURSE_OPTIONS.map((option) => {
                const isAllOption = option.value === '';
                const isSelected = isAllOption
                  ? selectedCourses.length === 0
                  : selectedCourses.includes(option.value);
                return (
                  <button
                    key={option.value || 'all'}
                    type="button"
                    onClick={() => toggleCourse(option.value)}
                    className={`rounded-full border px-4 py-2 text-sm font-medium ${
                      isSelected
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'border-gray-200 text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </FilterGroup>

          <FilterGroup title="Cook time" summary={cookTimeSummary}>
            <div className="flex flex-wrap gap-2">
              {COOK_TIME_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => handleCookTimeSelect(option.key)}
                  className={`rounded-full border px-4 py-2 text-sm font-medium ${
                    selectedCookTimeKey === option.key
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'border-gray-200 text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </FilterGroup>

          <FilterGroup title="Servings" summary={servingsSummary}>
            <div className="flex flex-wrap gap-2">
              {SERVING_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => handleServingsSelect(option.key)}
                  className={`rounded-full border px-4 py-2 text-sm font-medium ${
                    selectedServingsKey === option.key
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'border-gray-200 text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </FilterGroup>

          <FilterGroup title="Difficulty" summary={difficultySummary}>
            <div className="flex flex-wrap gap-2">
              {DIFFICULTY_OPTIONS.map((option) => {
                const isAllOption = option.value === '';
                const isSelected = isAllOption
                  ? selectedDifficulties.length === 0
                  : selectedDifficulties.includes(option.value);
                return (
                  <button
                    key={option.value || 'any'}
                    type="button"
                    onClick={() => toggleDifficulty(option.value)}
                    className={`rounded-full border px-4 py-2 text-sm font-medium ${
                      isSelected
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'border-gray-200 text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </FilterGroup>

          <FilterGroup title="Family member" summary={authorSummary}>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedAuthorId('')}
                className={`rounded-full border px-4 py-2 text-sm font-medium ${
                  selectedAuthorId === ''
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'border-gray-200 text-gray-700 hover:border-gray-300'
                }`}
              >
                All members
              </button>
              {memberOptions.map((member) => {
                const isSelected = selectedAuthorId === member.id;
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() =>
                      setSelectedAuthorId((prev) => (prev === member.id ? '' : member.id))
                    }
                    className={`rounded-full border px-4 py-2 text-sm font-medium ${
                      isSelected
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'border-gray-200 text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {member.name}
                  </button>
                );
              })}
            </div>
          </FilterGroup>

          <FilterGroup title="Ingredients" summary={ingredientSummary}>
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={ingredientInput}
                  onChange={(event) => setIngredientInput(event.target.value)}
                  onKeyDown={handleIngredientKeyDown}
                  placeholder="Add an ingredient keyword"
                  className="flex-1 rounded-2xl border border-gray-200 px-4 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
                <button
                  type="button"
                  onClick={handleAddIngredient}
                  disabled={!ingredientInput.trim() || ingredientFilters.length >= INGREDIENT_LIMIT}
                  className="rounded-2xl border border-gray-900 px-4 py-2 text-sm font-semibold text-gray-900 disabled:opacity-40"
                >
                  Add
                </button>
              </div>
              {ingredientFilters.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {ingredientFilters.map((keyword) => (
                    <span
                      key={keyword}
                      className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700"
                    >
                      {keyword}
                      <button
                        type="button"
                        onClick={() => removeIngredient(keyword)}
                        className="text-gray-500 hover:text-gray-900"
                        aria-label={`Remove ingredient filter ${keyword}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <p className="text-xs text-gray-500">
                Up to {INGREDIENT_LIMIT} ingredient keywords. Results must include all of them.
              </p>
            </div>
          </FilterGroup>

          <FilterGroup title="Tags" summary={tagsSummary}>
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span className="font-semibold text-gray-700">Pick up to {TAG_LIMIT} tags</span>
                <span>{selectedTags.length}/{TAG_LIMIT} selected</span>
              </div>
              {Object.entries(tagGroups).map(([groupName, tags]) => (
                <div key={groupName} className="space-y-2">
                  <p className="text-xs font-semibold uppercase text-gray-500">
                    {groupName.replace(/-/g, ' ')}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag) => {
                      const selected = selectedTags.includes(tag.name);
                      const disabled = !selected && selectedTags.length >= TAG_LIMIT;
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => toggleTag(tag.name)}
                          disabled={disabled}
                          className={`rounded-full border px-3 py-1 text-sm font-medium ${
                            selected
                              ? 'bg-gray-900 text-white border-gray-900'
                              : 'border-gray-200 text-gray-700 hover:border-gray-300'
                          } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                        >
                          #{tag.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </FilterGroup>
          </div>
        )}
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="space-y-4">
        {isLoading && (
          <p className="text-sm text-gray-500">Loading recipes…</p>
        )}
        {!isLoading && items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center">
            <p className="text-lg font-semibold text-gray-900">No recipes found</p>
            <p className="text-sm text-gray-500 mt-1">Try adjusting your search or filters.</p>
          </div>
        )}
        {items.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            {items.map((recipe) => (
              <Link
                href={`/posts/${recipe.id}`}
                key={recipe.id}
                className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100 flex flex-col"
              >
                <div className="relative h-40 w-full bg-gray-100">
                  {recipe.mainPhotoUrl ? (
                    <Image
                      src={recipe.mainPhotoUrl}
                      alt={recipe.title}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, 50vw"
                      unoptimized
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-gray-400 text-sm">
                      No photo yet
                    </div>
                  )}
                </div>
                <div className="p-4 flex-1 flex flex-col gap-3">
                  <div>
                    <p className="text-sm text-gray-500">
                      {recipe.courses.length > 0
                        ? recipe.courses.join(' · ')
                        : recipe.primaryCourse ?? 'Recipe'}
                      {recipe.difficulty ? ` · ${recipe.difficulty}` : ''}
                    </p>
                    <h3 className="text-lg font-semibold text-gray-900 mt-1">{recipe.title}</h3>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold text-gray-600 overflow-hidden">
                        {recipe.author.avatarUrl ? (
                          <Image
                            src={recipe.author.avatarUrl}
                            alt={recipe.author.name}
                            width={32}
                            height={32}
                            className="h-8 w-8 object-cover"
                            unoptimized
                          />
                        ) : (
                          <span>{recipe.author.name.charAt(0).toUpperCase()}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {recipe.author.name}
                        </p>
                        <p className="text-xs text-gray-500">Family member</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recipe.tags.slice(0, 4).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700"
                      >
                        #{tag}
                      </span>
                    ))}
                    {recipe.tags.length > 4 && (
                      <span className="text-xs text-gray-500">+{recipe.tags.length - 4} more</span>
                    )}
                  </div>
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600">
                    <span>
                      {recipe.totalTime ? `${recipe.totalTime} min` : 'Time n/a'} ·{' '}
                      {recipe.servings ? `${recipe.servings} servings` : 'Servings n/a'}
                    </span>
                    <span>
                      Cooked {recipe.cookedStats.timesCooked}x ·{' '}
                      {recipe.cookedStats.averageRating ? `${recipe.cookedStats.averageRating.toFixed(1)} ★` : 'No ratings'}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {hasMore && items.length > 0 && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={isLoadingMore}
            className="rounded-full bg-gray-900 text-white px-6 py-3 font-semibold disabled:opacity-50"
          >
            {isLoadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}

interface FilterGroupProps {
  title: string;
  summary?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

function FilterGroup({ title, summary, children, defaultOpen = false }: FilterGroupProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="rounded-2xl border border-gray-100">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
      >
        <div className="text-left">
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          {summary && <p className="text-xs text-gray-500">{summary}</p>}
        </div>
        <svg
          className={`h-5 w-5 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M5 8l5 5 5-5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {isOpen && (
        <div className="border-t border-gray-100 px-4 py-4">
          {children}
        </div>
      )}
    </div>
  );
}
