import { z } from 'zod';

const importerResponseSchema = z.object({
  request_id: z.string(),
  recipe: z.object({
    title: z.string().nullable().optional(),
    ingredients: z.array(z.string()).default([]),
    steps: z.array(z.string()).default([]),
    servings: z.string().nullable().optional(),
    total_time_minutes: z.number().nullable().optional(),
    image_url: z.string().nullable().optional(),
    author: z.string().nullable().optional(),
    source: z
      .object({
        url: z.string().nullable().optional(),
        domain: z.string().nullable().optional(),
        strategy: z.string().nullable().optional(),
        retrieved_at: z.string().nullable().optional(),
      })
      .partial()
      .nullable()
      .optional(),
  }),
  confidence: z.number(),
  warnings: z.array(z.string()).default([]),
  missing_fields: z.array(z.string()).default([]),
});

export type ImporterResponse = z.infer<typeof importerResponseSchema>;

class ImporterRequestError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

function getImporterConfig() {
  const baseUrl = process.env.RECIPE_IMPORTER_URL;
  if (!baseUrl) {
    throw new Error('RECIPE_IMPORTER_URL is not configured');
  }

  const audience = process.env.RECIPE_IMPORTER_AUDIENCE || baseUrl;
  const serviceAccountEmail =
    process.env.RECIPE_IMPORTER_SERVICE_ACCOUNT_EMAIL || 'default';
  const staticToken = process.env.RECIPE_IMPORTER_STATIC_TOKEN;

  const endpoint = baseUrl.endsWith('/v1/parse')
    ? baseUrl
    : `${baseUrl.replace(/\/$/, '')}/v1/parse`;

  return { endpoint, audience, serviceAccountEmail, staticToken };
}

async function fetchIdentityToken(
  audience: string,
  serviceAccountEmail: string,
  staticToken?: string
): Promise<string> {
  if (staticToken) {
    return staticToken;
  }

  const metadataUrl = `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/${serviceAccountEmail}/identity?audience=${encodeURIComponent(audience)}`;

  const response = await fetch(metadataUrl, {
    headers: { 'Metadata-Flavor': 'Google' },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to obtain identity token: ${response.status} ${response.statusText}`
    );
  }

  return response.text();
}

export async function importRecipeFromUrl(
  url: string
): Promise<ImporterResponse> {
  const { endpoint, audience, serviceAccountEmail, staticToken } =
    getImporterConfig();
  const idToken = await fetchIdentityToken(
    audience,
    serviceAccountEmail,
    staticToken
  );

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ url }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      (payload as any)?.message ||
      (payload as any)?.error?.message ||
      `Importer request failed with status ${response.status}`;
    throw new ImporterRequestError(message, response.status, payload);
  }

  const parsed = importerResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ImporterRequestError(
      'Unexpected importer response shape',
      response.status,
      payload
    );
  }

  return parsed.data;
}

export { ImporterRequestError };
