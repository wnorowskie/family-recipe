import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { withAuth } from '@/lib/apiAuth';
import { prisma } from '@/lib/prisma';
import { getSignedUploadUrl, isFileLike, savePhotoFile } from '@/lib/uploads';
import { updateProfileSchema } from '@/lib/validation';
import { logError } from '@/lib/logger';
import {
  validationError,
  conflictError,
  internalError,
  invalidCredentialsError,
  notFoundError,
} from '@/lib/apiErrors';
import { verifyPassword } from '@/lib/auth';
import { clearSessionCookie } from '@/lib/session';

export const PATCH = withAuth(async (request, user) => {
  try {
    const formData = await request.formData();
    const rawPayload = {
      name: formData.get('name'),
      email: formData.get('email'),
      username: formData.get('username'),
    };
    const currentPassword = formData.get('currentPassword');

    const parsed = updateProfileSchema.safeParse(rawPayload);

    if (!parsed.success) {
      return validationError(
        parsed.error.errors[0]?.message ?? 'Invalid input'
      );
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        passwordHash: true,
      },
    });

    if (!currentUser) {
      return notFoundError('User not found');
    }

    const emailChanged = parsed.data.email !== currentUser.email;
    const usernameChanged = parsed.data.username !== currentUser.username;
    const requiresPassword = emailChanged || usernameChanged;

    if (requiresPassword) {
      if (!currentPassword || typeof currentPassword !== 'string') {
        return validationError(
          'Current password is required to change email or username'
        );
      }

      const matches = await verifyPassword(
        currentPassword,
        currentUser.passwordHash
      );

      if (!matches) {
        return invalidCredentialsError('Incorrect current password');
      }
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
      email: string;
      username: string;
      avatarStorageKey?: string | null;
    } = {
      name: parsed.data.name,
      email: parsed.data.email.trim(),
      username: parsed.data.username.trim(),
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
        email: true,
        username: true,
        avatarStorageKey: true,
      },
    });

    const avatarUrl = await getSignedUploadUrl(updatedUser.avatarStorageKey);

    const response = NextResponse.json(
      {
        user: {
          id: updatedUser.id,
          name: updatedUser.name,
          email: updatedUser.email,
          username: updatedUser.username,
          emailOrUsername: updatedUser.email,
          avatarUrl,
        },
      },
      { status: 200 }
    );

    if (requiresPassword) {
      clearSessionCookie(response);
    }

    return response;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return conflictError('That email or username is already in use');
      }
    }

    logError('profile.update.error', error);
    return internalError('Unable to update profile');
  }
});
