import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getPostDetail } from '@/lib/posts';
import { deleteUploadedFiles, savePhotoFile } from '@/lib/uploads';
import { createPostSchema } from '@/lib/validation';
import { MAX_PHOTO_COUNT, normalizePostPayload } from '@/lib/postPayload';
import { logError } from '@/lib/logger';
import { withAuth } from '@/lib/apiAuth';
import { canEditPost, canDeletePost } from '@/lib/permissions';

const paramsSchema = z.object({
  postId: z.string().min(1, 'Post ID is required'),
});

const photoOrderEntrySchema = z.union([
  z.object({
    type: z.literal('existing'),
    id: z.string().min(1, 'Existing photo ID is required'),
  }),
  z.object({
    type: z.literal('new'),
    fileIndex: z
      .number({ invalid_type_error: 'fileIndex must be a number' })
      .int('fileIndex must be an integer')
      .min(0, 'fileIndex must be 0 or greater'),
  }),
]);

const photoOrderSchema = z
  .array(photoOrderEntrySchema)
  .max(MAX_PHOTO_COUNT)
  .optional();

type PhotoOrderEntry = z.infer<typeof photoOrderEntrySchema>;

type ResolvedPhotoEntry =
  | { type: 'existing'; id: string; storageKey: string }
  | { type: 'new'; fileIndex: number; storageKey: string };

function extractChangeNote(value: unknown): {
  changeNote?: string;
  error?: string;
} {
  if (value === undefined || value === null) {
    return {};
  }

  if (typeof value !== 'string') {
    return { error: 'Change note must be a string' };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return {};
  }

  if (trimmed.length > 280) {
    return { error: 'Change note must be 280 characters or fewer' };
  }

  return { changeNote: trimmed };
}

export const GET = withAuth(
  async (request, user, context?: { params: { postId: string } }) => {
    try {
      const { params } = context!;

      const parseResult = paramsSchema.safeParse(params);

      if (!parseResult.success) {
        return NextResponse.json(
          {
            error: {
              code: 'INVALID_PARAMS',
              message:
                parseResult.error.errors[0]?.message ?? 'Invalid post ID',
            },
          },
          { status: 400 }
        );
      }

      const { postId } = parseResult.data;

      const searchParams = request.nextUrl?.searchParams;
      const commentLimitParam = searchParams?.get('commentLimit') ?? null;
      const commentOffsetParam = searchParams?.get('commentOffset') ?? null;
      const rawCommentLimit =
        commentLimitParam !== null
          ? Number.parseInt(commentLimitParam, 10)
          : undefined;
      const rawCommentOffset =
        commentOffsetParam !== null
          ? Number.parseInt(commentOffsetParam, 10)
          : undefined;
      const cookedLimitParam = searchParams?.get('cookedLimit') ?? null;
      const cookedOffsetParam = searchParams?.get('cookedOffset') ?? null;
      const rawCookedLimit =
        cookedLimitParam !== null
          ? Number.parseInt(cookedLimitParam, 10)
          : undefined;
      const rawCookedOffset =
        cookedOffsetParam !== null
          ? Number.parseInt(cookedOffsetParam, 10)
          : undefined;

      const post = await getPostDetail(postId, user.familySpaceId, user.id, {
        commentLimit:
          typeof rawCommentLimit === 'number' &&
          Number.isFinite(rawCommentLimit)
            ? rawCommentLimit
            : undefined,
        commentOffset:
          typeof rawCommentOffset === 'number' &&
          Number.isFinite(rawCommentOffset)
            ? rawCommentOffset
            : undefined,
        cookedLimit:
          typeof rawCookedLimit === 'number' && Number.isFinite(rawCookedLimit)
            ? rawCookedLimit
            : undefined,
        cookedOffset:
          typeof rawCookedOffset === 'number' &&
          Number.isFinite(rawCookedOffset)
            ? rawCookedOffset
            : undefined,
      });

      if (!post) {
        return NextResponse.json(
          {
            error: {
              code: 'NOT_FOUND',
              message: 'Post not found',
            },
          },
          { status: 404 }
        );
      }

      const canEdit = canEditPost(user, { authorId: post.author.id });

      return NextResponse.json({
        post,
        canEdit,
      });
    } catch (error) {
      logError('posts.detail.error', error, {
        postId: context?.params?.postId,
      });
      return NextResponse.json(
        {
          error: {
            code: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred',
          },
        },
        { status: 500 }
      );
    }
  }
);

export const PUT = withAuth(
  async (request, user, context?: { params: { postId: string } }) => {
    const { params } = context!;
    const postId = params.postId;

    try {
      const existingPost = await prisma.post.findFirst({
        where: {
          id: postId,
          familySpaceId: user.familySpaceId,
        },
        include: {
          photos: {
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              storageKey: true,
            },
          },
          recipeDetails: true,
        },
      });

      if (!existingPost) {
        return NextResponse.json(
          {
            error: {
              code: 'NOT_FOUND',
              message: 'Post not found',
            },
          },
          { status: 404 }
        );
      }

      if (!canEditPost(user, existingPost)) {
        return NextResponse.json(
          {
            error: {
              code: 'FORBIDDEN',
              message: 'You do not have permission to edit this post',
            },
          },
          { status: 403 }
        );
      }

      const formData = await request.formData();
      const rawPayload = formData.get('payload');

      if (!rawPayload || typeof rawPayload !== 'string') {
        return NextResponse.json(
          {
            error: {
              code: 'INVALID_PAYLOAD',
              message: 'Missing payload',
            },
          },
          { status: 400 }
        );
      }

      let parsedPayload: unknown;
      try {
        parsedPayload = JSON.parse(rawPayload);
      } catch {
        return NextResponse.json(
          {
            error: {
              code: 'INVALID_JSON',
              message: 'Payload must be valid JSON',
            },
          },
          { status: 400 }
        );
      }

      const normalizedPayload = normalizePostPayload(parsedPayload);
      const validatedPayload = createPostSchema.safeParse(normalizedPayload);

      if (!validatedPayload.success) {
        return NextResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message:
                validatedPayload.error.errors[0]?.message || 'Invalid input',
            },
          },
          { status: 400 }
        );
      }

      const rawObject =
        parsedPayload && typeof parsedPayload === 'object'
          ? (parsedPayload as Record<string, unknown>)
          : {};

      const changeNoteResult = extractChangeNote(rawObject.changeNote);

      if (changeNoteResult.error) {
        return NextResponse.json(
          {
            error: {
              code: 'INVALID_CHANGE_NOTE',
              message: changeNoteResult.error,
            },
          },
          { status: 400 }
        );
      }

      const photoOrderResult = photoOrderSchema.safeParse(rawObject.photoOrder);

      if (!photoOrderResult.success) {
        return NextResponse.json(
          {
            error: {
              code: 'INVALID_PHOTO_ORDER',
              message:
                photoOrderResult.error.errors[0]?.message ??
                'Invalid photo order',
            },
          },
          { status: 400 }
        );
      }

      const isFormDataFile = (entry: unknown): entry is File => {
        if (typeof File !== 'undefined' && entry instanceof File)
          return entry.size > 0;
        if (!entry || typeof entry !== 'object') return false;
        const maybe = entry as any;
        return (
          typeof maybe.size === 'number' &&
          typeof maybe.arrayBuffer === 'function' &&
          maybe.size > 0
        );
      };

      const files = formData
        .getAll('photos')
        .filter((entry): entry is File => isFormDataFile(entry));

      if (files.length > MAX_PHOTO_COUNT) {
        return NextResponse.json(
          {
            error: {
              code: 'TOO_MANY_PHOTOS',
              message: `You can upload up to ${MAX_PHOTO_COUNT} photos`,
            },
          },
          { status: 400 }
        );
      }

      const requestedPhotoOrder = photoOrderResult.data;
      const effectivePhotoOrder: PhotoOrderEntry[] = requestedPhotoOrder ?? [
        ...existingPost.photos.map((photo: any) => ({
          type: 'existing' as const,
          id: photo.id,
        })),
        ...files.map((_, index) => ({
          type: 'new' as const,
          fileIndex: index,
        })),
      ];

      if (effectivePhotoOrder.length > MAX_PHOTO_COUNT) {
        return NextResponse.json(
          {
            error: {
              code: 'TOO_MANY_PHOTOS',
              message: `You can include up to ${MAX_PHOTO_COUNT} photos`,
            },
          },
          { status: 400 }
        );
      }

      const newEntryCount = effectivePhotoOrder.filter(
        (entry) => entry.type === 'new'
      ).length;
      if (newEntryCount !== files.length) {
        return NextResponse.json(
          {
            error: {
              code: 'PHOTO_ORDER_MISMATCH',
              message: 'Photo order does not match uploaded files',
            },
          },
          { status: 400 }
        );
      }

      const existingPhotoMap = new Map(
        existingPost.photos.map((photo: any) => [photo.id, photo])
      );
      const seenExisting = new Set<string>();
      const seenNewIndexes = new Set<number>();
      const orderedPhotoEntries: ResolvedPhotoEntry[] = [];

      for (const entry of effectivePhotoOrder) {
        if (entry.type === 'existing') {
          if (seenExisting.has(entry.id)) {
            return NextResponse.json(
              {
                error: {
                  code: 'DUPLICATE_PHOTO',
                  message: 'Duplicate existing photo in order list',
                },
              },
              { status: 400 }
            );
          }
          seenExisting.add(entry.id);
          const photo = existingPhotoMap.get(entry.id) as any;
          if (!photo) {
            return NextResponse.json(
              {
                error: {
                  code: 'INVALID_PHOTO_REFERENCE',
                  message: 'Photo reference does not exist on this post',
                },
              },
              { status: 400 }
            );
          }
          orderedPhotoEntries.push({
            type: 'existing',
            id: photo.id,
            storageKey: photo.storageKey,
          });
        } else {
          if (entry.fileIndex < 0 || entry.fileIndex >= files.length) {
            return NextResponse.json(
              {
                error: {
                  code: 'INVALID_PHOTO_REFERENCE',
                  message: 'Photo reference is out of range',
                },
              },
              { status: 400 }
            );
          }

          if (seenNewIndexes.has(entry.fileIndex)) {
            return NextResponse.json(
              {
                error: {
                  code: 'DUPLICATE_PHOTO',
                  message: 'Duplicate new photo in order list',
                },
              },
              { status: 400 }
            );
          }
          seenNewIndexes.add(entry.fileIndex);
          orderedPhotoEntries.push({
            type: 'new',
            fileIndex: entry.fileIndex,
            storageKey: '',
          });
        }
      }

      const savedPhotos = await Promise.all(
        files.map((file) => savePhotoFile(file))
      );

      orderedPhotoEntries.forEach((entry) => {
        if (entry.type === 'new') {
          const saved = savedPhotos[entry.fileIndex];
          if (!saved) {
            throw new Error('PHOTO_SAVE_MISMATCH');
          }
          entry.storageKey = saved.storageKey;
        }
      });

      const primaryPhotoStorageKey = orderedPhotoEntries[0]?.storageKey ?? null;
      const keepExistingIds = orderedPhotoEntries
        .filter(
          (entry): entry is Exclude<ResolvedPhotoEntry, { type: 'new' }> =>
            entry.type === 'existing'
        )
        .map((entry) => entry.id);

      const payload = validatedPayload.data;
      const recipeInput = payload.recipe;
      const tagNames = recipeInput?.tags ?? [];
      const normalizedRecipeCourses =
        recipeInput?.courses && recipeInput.courses.length > 0
          ? recipeInput.courses
          : recipeInput?.course
            ? [recipeInput.course]
            : [];

      let tags: { id: string }[] = [];

      if (tagNames.length) {
        tags = await prisma.tag.findMany({
          where: {
            name: {
              in: tagNames,
            },
          },
          select: {
            id: true,
            name: true,
          },
        });

        if (tags.length !== tagNames.length) {
          return NextResponse.json(
            {
              error: {
                code: 'INVALID_TAG',
                message: 'One or more tags are not available',
              },
            },
            { status: 400 }
          );
        }
      }

      const removedPhotoIds = existingPost.photos
        .filter((photo: any) => !keepExistingIds.includes(photo.id))
        .map((photo: any) => photo.id);

      await prisma.$transaction(async (tx) => {
        await tx.post.update({
          where: { id: postId },
          data: {
            title: payload.title,
            caption: payload.caption ?? null,
            hasRecipeDetails: Boolean(recipeInput),
            mainPhotoStorageKey: primaryPhotoStorageKey,
            lastEditedBy: user!.id,
            lastEditNote: changeNoteResult.changeNote ?? null,
            lastEditAt: new Date(),
          },
        });

        if (removedPhotoIds.length) {
          await tx.postPhoto.deleteMany({
            where: {
              postId,
              id: {
                in: removedPhotoIds,
              },
            },
          });
        }

        for (let index = 0; index < orderedPhotoEntries.length; index += 1) {
          const entry = orderedPhotoEntries[index];
          if (entry.type === 'existing') {
            await tx.postPhoto.update({
              where: { id: entry.id },
              data: {
                sortOrder: index,
              },
            });
          } else {
            await tx.postPhoto.create({
              data: {
                postId,
                storageKey: entry.storageKey,
                sortOrder: index,
              },
            });
          }
        }

        if (recipeInput) {
          const recipePayload = {
            origin: recipeInput.origin ?? null,
            ingredients: JSON.stringify(
              recipeInput.ingredients.map((ingredient) => ({
                name: ingredient.name,
                unit: ingredient.unit,
                quantity:
                  typeof ingredient.quantity === 'number'
                    ? ingredient.quantity
                    : null,
              }))
            ),
            steps: JSON.stringify(
              recipeInput.steps.map((step) => ({
                text: step.text,
              }))
            ),
            totalTime: recipeInput.totalTime ?? null,
            servings: recipeInput.servings ?? null,
            course: normalizedRecipeCourses[0] ?? null,
            courses: normalizedRecipeCourses.length
              ? JSON.stringify(normalizedRecipeCourses)
              : null,
            difficulty: recipeInput.difficulty ?? null,
          };

          if (existingPost.recipeDetails) {
            await tx.recipeDetails.update({
              where: { postId },
              data: recipePayload,
            });
          } else {
            await tx.recipeDetails.create({
              data: {
                postId,
                ...recipePayload,
              },
            });
          }
        } else if (existingPost.recipeDetails) {
          await tx.recipeDetails.delete({
            where: { postId },
          });
        }

        await tx.postTag.deleteMany({
          where: { postId },
        });

        if (tags.length) {
          await tx.postTag.createMany({
            data: tags.map((tag) => ({
              postId,
              tagId: tag.id,
            })),
          });
        }
      });

      revalidatePath('/timeline');
      revalidatePath('/recipes');
      revalidatePath(`/posts/${postId}`);

      const updatedPost = await getPostDetail(
        postId,
        user!.familySpaceId,
        user!.id
      );

      return NextResponse.json({
        post: updatedPost,
      });
    } catch (error) {
      logError('posts.update.error', error, { postId });
      if (error instanceof Error) {
        if (error.message === 'UNSUPPORTED_FILE_TYPE') {
          return NextResponse.json(
            {
              error: {
                code: 'UNSUPPORTED_FILE_TYPE',
                message: 'Only JPEG, PNG, WEBP, or GIF images are allowed',
              },
            },
            { status: 400 }
          );
        }

        if (error.message === 'FILE_TOO_LARGE') {
          return NextResponse.json(
            {
              error: {
                code: 'FILE_TOO_LARGE',
                message: 'Each photo must be 8MB or smaller',
              },
            },
            { status: 400 }
          );
        }

        if (error.message === 'PHOTO_SAVE_MISMATCH') {
          return NextResponse.json(
            {
              error: {
                code: 'PHOTO_ORDER_MISMATCH',
                message:
                  'Unable to match uploaded photos to the requested order',
              },
            },
            { status: 400 }
          );
        }
      }

      return NextResponse.json(
        {
          error: {
            code: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred',
          },
        },
        { status: 500 }
      );
    }
  }
);

export const DELETE = withAuth(
  async (request, user, context?: { params: { postId: string } }) => {
    try {
      const { params } = context!;

      const parseResult = paramsSchema.safeParse(params);

      if (!parseResult.success) {
        return NextResponse.json(
          {
            error: {
              code: 'INVALID_PARAMS',
              message:
                parseResult.error.errors[0]?.message ?? 'Invalid post ID',
            },
          },
          { status: 400 }
        );
      }

      const { postId } = parseResult.data;

      const existingPost = await prisma.post.findFirst({
        where: {
          id: postId,
          familySpaceId: user.familySpaceId,
        },
        select: {
          id: true,
          authorId: true,
          photos: {
            select: {
              storageKey: true,
            },
          },
          comments: {
            select: {
              photoStorageKey: true,
            },
          },
        },
      });

      if (!existingPost) {
        return NextResponse.json(
          {
            error: {
              code: 'NOT_FOUND',
              message: 'Post not found',
            },
          },
          { status: 404 }
        );
      }

      if (!canDeletePost(user, existingPost)) {
        return NextResponse.json(
          {
            error: {
              code: 'FORBIDDEN',
              message: 'You do not have permission to delete this post',
            },
          },
          { status: 403 }
        );
      }

      await prisma.post.delete({
        where: { id: postId },
      });

      const photoStorageKeys = existingPost.photos.map(
        (photo: any) => photo.storageKey
      );
      const commentPhotoStorageKeys = existingPost.comments
        .map((comment: any) => comment.photoStorageKey)
        .filter((key: string | null | undefined): key is string =>
          Boolean(key)
        );

      await deleteUploadedFiles([
        ...photoStorageKeys,
        ...commentPhotoStorageKeys,
      ]);

      revalidatePath('/timeline');
      revalidatePath('/recipes');
      revalidatePath('/profile');

      return NextResponse.json({ status: 'deleted' }, { status: 200 });
    } catch (error) {
      logError('posts.delete.error', error, {
        postId: context?.params?.postId,
      });
      return NextResponse.json(
        {
          error: {
            code: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred',
          },
        },
        { status: 500 }
      );
    }
  }
);
