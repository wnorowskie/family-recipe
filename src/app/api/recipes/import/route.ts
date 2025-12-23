import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { withAuth } from '@/lib/apiAuth';
import {
  parseRequestBody,
  validationError,
  internalError,
} from '@/lib/apiErrors';
import {
  importRecipeFromUrl,
  ImporterRequestError,
} from '@/lib/recipeImporter';
import { logError } from '@/lib/logger';

const importRequestSchema = z.object({
  url: z.string().url(),
});

export const POST = withAuth(async (request: NextRequest) => {
  const body = await request.json().catch(() => null);
  const parsed = parseRequestBody(body, importRequestSchema);

  if (!parsed.success) {
    return parsed.error;
  }

  try {
    const result = await importRecipeFromUrl(parsed.data.url);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof ImporterRequestError) {
      return NextResponse.json(
        {
          error: {
            code: 'IMPORT_FAILED',
            message: error.message,
            payload: error.payload,
          },
        },
        { status: error.status }
      );
    }
    logError('recipes.import.error', error);
    return internalError();
  }
});
