'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

import { ingredientUnitOptions } from '@/lib/ingredients';
import { MAX_PHOTO_COUNT } from '@/lib/postPayload';
import { type RecipeIngredientUnit } from '@/lib/validation';
import { mapImporterResponseToPrefill } from './importerMapping';

const courseOptions = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'dessert', label: 'Dessert' },
  { value: 'snack', label: 'Snack' },
  { value: 'other', label: 'Other' },
];

const difficultyOptions = [
  { value: '', label: 'Select difficulty' },
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
];

const MAX_PHOTOS = MAX_PHOTO_COUNT;
const MAX_TAGS = 10;
const HOUR_OPTIONS = Array.from({ length: 13 }, (_, index) => index);
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, index) => index * 5);
const SERVING_OPTIONS = Array.from({ length: 16 }, (_, index) => index + 1);
const MAX_COURSES = 3;

interface ExistingPhotoAttachment {
  id: string;
  kind: 'existing';
  url: string;
}

interface NewPhotoAttachment {
  id: string;
  kind: 'new';
  file: File;
  preview: string;
}

type PhotoAttachment = ExistingPhotoAttachment | NewPhotoAttachment;

interface RecipeState {
  origin: string;
  totalTimeHours: string;
  totalTimeMinutes: string;
  servings: string;
  difficulty: string;
}

interface IngredientRow {
  id: string;
  name: string;
  quantity: string;
  unit: RecipeIngredientUnit;
}

interface StepRow {
  id: string;
  text: string;
}

interface PostFormRecipeDetails {
  origin: string | null;
  totalTime: number | null;
  servings: number | null;
  difficulty: string | null;
  courses: string[];
  ingredients: Array<{
    name: string;
    unit: RecipeIngredientUnit;
    quantity: number | null;
  }>;
  steps: Array<{
    text: string;
  }>;
}

export interface PostFormInitialData {
  id: string;
  title: string;
  caption: string | null;
  photos: Array<{ id: string; url: string }>;
  tags: string[];
  recipe: PostFormRecipeDetails | null;
}

const initialRecipeState: RecipeState = {
  origin: '',
  totalTimeHours: '0',
  totalTimeMinutes: '0',
  servings: '',
  difficulty: '',
};

function createRecipeState(): RecipeState {
  return { ...initialRecipeState };
}

function generateLocalId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  return Math.random().toString(36).slice(2);
}

function createIngredientRow(): IngredientRow {
  return {
    id: generateLocalId(),
    name: '',
    quantity: '',
    unit: 'unitless' as RecipeIngredientUnit,
  };
}

function createStepRow(): StepRow {
  return {
    id: generateLocalId(),
    text: '',
  };
}

interface PostFormSnapshot {
  title: string;
  caption: string;
  recipe: RecipeState;
  selectedCourses: string[];
  ingredients: IngredientRow[];
  steps: StepRow[];
  tags: string[];
  photos: PhotoAttachment[];
  recipeOpen: boolean;
}

function minutesToHourMinuteParts(totalMinutes: number | null | undefined) {
  if (!totalMinutes || totalMinutes <= 0) {
    return { hours: '0', minutes: '0' };
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return {
    hours: hours.toString(),
    minutes: minutes.toString(),
  };
}

function buildInitialState(
  initialData?: PostFormInitialData
): PostFormSnapshot {
  if (!initialData) {
    return {
      title: '',
      caption: '',
      recipe: createRecipeState(),
      selectedCourses: [],
      ingredients: [createIngredientRow()],
      steps: [createStepRow()],
      tags: [],
      photos: [],
      recipeOpen: false,
    };
  }

  const recipeDetails = initialData.recipe;
  const timeParts = minutesToHourMinuteParts(recipeDetails?.totalTime ?? null);
  const selectedCourses = recipeDetails?.courses
    ? Array.from(new Set(recipeDetails.courses)).slice(0, MAX_COURSES)
    : [];

  return {
    title: initialData.title ?? '',
    caption: initialData.caption ?? '',
    recipe: {
      origin: recipeDetails?.origin ?? '',
      totalTimeHours: timeParts.hours,
      totalTimeMinutes: timeParts.minutes,
      servings: recipeDetails?.servings
        ? recipeDetails.servings.toString()
        : '',
      difficulty: recipeDetails?.difficulty ?? '',
    },
    selectedCourses,
    ingredients:
      recipeDetails?.ingredients && recipeDetails.ingredients.length > 0
        ? recipeDetails.ingredients.map((ingredient) => ({
            id: generateLocalId(),
            name: ingredient.name,
            quantity:
              typeof ingredient.quantity === 'number'
                ? ingredient.quantity.toString()
                : '',
            unit: ingredient.unit,
          }))
        : [createIngredientRow()],
    steps:
      recipeDetails?.steps && recipeDetails.steps.length > 0
        ? recipeDetails.steps.map((step) => ({
            id: generateLocalId(),
            text: step.text,
          }))
        : [createStepRow()],
    tags: initialData.tags ?? [],
    photos: (initialData.photos ?? []).map((photo) => ({
      id: photo.id,
      kind: 'existing' as const,
      url: photo.url,
    })),
    recipeOpen: Boolean(recipeDetails),
  };
}

interface PostFormProps {
  mode?: 'create' | 'edit';
  postId?: string;
  initialData?: PostFormInitialData;
}

export default function AddPostForm({
  mode = 'create',
  postId,
  initialData,
}: PostFormProps) {
  const router = useRouter();
  const isEditMode = mode === 'edit';

  if (isEditMode && (!postId || !initialData)) {
    throw new Error('Edit mode requires both postId and initialData');
  }

  const initialSnapshot = useMemo(
    () => buildInitialState(initialData),
    [initialData]
  );

  const [title, setTitle] = useState(() => initialSnapshot.title);
  const [caption, setCaption] = useState(() => initialSnapshot.caption);
  const [photos, setPhotos] = useState<PhotoAttachment[]>(
    () => initialSnapshot.photos
  );
  const [recipeOpen, setRecipeOpen] = useState(initialSnapshot.recipeOpen);
  const [recipe, setRecipe] = useState<RecipeState>(
    () => initialSnapshot.recipe
  );
  const [selectedCourses, setSelectedCourses] = useState<string[]>(
    () => initialSnapshot.selectedCourses
  );
  const [ingredients, setIngredients] = useState<IngredientRow[]>(
    () => initialSnapshot.ingredients
  );
  const [steps, setSteps] = useState<StepRow[]>(() => initialSnapshot.steps);
  const [tags, setTags] = useState<string[]>(() => initialSnapshot.tags);
  const [availableTags, setAvailableTags] = useState<
    Record<string, { id: string; name: string }[]>
  >({});
  const [tagsLoading, setTagsLoading] = useState(true);
  const [tagsError, setTagsError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [changeNote, setChangeNote] = useState('');
  const [importUrl, setImportUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importWarning, setImportWarning] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      photos.forEach((photo) => {
        if (photo.kind === 'new') {
          URL.revokeObjectURL(photo.preview);
        }
      });
    };
  }, [photos]);

  useEffect(() => {
    let isMounted = true;

    async function fetchTags() {
      try {
        const response = await fetch('/api/tags', { credentials: 'include' });
        if (!response.ok) {
          throw new Error('Unable to load tags');
        }
        const data = await response.json();
        if (isMounted) {
          setAvailableTags(data.groups ?? {});
        }
      } catch (error) {
        if (isMounted) {
          setTagsError(
            error instanceof Error ? error.message : 'Unable to load tags'
          );
        }
      } finally {
        if (isMounted) {
          setTagsLoading(false);
        }
      }
    }

    fetchTags();

    return () => {
      isMounted = false;
    };
  }, []);

  const recipeHasAnyData = useMemo(() => {
    const hasIngredientContent = ingredients.some(
      (ingredient) => ingredient.name.trim() || ingredient.quantity.trim()
    );
    const hasStepContent = steps.some((step) => step.text.trim().length > 0);
    const hasDuration =
      Number(recipe.totalTimeHours) > 0 || Number(recipe.totalTimeMinutes) > 0;

    return (
      recipe.origin.trim().length > 0 ||
      hasDuration ||
      recipe.servings.trim().length > 0 ||
      recipe.difficulty.length > 0 ||
      hasIngredientContent ||
      hasStepContent ||
      tags.length > 0 ||
      selectedCourses.length > 0
    );
  }, [ingredients, steps, recipe, tags, selectedCourses]);

  const coverPhotoId = photos[0]?.id;

  function handleReset() {
    setFormError(null);
    if (isEditMode && initialData) {
      photos.forEach((photo) => {
        if (photo.kind === 'new') {
          URL.revokeObjectURL(photo.preview);
        }
      });
      const freshState = buildInitialState(initialData);
      setTitle(freshState.title);
      setCaption(freshState.caption);
      setPhotos(freshState.photos);
      setRecipe(freshState.recipe);
      setSelectedCourses(freshState.selectedCourses);
      setIngredients(freshState.ingredients);
      setSteps(freshState.steps);
      setTags(freshState.tags);
      setRecipeOpen(freshState.recipeOpen);
      setChangeNote('');
      return;
    }

    setTitle('');
    setCaption('');
    setPhotos((prev) => {
      prev.forEach((photo) => {
        if (photo.kind === 'new') {
          URL.revokeObjectURL(photo.preview);
        }
      });
      return [];
    });
    setRecipe(createRecipeState());
    setSelectedCourses([]);
    setIngredients([createIngredientRow()]);
    setSteps([createStepRow()]);
    setTags([]);
    setRecipeOpen(false);
    setChangeNote('');
  }

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    const nextPhotos: NewPhotoAttachment[] = Array.from(files).map((file) => ({
      id: generateLocalId(),
      kind: 'new',
      file,
      preview: URL.createObjectURL(file),
    }));

    if (photos.length + nextPhotos.length > MAX_PHOTOS) {
      nextPhotos.forEach((photo) => URL.revokeObjectURL(photo.preview));
      setFormError(`You can upload up to ${MAX_PHOTOS} photos.`);
      return;
    }

    setPhotos((prev) => [...prev, ...nextPhotos]);
    event.target.value = '';
  }

  function removePhoto(id: string) {
    setPhotos((prev) => {
      const photo = prev.find((item) => item.id === id);
      if (photo && photo.kind === 'new') {
        URL.revokeObjectURL(photo.preview);
      }
      return prev.filter((item) => item.id !== id);
    });
  }

  function movePhoto(id: string, direction: 'left' | 'right') {
    setPhotos((prev) => {
      const index = prev.findIndex((photo) => photo.id === id);
      if (index === -1) {
        return prev;
      }
      const targetIndex = direction === 'left' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) {
        return prev;
      }
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      return copy;
    });
  }

  function handleRecipeChange(field: keyof RecipeState, value: string): void {
    setRecipe((prev) => ({ ...prev, [field]: value }));
  }

  function toggleCourseSelection(courseValue: string) {
    setSelectedCourses((prev) => {
      if (prev.includes(courseValue)) {
        return prev.filter((value) => value !== courseValue);
      }

      if (prev.length >= MAX_COURSES) {
        return prev;
      }

      return [...prev, courseValue];
    });
  }

  function handleIngredientChange(
    id: string,
    field: keyof Omit<IngredientRow, 'id'>,
    value: string
  ) {
    setIngredients((prev) =>
      prev.map((ingredient) => {
        if (ingredient.id !== id) {
          return ingredient;
        }
        return {
          ...ingredient,
          [field]: field === 'unit' ? (value as RecipeIngredientUnit) : value,
        };
      })
    );
  }

  function addIngredientRow() {
    setIngredients((prev) => [...prev, createIngredientRow()]);
  }

  function removeIngredientRow(id: string) {
    setIngredients((prev) =>
      prev.length > 1 ? prev.filter((ingredient) => ingredient.id !== id) : prev
    );
  }

  function handleStepChange(id: string, text: string) {
    setSteps((prev) =>
      prev.map((step) => {
        if (step.id !== id) {
          return step;
        }
        return { ...step, text };
      })
    );
  }

  function addStepRow() {
    setSteps((prev) => [...prev, createStepRow()]);
  }

  function removeStepRow(id: string) {
    setSteps((prev) =>
      prev.length > 1 ? prev.filter((step) => step.id !== id) : prev
    );
  }

  function toggleTagSelection(tagName: string) {
    setTags((prev) => {
      if (prev.includes(tagName)) {
        return prev.filter((tag) => tag !== tagName);
      }

      if (prev.length >= MAX_TAGS) {
        setFormError(`You can add up to ${MAX_TAGS} tags`);
        return prev;
      }

      setFormError(null);
      return [...prev, tagName];
    });
  }

  function applyImportedRecipe(
    prefill: ReturnType<typeof mapImporterResponseToPrefill>
  ) {
    setRecipeOpen(true);
    if (prefill.title) {
      setTitle(prefill.title);
    }

    setRecipe({
      origin: prefill.origin || '',
      totalTimeHours: prefill.totalTimeHours,
      totalTimeMinutes: prefill.totalTimeMinutes,
      servings: prefill.servings,
      difficulty: '',
    });

    const mappedIngredients =
      prefill.ingredients.length > 0
        ? prefill.ingredients.map((ingredient) => ({
            ...ingredient,
            id: generateLocalId(),
          }))
        : [createIngredientRow()];

    const mappedSteps =
      prefill.steps.length > 0
        ? prefill.steps.map((step) => ({
            ...step,
            id: generateLocalId(),
          }))
        : [createStepRow()];

    setIngredients(mappedIngredients);
    setSteps(mappedSteps);

    if (prefill.lowConfidence) {
      setImportWarning(
        'Imported with low confidence — please review and edit.'
      );
    } else {
      setImportWarning(null);
    }
  }

  async function handleImportRecipe() {
    const normalizedUrl = importUrl.trim();
    if (!normalizedUrl) {
      setImportError('Enter a URL to import');
      return;
    }

    const hasExistingData = recipeHasAnyData || title.trim().length > 0;
    if (hasExistingData) {
      const proceed = window.confirm(
        'Import will overwrite existing recipe details. Continue?'
      );
      if (!proceed) {
        return;
      }
    }

    setIsImporting(true);
    setImportError(null);
    setImportWarning(null);

    try {
      const response = await fetch('/api/recipes/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ url: normalizedUrl }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const message = data?.error?.message || 'Unable to import recipe.';
        throw new Error(message);
      }

      const prefill = mapImporterResponseToPrefill(data);
      applyImportedRecipe(prefill);
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : 'Unable to import recipe.'
      );
    } finally {
      setIsImporting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setFormError('Title is required');
      return;
    }

    const sanitizedIngredients: Array<{
      name: string;
      unit: RecipeIngredientUnit;
      quantity?: number;
    }> = [];

    for (let index = 0; index < ingredients.length; index += 1) {
      const row = ingredients[index];
      const name = row.name.trim();
      const quantityValue = row.quantity.trim();

      if (!name) {
        continue;
      }

      let parsedQuantity: number | undefined;
      if (quantityValue) {
        parsedQuantity = Number(quantityValue);
        if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
          setFormError(
            `Ingredient ${index + 1} quantity must be a positive number`
          );
          return;
        }
      }

      sanitizedIngredients.push({
        name,
        unit: row.unit,
        quantity: parsedQuantity,
      });
    }

    const sanitizedSteps = steps
      .map((step) => step.text.trim())
      .filter((text) => text.length > 0);

    if (
      recipeHasAnyData &&
      (!sanitizedIngredients.length || !sanitizedSteps.length)
    ) {
      setFormError(
        'Add at least one ingredient and one step to include recipe details.'
      );
      return;
    }

    const hoursValue = Number(recipe.totalTimeHours || '0');
    const minutesValue = Number(recipe.totalTimeMinutes || '0');

    if (
      !Number.isFinite(hoursValue) ||
      hoursValue < 0 ||
      !Number.isInteger(hoursValue)
    ) {
      setFormError('Hours must be a whole number');
      return;
    }

    if (
      !Number.isFinite(minutesValue) ||
      minutesValue < 0 ||
      minutesValue >= 60 ||
      !Number.isInteger(minutesValue)
    ) {
      setFormError('Minutes must be between 0 and 55');
      return;
    }

    const totalTimeNumber = hoursValue * 60 + minutesValue;

    let servingsNumber: number | undefined;
    if (recipe.servings.trim()) {
      servingsNumber = Number(recipe.servings.trim());
      if (
        !Number.isFinite(servingsNumber) ||
        servingsNumber <= 0 ||
        !Number.isInteger(servingsNumber)
      ) {
        setFormError('Servings must be a positive whole number');
        return;
      }
    }

    const orderedNewPhotos: NewPhotoAttachment[] = [];
    photos.forEach((photo) => {
      if (photo.kind === 'new') {
        orderedNewPhotos.push(photo);
      }
    });

    const newPhotoIndexMap = new Map<string, number>();
    orderedNewPhotos.forEach((photo, index) => {
      newPhotoIndexMap.set(photo.id, index);
    });

    if (isEditMode) {
      for (const photo of photos) {
        if (photo.kind === 'new' && !newPhotoIndexMap.has(photo.id)) {
          setFormError('Unable to determine photo order. Please try again.');
          return;
        }
      }
    }

    const trimmedChangeNote = changeNote.trim();
    if (trimmedChangeNote.length > 280) {
      setFormError('Change note must be 280 characters or fewer');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload: Record<string, unknown> = {
        title: trimmedTitle,
      };

      if (caption.trim()) {
        payload.caption = caption.trim();
      }

      if (recipeHasAnyData) {
        payload.recipe = {
          origin: recipe.origin.trim() || undefined,
          ingredients: sanitizedIngredients.map((ingredient) => ({
            name: ingredient.name,
            unit: ingredient.unit,
            quantity:
              typeof ingredient.quantity === 'number'
                ? ingredient.quantity
                : undefined,
          })),
          steps: sanitizedSteps.map((text) => ({ text })),
          totalTime: totalTimeNumber > 0 ? totalTimeNumber : undefined,
          servings: servingsNumber,
          courses: selectedCourses.length ? selectedCourses : undefined,
          difficulty: recipe.difficulty || undefined,
          tags: tags,
        };
      }

      if (isEditMode) {
        payload.photoOrder = photos.map((photo) => {
          if (photo.kind === 'existing') {
            return { type: 'existing', id: photo.id };
          }
          const index = newPhotoIndexMap.get(photo.id);
          if (typeof index !== 'number') {
            throw new Error('PHOTO_ORDER_INVALID');
          }
          return { type: 'new', fileIndex: index };
        });

        if (trimmedChangeNote) {
          payload.changeNote = trimmedChangeNote;
        }
      }

      const formData = new FormData();
      formData.append('payload', JSON.stringify(payload));
      orderedNewPhotos.forEach((photo) => {
        formData.append('photos', photo.file);
      });

      const endpoint = isEditMode ? `/api/posts/${postId}` : '/api/posts';
      const response = await fetch(endpoint, {
        method: isEditMode ? 'PUT' : 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        const message =
          data?.error?.message ||
          (isEditMode ? 'Failed to update post' : 'Failed to create post');
        throw new Error(message);
      }

      if (isEditMode && postId) {
        setChangeNote('');
        router.push(`/posts/${postId}`);
        router.refresh();
        return;
      }

      setTitle('');
      setCaption('');
      setPhotos((prev) => {
        prev.forEach((photo) => {
          if (photo.kind === 'new') {
            URL.revokeObjectURL(photo.preview);
          }
        });
        return [];
      });
      setRecipe(createRecipeState());
      setSelectedCourses([]);
      setIngredients([createIngredientRow()]);
      setSteps([createStepRow()]);
      setTags([]);
      setRecipeOpen(false);
      router.push('/timeline');
      router.refresh();
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'PHOTO_ORDER_INVALID') {
          setFormError('Photo order is invalid. Please try again.');
        } else {
          setFormError(error.message);
        }
      } else {
        setFormError('Something went wrong. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-8" onSubmit={handleSubmit}>
      <section className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Basic Post</h2>
          <p className="text-sm text-gray-500">
            Share a quick update or turn it into a full recipe below.
          </p>
        </div>

        <div className="space-y-1">
          <label htmlFor="title" className="text-sm font-medium text-gray-700">
            Title
          </label>
          <input
            id="title"
            type="text"
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
            placeholder="What are you cooking?"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
        </div>

        <div className="space-y-1">
          <label
            htmlFor="caption"
            className="text-sm font-medium text-gray-700"
          >
            Caption (optional)
          </label>
          <textarea
            id="caption"
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
            placeholder="Add a quick note or context"
            rows={4}
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">Photos</label>
            {coverPhotoId && (
              <span className="text-xs text-gray-500">
                First photo is used as cover
              </span>
            )}
          </div>
          <label className="flex flex-col items-center justify-center w-full border-2 border-dashed border-gray-300 rounded-xl px-6 py-10 text-center cursor-pointer hover:border-gray-400">
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handlePhotoChange}
            />
            <span className="text-sm font-medium text-gray-700">
              Tap to add photos
            </span>
            <span className="text-xs text-gray-500 mt-1">
              JPEG, PNG, GIF, or WEBP
            </span>
          </label>
          {photos.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {photos.map((photo, index) => {
                const photoSrc =
                  photo.kind === 'existing' ? photo.url : photo.preview;
                const photoAlt =
                  photo.kind === 'existing'
                    ? title || 'Post photo'
                    : photo.file.name;
                return (
                  <div
                    key={photo.id}
                    className="relative rounded-xl overflow-hidden border border-gray-200"
                  >
                    <div className="relative h-28 w-full">
                      <Image
                        src={photoSrc}
                        alt={photoAlt}
                        fill
                        sizes="(max-width: 768px) 33vw, 200px"
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                    <div className="absolute top-2 left-2">
                      {index === 0 && (
                        <span className="bg-white text-xs font-semibold px-2 py-0.5 rounded-full text-gray-800">
                          Cover
                        </span>
                      )}
                    </div>
                    <div className="absolute top-2 right-2 flex gap-1">
                      <button
                        type="button"
                        onClick={() => movePhoto(photo.id, 'left')}
                        className="bg-white/90 rounded-full p-1 text-xs text-gray-700 disabled:opacity-30"
                        disabled={index === 0}
                        aria-label="Move photo left"
                      >
                        ◀
                      </button>
                      <button
                        type="button"
                        onClick={() => movePhoto(photo.id, 'right')}
                        className="bg-white/90 rounded-full p-1 text-xs text-gray-700 disabled:opacity-30"
                        disabled={index === photos.length - 1}
                        aria-label="Move photo right"
                      >
                        ▶
                      </button>
                      <button
                        type="button"
                        onClick={() => removePhoto(photo.id)}
                        className="bg-white/90 rounded-full p-1 text-xs text-red-600"
                        aria-label="Remove photo"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="bg-white rounded-2xl shadow-sm">
        <button
          type="button"
          className="w-full flex items-center justify-between px-6 py-4"
          onClick={() => setRecipeOpen((prev) => !prev)}
        >
          <div className="text-left">
            <p className="text-lg font-semibold text-gray-900">
              Recipe Details
            </p>
            <p className="text-sm text-gray-500">
              Ingredients, steps, tags, and more
            </p>
          </div>
          <span className="text-sm text-gray-500">
            {recipeOpen ? 'Hide' : 'Add'}
          </span>
        </button>
        {recipeOpen && (
          <div className="border-t border-gray-100 px-6 py-6 space-y-4">
            <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  type="url"
                  className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
                  placeholder="Paste a recipe URL to import"
                  value={importUrl}
                  onChange={(event) => setImportUrl(event.target.value)}
                />
                <button
                  type="button"
                  onClick={handleImportRecipe}
                  disabled={isImporting}
                  className="inline-flex items-center justify-center rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {isImporting ? 'Importing…' : 'Import from URL'}
                </button>
              </div>
              <p className="text-xs text-gray-500">
                Import will overwrite existing recipe details.
              </p>
              {importError && (
                <p className="text-sm text-red-600">{importError}</p>
              )}
              {importWarning && (
                <p className="text-sm text-amber-700">{importWarning}</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">
                  Origin
                </label>
                <input
                  type="text"
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
                  placeholder="Family story or origin"
                  value={recipe.origin}
                  onChange={(event) =>
                    handleRecipeChange('origin', event.target.value)
                  }
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">
                  Prep + cook time
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <select
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
                    value={recipe.totalTimeHours}
                    onChange={(event) =>
                      handleRecipeChange('totalTimeHours', event.target.value)
                    }
                  >
                    {HOUR_OPTIONS.map((hour) => (
                      <option key={hour} value={hour}>
                        {hour} hr{hour === 1 ? '' : 's'}
                      </option>
                    ))}
                  </select>
                  <select
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
                    value={recipe.totalTimeMinutes}
                    onChange={(event) =>
                      handleRecipeChange('totalTimeMinutes', event.target.value)
                    }
                  >
                    {MINUTE_OPTIONS.map((minute) => (
                      <option key={minute} value={minute}>
                        {minute} min
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">
                  Servings
                </label>
                <select
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
                  value={recipe.servings}
                  onChange={(event) =>
                    handleRecipeChange('servings', event.target.value)
                  }
                >
                  <option value="">Select servings</option>
                  {SERVING_OPTIONS.map((count) => (
                    <option key={count} value={count}>
                      {count} {count === 1 ? 'person' : 'people'}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">
                    Courses
                  </label>
                  <span className="text-xs text-gray-500">
                    {selectedCourses.length}/{MAX_COURSES}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {courseOptions.map((option) => {
                    const selected = selectedCourses.includes(option.value);
                    const disabled =
                      !selected && selectedCourses.length >= MAX_COURSES;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => toggleCourseSelection(option.value)}
                        disabled={disabled}
                        className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
                          selected
                            ? 'bg-gray-900 text-white border-gray-900'
                            : 'border-gray-200 text-gray-700 hover:border-gray-300'
                        } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">
                  Difficulty
                </label>
                <select
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
                  value={recipe.difficulty}
                  onChange={(event) =>
                    handleRecipeChange('difficulty', event.target.value)
                  }
                >
                  {difficultyOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">
                  Ingredients
                </label>
                <button
                  type="button"
                  className="text-sm font-semibold text-gray-900"
                  onClick={addIngredientRow}
                >
                  + Add ingredient
                </button>
              </div>
              <div className="space-y-3">
                {ingredients.map((ingredient, index) => (
                  <div
                    key={ingredient.id}
                    className="rounded-xl border border-gray-200 p-3 space-y-3"
                  >
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>Ingredient {index + 1}</span>
                      {ingredients.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeIngredientRow(ingredient.id)}
                          className="text-red-600 font-semibold"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <div className="sm:col-span-2">
                        <input
                          type="text"
                          className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
                          placeholder="Ingredient name"
                          value={ingredient.name}
                          onChange={(event) =>
                            handleIngredientChange(
                              ingredient.id,
                              'name',
                              event.target.value
                            )
                          }
                        />
                      </div>
                      <div>
                        <input
                          type="text"
                          inputMode="decimal"
                          className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
                          placeholder="Qty"
                          value={ingredient.quantity}
                          onChange={(event) =>
                            handleIngredientChange(
                              ingredient.id,
                              'quantity',
                              event.target.value
                            )
                          }
                        />
                      </div>
                      <div>
                        <select
                          className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
                          value={ingredient.unit}
                          onChange={(event) =>
                            handleIngredientChange(
                              ingredient.id,
                              'unit',
                              event.target.value
                            )
                          }
                        >
                          {ingredientUnitOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">
                  Steps
                </label>
                <button
                  type="button"
                  className="text-sm font-semibold text-gray-900"
                  onClick={addStepRow}
                >
                  + Add step
                </button>
              </div>
              <div className="space-y-3">
                {steps.map((step, index) => (
                  <div
                    key={step.id}
                    className="rounded-xl border border-gray-200 p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>Step {index + 1}</span>
                      {steps.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeStepRow(step.id)}
                          className="text-red-600 font-semibold"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <textarea
                      className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
                      placeholder="Describe this step"
                      rows={3}
                      value={step.text}
                      onChange={(event) =>
                        handleStepChange(step.id, event.target.value)
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">
                  Tags
                </label>
                <span className="text-xs text-gray-500">
                  {tags.length}/{MAX_TAGS} selected
                </span>
              </div>
              {tagsLoading ? (
                <p className="text-sm text-gray-500">Loading tags…</p>
              ) : tagsError ? (
                <p className="text-sm text-red-600">{tagsError}</p>
              ) : (
                <div className="space-y-4">
                  {Object.entries(availableTags).map(
                    ([groupName, groupTags]) => (
                      <div key={groupName} className="space-y-2">
                        <p className="text-xs font-semibold uppercase text-gray-500">
                          {groupName.replace(/-/g, ' ')}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {groupTags.map((tag) => {
                            const selected = tags.includes(tag.name);
                            const disabled =
                              !selected && tags.length >= MAX_TAGS;
                            return (
                              <button
                                key={tag.id}
                                type="button"
                                onClick={() => toggleTagSelection(tag.name)}
                                disabled={disabled}
                                className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
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
                    )
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {isEditMode && (
        <section className="bg-white rounded-2xl shadow-sm p-6 space-y-3">
          <div className="space-y-1">
            <label
              htmlFor="change-note"
              className="text-sm font-medium text-gray-700"
            >
              Change note (optional)
            </label>
            <textarea
              id="change-note"
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="Let the family know what changed"
              rows={3}
              maxLength={280}
              value={changeNote}
              onChange={(event) => setChangeNote(event.target.value)}
            />
            <p className="text-xs text-gray-500 text-right">
              {changeNote.length}/280
            </p>
          </div>
        </section>
      )}

      {formError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {formError}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 rounded-xl bg-gray-900 text-white py-3 font-semibold disabled:opacity-50"
        >
          {isSubmitting
            ? isEditMode
              ? 'Saving…'
              : 'Sharing…'
            : isEditMode
              ? 'Save changes'
              : 'Share with family'}
        </button>
        <button
          type="button"
          className="rounded-xl border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700"
          onClick={handleReset}
        >
          Reset
        </button>
      </div>
    </form>
  );
}
