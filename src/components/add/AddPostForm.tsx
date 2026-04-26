'use client';

import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { DndContext, DragEndEvent, closestCenter } from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

import {
  Button,
  Card,
  Chip,
  Input,
  PillButton,
  Textarea,
} from '@/components/ui';
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

const fieldLabelClass =
  'block text-sm text-[var(--fg-body)] mb-1.5 font-normal';
const fieldLabelInlineClass = 'block text-sm text-[var(--fg-body)] font-normal';
const sectionHeadingClass = 'text-lg font-medium text-[var(--fg-strong)]';
const sectionSubtitleClass = 'text-sm text-[var(--fg-meta)]';
const selectClass =
  'w-full rounded-input border border-[var(--border-input)] bg-[var(--bg-surface)] px-4 py-3 text-base text-[var(--fg-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-active)] focus-visible:ring-offset-1';

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

interface SortableIngredientRowProps {
  ingredient: IngredientRow;
  index: number;
  canRemove: boolean;
  onRemove: (id: string) => void;
  onChange: (
    id: string,
    field: keyof Omit<IngredientRow, 'id'>,
    value: string
  ) => void;
}

function SortableIngredientRow({
  ingredient,
  index,
  canRemove,
  onRemove,
  onChange,
}: SortableIngredientRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: ingredient.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div className="rounded-card border border-[var(--border-card)] bg-[var(--bg-surface)] p-3 space-y-3">
        <div className="flex items-center justify-between text-xs text-[var(--fg-caption)]">
          <span>Ingredient {index + 1}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-full border border-[var(--border-input)] p-1.5 text-[var(--fg-meta)] hover:text-[var(--fg-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-active)]"
              aria-label="Reorder ingredient"
              title="Drag to reorder"
              {...attributes}
              {...listeners}
            >
              <GripVertical size={14} aria-hidden="true" />
            </button>
            {canRemove && (
              <button
                type="button"
                onClick={() => onRemove(ingredient.id)}
                className="inline-flex items-center justify-center rounded-full border border-[var(--border-input)] p-1.5 text-[var(--fg-destructive)] hover:border-[var(--border-error)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-active)]"
                aria-label="Remove ingredient"
                title="Remove ingredient"
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="sm:col-span-2">
            <Input
              type="text"
              placeholder="Ingredient name"
              value={ingredient.name}
              data-ingredient-focus={ingredient.id}
              onChange={(event) =>
                onChange(ingredient.id, 'name', event.target.value)
              }
            />
          </div>
          <div>
            <Input
              type="text"
              inputMode="decimal"
              placeholder="Qty"
              value={ingredient.quantity}
              onChange={(event) =>
                onChange(ingredient.id, 'quantity', event.target.value)
              }
            />
          </div>
          <div>
            <select
              className={selectClass}
              value={ingredient.unit}
              onChange={(event) =>
                onChange(ingredient.id, 'unit', event.target.value)
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
    </div>
  );
}

interface SortableStepRowProps {
  step: StepRow;
  index: number;
  canRemove: boolean;
  onRemove: (id: string) => void;
  onChange: (id: string, text: string) => void;
}

function SortableStepRow({
  step,
  index,
  canRemove,
  onRemove,
  onChange,
}: SortableStepRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div className="rounded-card border border-[var(--border-card)] bg-[var(--bg-surface)] p-3 space-y-2">
        <div className="flex items-center justify-between text-xs text-[var(--fg-caption)]">
          <span>Step {index + 1}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-full border border-[var(--border-input)] p-1.5 text-[var(--fg-meta)] hover:text-[var(--fg-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-active)]"
              aria-label="Reorder step"
              title="Drag to reorder"
              {...attributes}
              {...listeners}
            >
              <GripVertical size={14} aria-hidden="true" />
            </button>
            {canRemove && (
              <button
                type="button"
                onClick={() => onRemove(step.id)}
                className="inline-flex items-center justify-center rounded-full border border-[var(--border-input)] p-1.5 text-[var(--fg-destructive)] hover:border-[var(--border-error)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-active)]"
                aria-label="Remove step"
                title="Remove step"
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        <Textarea
          placeholder="Describe this step"
          rows={3}
          value={step.text}
          data-step-focus={step.id}
          onChange={(event) => onChange(step.id, event.target.value)}
        />
      </div>
    </div>
  );
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
  // Refs (not state) so writing them after DOM focus doesn't trigger a re-render
  // — the effects below fire on ingredients/steps changes and read the ref synchronously.
  const pendingIngredientFocusIdRef = useRef<string | null>(null);
  const pendingStepFocusIdRef = useRef<string | null>(null);

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

  useEffect(() => {
    const id = pendingIngredientFocusIdRef.current;
    if (!id) {
      return;
    }

    const input = document.querySelector<HTMLInputElement>(
      `[data-ingredient-focus="${id}"]`
    );

    if (input) {
      input.focus();
    }

    pendingIngredientFocusIdRef.current = null;
  }, [ingredients]);

  useEffect(() => {
    const id = pendingStepFocusIdRef.current;
    if (!id) {
      return;
    }

    const textarea = document.querySelector<HTMLTextAreaElement>(
      `[data-step-focus="${id}"]`
    );

    if (textarea) {
      textarea.focus();
    }

    pendingStepFocusIdRef.current = null;
  }, [steps]);

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

  const recipeHasCoreDetails = useMemo(() => {
    const hasIngredientContent = ingredients.some(
      (ingredient) => ingredient.name.trim() || ingredient.quantity.trim()
    );
    const hasStepContent = steps.some((step) => step.text.trim().length > 0);
    const hasDuration =
      Number(recipe.totalTimeHours) > 0 || Number(recipe.totalTimeMinutes) > 0;

    return (
      recipe.origin.trim().length > 0 ||
      hasDuration ||
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
    const newRow = createIngredientRow();
    // Set the ref *before* setState so the focus effect (deps: [ingredients])
    // reads a populated ref on the next commit. Don't reorder.
    pendingIngredientFocusIdRef.current = newRow.id;
    setIngredients((prev) => [...prev, newRow]);
  }

  function handleIngredientDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    setIngredients((prev) => {
      const oldIndex = prev.findIndex((row) => row.id === active.id);
      const newIndex = prev.findIndex((row) => row.id === over.id);
      if (oldIndex === -1 || newIndex === -1) {
        return prev;
      }
      return arrayMove(prev, oldIndex, newIndex);
    });
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
    const newRow = createStepRow();
    // Set the ref *before* setState so the focus effect (deps: [steps])
    // reads a populated ref on the next commit. Don't reorder.
    pendingStepFocusIdRef.current = newRow.id;
    setSteps((prev) => [...prev, newRow]);
  }

  function handleStepDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    setSteps((prev) => {
      const oldIndex = prev.findIndex((row) => row.id === active.id);
      const newIndex = prev.findIndex((row) => row.id === over.id);
      if (oldIndex === -1 || newIndex === -1) {
        return prev;
      }
      return arrayMove(prev, oldIndex, newIndex);
    });
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
    const preservedCaption = caption;
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

    // Keep whatever caption the user already entered
    setCaption(preservedCaption);

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
      recipeHasCoreDetails &&
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
    <form className="space-y-6" onSubmit={handleSubmit}>
      <Card className="space-y-4 p-6">
        <div>
          <h2 className={sectionHeadingClass}>Basic Post</h2>
          <p className={sectionSubtitleClass}>
            Share a quick update or turn it into a full recipe below.
          </p>
        </div>

        <div className="space-y-1">
          <label htmlFor="title" className={fieldLabelClass}>
            Title <span className="text-[var(--color-red-500)]">*</span>
          </label>
          <Input
            id="title"
            type="text"
            placeholder="What are you cooking?"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="caption" className={fieldLabelClass}>
            Caption (optional)
          </label>
          <Textarea
            id="caption"
            placeholder="Share the story behind this dish…"
            rows={4}
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className={fieldLabelInlineClass}>Photos</span>
            {coverPhotoId && (
              <span className="text-xs text-[var(--fg-caption)]">
                First photo is used as cover
              </span>
            )}
          </div>
          <label className="flex flex-col items-center justify-center w-full border-2 border-dashed border-[var(--border-input)] rounded-input px-6 py-8 text-center cursor-pointer bg-[var(--bg-page)] hover:border-[var(--border-active)] transition-colors gap-2">
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handlePhotoChange}
            />
            <Camera
              size={28}
              aria-hidden="true"
              className="text-[var(--fg-caption)]"
            />
            <span className="text-sm text-[var(--fg-meta)]">
              Tap to add photos
            </span>
            <span className="text-xs text-[var(--fg-caption)]">
              Up to {MAX_PHOTOS} — JPEG, PNG, GIF, or WEBP
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
                    className="relative rounded-input overflow-hidden border border-[var(--border-card)]"
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
                        <Chip variant="surface" size="sm">
                          Cover
                        </Chip>
                      )}
                    </div>
                    <div className="absolute top-2 right-2 flex gap-1">
                      <button
                        type="button"
                        onClick={() => movePhoto(photo.id, 'left')}
                        className="inline-flex items-center justify-center bg-[var(--bg-surface)]/90 rounded-full p-1 text-[var(--fg-meta)] hover:text-[var(--fg-strong)] disabled:opacity-30 disabled:cursor-not-allowed"
                        disabled={index === 0}
                        aria-label="Move photo left"
                      >
                        <ChevronLeft size={14} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => movePhoto(photo.id, 'right')}
                        className="inline-flex items-center justify-center bg-[var(--bg-surface)]/90 rounded-full p-1 text-[var(--fg-meta)] hover:text-[var(--fg-strong)] disabled:opacity-30 disabled:cursor-not-allowed"
                        disabled={index === photos.length - 1}
                        aria-label="Move photo right"
                      >
                        <ChevronRight size={14} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removePhoto(photo.id)}
                        className="inline-flex items-center justify-center bg-[var(--bg-surface)]/90 rounded-full p-1 text-[var(--fg-destructive)]"
                        aria-label="Remove photo"
                      >
                        <X size={14} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      <section className="overflow-hidden rounded-card border border-[var(--border-card)] bg-[var(--bg-surface)]">
        <button
          type="button"
          className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-[var(--bg-page)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-active)]"
          onClick={() => setRecipeOpen((prev) => !prev)}
          aria-expanded={recipeOpen}
        >
          <div>
            <p className="text-base font-medium text-[var(--fg-strong)]">
              Add Recipe Details (Optional)
            </p>
            <p className={sectionSubtitleClass}>
              Ingredients, steps, tags, and more
            </p>
          </div>
          <ChevronDown
            size={18}
            aria-hidden="true"
            className="text-[var(--fg-meta)] transition-transform duration-150"
            style={{ transform: recipeOpen ? 'rotate(180deg)' : 'rotate(0)' }}
          />
        </button>
        {recipeOpen && (
          <div className="border-t border-[var(--border-card)] px-6 py-6 space-y-4">
            <div className="space-y-2 rounded-card border border-[var(--border-card)] bg-[var(--bg-page)] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Input
                  type="url"
                  className="flex-1"
                  placeholder="Paste a recipe URL to import"
                  value={importUrl}
                  onChange={(event) => setImportUrl(event.target.value)}
                />
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleImportRecipe}
                  disabled={isImporting}
                >
                  {isImporting ? 'Importing…' : 'Import from URL'}
                </Button>
              </div>
              <p className="text-xs text-[var(--fg-caption)]">
                Import will overwrite existing recipe details.
              </p>
              {importError && (
                <p className="text-sm text-[var(--fg-destructive)]">
                  {importError}
                </p>
              )}
              {importWarning && (
                <p className="text-sm text-[var(--fg-meta)]">{importWarning}</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label htmlFor="origin" className={fieldLabelClass}>
                  Origin
                </label>
                <Input
                  id="origin"
                  type="text"
                  placeholder="e.g. Grandma's recipe, NYT Cooking…"
                  value={recipe.origin}
                  onChange={(event) =>
                    handleRecipeChange('origin', event.target.value)
                  }
                />
              </div>
              <div className="space-y-1">
                <span className={fieldLabelClass}>Prep + cook time</span>
                <div className="grid grid-cols-2 gap-3">
                  <select
                    aria-label="Hours"
                    className={selectClass}
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
                    aria-label="Minutes"
                    className={selectClass}
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
                <label htmlFor="servings" className={fieldLabelClass}>
                  Servings
                </label>
                <select
                  id="servings"
                  className={selectClass}
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
                  <span className={fieldLabelInlineClass}>Courses</span>
                  <span className="text-xs text-[var(--fg-caption)]">
                    {selectedCourses.length}/{MAX_COURSES}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {courseOptions.map((option) => {
                    const selected = selectedCourses.includes(option.value);
                    const disabled =
                      !selected && selectedCourses.length >= MAX_COURSES;
                    return (
                      <PillButton
                        key={option.value}
                        pressed={selected}
                        disabled={disabled}
                        onClick={() => toggleCourseSelection(option.value)}
                      >
                        {option.label}
                      </PillButton>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <span className={fieldLabelInlineClass}>Difficulty</span>
                <div className="flex flex-wrap gap-2">
                  {difficultyOptions.map((option) => {
                    const selected = recipe.difficulty === option.value;
                    return (
                      <PillButton
                        key={option.value}
                        pressed={selected}
                        onClick={() =>
                          handleRecipeChange(
                            'difficulty',
                            selected ? '' : option.value
                          )
                        }
                      >
                        {option.label}
                      </PillButton>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <span className={fieldLabelInlineClass}>Ingredients</span>
              <DndContext
                collisionDetection={closestCenter}
                onDragEnd={handleIngredientDragEnd}
              >
                <SortableContext
                  items={ingredients.map((ingredient) => ingredient.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-3">
                    {ingredients.map((ingredient, index) => (
                      <SortableIngredientRow
                        key={ingredient.id}
                        ingredient={ingredient}
                        index={index}
                        canRemove={ingredients.length > 1}
                        onRemove={removeIngredientRow}
                        onChange={handleIngredientChange}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
              <div className="flex items-center justify-center">
                <button
                  type="button"
                  onClick={addIngredientRow}
                  className="inline-flex items-center justify-center h-9 w-9 rounded-full border border-[var(--border-input)] text-[var(--fg-meta)] hover:text-[var(--fg-strong)] hover:border-[var(--border-active)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-active)]"
                  aria-label="Add ingredient"
                  title="Add ingredient"
                >
                  <Plus size={16} aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <span className={fieldLabelInlineClass}>Steps</span>
              <DndContext
                collisionDetection={closestCenter}
                onDragEnd={handleStepDragEnd}
              >
                <SortableContext
                  items={steps.map((step) => step.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-3">
                    {steps.map((step, index) => (
                      <SortableStepRow
                        key={step.id}
                        step={step}
                        index={index}
                        canRemove={steps.length > 1}
                        onRemove={removeStepRow}
                        onChange={handleStepChange}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
              <div className="flex items-center justify-center">
                <button
                  type="button"
                  onClick={addStepRow}
                  className="inline-flex items-center justify-center h-9 w-9 rounded-full border border-[var(--border-input)] text-[var(--fg-meta)] hover:text-[var(--fg-strong)] hover:border-[var(--border-active)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-active)]"
                  aria-label="Add step"
                  title="Add step"
                >
                  <Plus size={16} aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className={fieldLabelInlineClass}>Tags</span>
                <span className="text-xs text-[var(--fg-caption)]">
                  {tags.length}/{MAX_TAGS} selected
                </span>
              </div>
              {tagsLoading ? (
                <p className="text-sm text-[var(--fg-meta)]">Loading tags…</p>
              ) : tagsError ? (
                <p className="text-sm text-[var(--fg-destructive)]">
                  {tagsError}
                </p>
              ) : (
                <div className="space-y-4">
                  {Object.entries(availableTags).map(
                    ([groupName, groupTags]) => (
                      <div key={groupName} className="space-y-2">
                        <p className="text-xs font-medium uppercase text-[var(--fg-caption)] tracking-wide">
                          {groupName.replace(/-/g, ' ')}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {groupTags.map((tag) => {
                            const selected = tags.includes(tag.name);
                            const disabled =
                              !selected && tags.length >= MAX_TAGS;
                            return (
                              <PillButton
                                key={tag.id}
                                pressed={selected}
                                disabled={disabled}
                                onClick={() => toggleTagSelection(tag.name)}
                              >
                                #{tag.name}
                              </PillButton>
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
        <Card className="space-y-3 p-6">
          <div className="space-y-1">
            <label htmlFor="change-note" className={fieldLabelClass}>
              Change note (optional)
            </label>
            <Textarea
              id="change-note"
              placeholder="Let the family know what changed"
              rows={3}
              maxLength={280}
              value={changeNote}
              onChange={(event) => setChangeNote(event.target.value)}
            />
            <p className="text-xs text-[var(--fg-caption)] text-right">
              {changeNote.length}/280
            </p>
          </div>
        </Card>
      )}

      {formError && (
        <div className="rounded-input border border-[var(--border-error)] bg-red-50 px-4 py-3 text-sm text-[var(--fg-destructive)]">
          {formError}
        </div>
      )}

      <div className="flex gap-3">
        <Button
          type="submit"
          variant="primary"
          full
          disabled={isSubmitting}
          className="flex-1"
        >
          {isSubmitting
            ? isEditMode
              ? 'Saving…'
              : 'Sharing…'
            : isEditMode
              ? 'Save changes'
              : 'Share with family'}
        </Button>
        <Button type="button" variant="secondary" onClick={handleReset}>
          Reset
        </Button>
      </div>
    </form>
  );
}
