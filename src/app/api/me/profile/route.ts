import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { withAuth } from '@/lib/apiAuth';
import { prisma } from '@/lib/prisma';
import { getSignedUploadUrl, isFileLike, savePhotoFile } from '@/lib/uploads';
import { updateProfileSchema } from '@/lib/validation';
import { logError } from '@/lib/logger';
import { validationError, conflictError, internalError } from '@/lib/apiErrors';

export const PATCH = withAuth(async (request, user) => {
  try {
    const formData = await request.formData();
    const rawPayload = {
      name: formData.get('name'),
      emailOrUsername: formData.get('emailOrUsername'),
    };

    const parsed = updateProfileSchema.safeParse(rawPayload);

    if (!parsed.success) {
      return validationError(
        parsed.error.errors[0]?.message ?? 'Invalid input'
      );
    }

    let avatarUpdate: string | null | undefined;
    const removeAvatar = formData.get('removeAvatar') === 'true';
    const avatarFile = formData.get('avatar');

    if (isFileLike(avatarFile) && avatarFile.size > 0) {
      try {
        const saved = await savePhotoFile(avatarFile);
        avatarUpdate = saved.storageKey;
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

    const data: {
      name: string;
      emailOrUsername: string;
      avatarStorageKey?: string | null;
    } = {
      name: parsed.data.name,
      emailOrUsername: parsed.data.emailOrUsername,
    };

    if (typeof avatarUpdate !== 'undefined') {
      data.avatarStorageKey = avatarUpdate;
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data,
      select: {
        id: true,
        name: true,
        emailOrUsername: true,
        avatarStorageKey: true,
      },
    });

    const avatarUrl = await getSignedUploadUrl(updatedUser.avatarStorageKey);

    return NextResponse.json(
      {
        user: {
          id: updatedUser.id,
          name: updatedUser.name,
          emailOrUsername: updatedUser.emailOrUsername,
          avatarUrl,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return conflictError('That email or username is already in use');
    }

    logError('profile.update.error', error);
    return internalError('Unable to update profile');
  }
});
