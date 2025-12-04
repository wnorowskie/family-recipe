import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { withAuth } from '@/lib/apiAuth';
import { prisma } from '@/lib/prisma';
import { savePhotoFile } from '@/lib/uploads';
import { updateProfileSchema } from '@/lib/validation';
import { logError } from '@/lib/logger';

export const PATCH = withAuth(async (request, user) => {
  try {
    const formData = await request.formData();
    const rawPayload = {
      name: formData.get('name'),
      emailOrUsername: formData.get('emailOrUsername'),
    };

    const parsed = updateProfileSchema.safeParse(rawPayload);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_INPUT',
            message: parsed.error.errors[0]?.message ?? 'Invalid input',
          },
        },
        { status: 400 }
      );
    }

    let avatarUpdate: string | null | undefined;
    const removeAvatar = formData.get('removeAvatar') === 'true';
    const avatarFile = formData.get('avatar');

    if (avatarFile instanceof File && avatarFile.size > 0) {
      try {
        const saved = await savePhotoFile(avatarFile);
        avatarUpdate = saved.url;
      } catch (error) {
        const code = error instanceof Error ? error.message : 'UPLOAD_FAILED';
        return NextResponse.json(
          { error: { code, message: 'Unable to process avatar upload' } },
          { status: 400 }
        );
      }
    } else if (removeAvatar) {
      avatarUpdate = null;
    }

    const data: { name: string; emailOrUsername: string; avatarUrl?: string | null } = {
      name: parsed.data.name,
      emailOrUsername: parsed.data.emailOrUsername,
    };

    if (typeof avatarUpdate !== 'undefined') {
      data.avatarUrl = avatarUpdate;
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data,
      select: {
        id: true,
        name: true,
        emailOrUsername: true,
        avatarUrl: true,
      },
    });

    return NextResponse.json({ user: updatedUser }, { status: 200 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return NextResponse.json(
        {
          error: {
            code: 'CONFLICT',
            message: 'That email or username is already in use',
          },
        },
        { status: 409 }
      );
    }

    logError('profile.update.error', error);
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Unable to update profile',
        },
      },
      { status: 500 }
    );
  }
});
