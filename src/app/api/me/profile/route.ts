import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { withAuth } from '@/lib/apiAuth';
import { prisma } from '@/lib/prisma';
import { isFileLike, savePhotoFile } from '@/lib/uploads';
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
      return validationError(parsed.error.errors[0]?.message ?? 'Invalid input');
    }

    let avatarUpdate: string | null | undefined;
    const removeAvatar = formData.get('removeAvatar') === 'true';
    const avatarFile = formData.get('avatar');

    if (isFileLike(avatarFile) && avatarFile.size > 0) {
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
      return conflictError('That email or username is already in use');
    }

    logError('profile.update.error', error);
    return internalError('Unable to update profile');
  }
});
