import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { createPostSchema } from '@/lib/validation';
import { savePhotoFile } from '@/lib/uploads';
import { MAX_PHOTO_COUNT, normalizePostPayload } from '@/lib/postPayload';
import { logError } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Not authenticated',
          },
        },
        { status: 401 }
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
            message: validatedPayload.error.errors[0]?.message || 'Invalid input',
          },
        },
        { status: 400 }
      );
    }

    const files = formData
      .getAll('photos')
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);

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

    const savedPhotos = await Promise.all(files.map((file) => savePhotoFile(file)));

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

    const createdPost = await prisma.post.create({
      data: {
        familySpaceId: user.familySpaceId,
        authorId: user.id,
        title: payload.title,
        caption: payload.caption ?? null,
        hasRecipeDetails: Boolean(recipeInput),
        mainPhotoUrl: savedPhotos[0]?.url,
        photos: savedPhotos.length
          ? {
              create: savedPhotos.map((photo, index) => ({
                url: photo.url,
                sortOrder: index,
              })),
            }
          : undefined,
        recipeDetails: recipeInput
          ? {
              create: {
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
                ...(typeof recipeInput.totalTime === 'number'
                  ? { totalTime: recipeInput.totalTime }
                  : {}),
                ...(typeof recipeInput.servings === 'number'
                  ? { servings: recipeInput.servings }
                  : {}),
                course: normalizedRecipeCourses[0] ?? null,
                courses: normalizedRecipeCourses.length
                  ? JSON.stringify(normalizedRecipeCourses)
                  : null,
                difficulty: recipeInput.difficulty ?? null,
              },
            } as any
          : undefined,
        tags: tags.length
          ? {
              create: tags.map((tag) => ({
                tag: {
                  connect: {
                    id: tag.id,
                  },
                },
              })),
            }
          : undefined,
      },
      include: {
        photos: {
          orderBy: { sortOrder: 'asc' },
        },
        recipeDetails: true,
        tags: {
          include: {
            tag: true,
          },
        },
      },
    });

    revalidatePath('/timeline');

    return NextResponse.json({ post: createdPost }, { status: 201 });
  } catch (error) {
    logError('posts.create.error', error);
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
