/**
 * Frontend contract test against the FastAPI OpenAPI snapshot.
 *
 * For each `/v1/*` endpoint the Next frontend actually calls today, this
 * file declares an example request payload and validates it against the
 * snapshot at `apps/api/openapi.snapshot.json` via AJV. If the snapshot's
 * schema for an endpoint drifts away from what the frontend constructs,
 * the test fails and points at the regen command.
 *
 * Adding a new /v1/* call from the frontend? Add an entry to FRONTEND_CALLS
 * below. The manifest is the single place to look when auditing what the
 * frontend depends on from the FastAPI contract.
 */

import fs from 'node:fs';
import path from 'node:path';

import Ajv2020, { type AnySchemaObject, type ErrorObject } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

const SNAPSHOT_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'apps',
  'api',
  'openapi.snapshot.json'
);

const REGEN_HINT =
  'Regenerate with: cd apps/api && python scripts/dump_openapi.py > openapi.snapshot.json';

type HttpMethod = 'get' | 'post' | 'patch' | 'put' | 'delete';

interface FrontendCall {
  method: HttpMethod;
  path: string;
  // Concrete-path stand-ins for `{post_id}` etc. used to find the operation.
  // The snapshot uses templated paths; we look them up directly.
  body?: unknown;
  query?: Record<string, unknown>;
  // Where this call lives in src/. Failure messages cite this so the diff is
  // actionable.
  callSite: string;
}

/**
 * Curated manifest of every /v1/* request the Next frontend constructs today.
 *
 * Phase 4 of the FastAPI migration will flip more endpoints over to /v1/*.
 * When a new fetch/apiClient call lands in src/ pointing at /v1/*, add it
 * here with a representative body/query. The test will then guard it.
 */
const FRONTEND_CALLS: readonly FrontendCall[] = [
  {
    method: 'post',
    path: '/v1/auth/login',
    body: {
      emailOrUsername: 'alice@example.com',
      password: 'hunter2hunter2',
      rememberMe: true,
    },
    callSite: 'src/app/(auth)/login/page.tsx',
  },
  {
    method: 'post',
    path: '/v1/auth/signup',
    body: {
      name: 'Alice Example',
      email: 'alice@example.com',
      username: 'alice_e',
      password: 'hunter2hunter2',
      familyMasterKey: 'family-master-key',
      rememberMe: false,
    },
    callSite: 'src/app/(auth)/signup/page.tsx',
  },
  {
    method: 'post',
    path: '/v1/auth/logout',
    callSite: 'src/components/LogoutButton.tsx',
  },
  {
    method: 'post',
    path: '/v1/auth/refresh',
    callSite: 'src/lib/auth/bootstrapFromCookies.ts',
  },
  {
    method: 'get',
    path: '/v1/auth/session',
    callSite: 'src/lib/auth/bootstrapFromCookies.ts',
  },
  {
    method: 'get',
    path: '/v1/auth/me',
    callSite: 'src/lib/auth/bootstrapFromCookies.ts',
  },
  {
    method: 'get',
    path: '/v1/notifications',
    query: { limit: 20, offset: 0 },
    callSite: 'src/components/notifications/NotificationsFeed.tsx',
  },
  {
    method: 'post',
    path: '/v1/notifications/mark-read',
    body: {},
    callSite: 'src/components/notifications/NotificationsFeed.tsx',
  },
];

interface OpenApiSnapshot {
  openapi: string;
  paths: Record<string, Record<string, OpenApiOperation>>;
  components?: { schemas?: Record<string, AnySchemaObject> };
}

interface OpenApiOperation {
  operationId?: string;
  parameters?: OpenApiParameter[];
  requestBody?: {
    required?: boolean;
    content?: Record<string, { schema?: AnySchemaObject }>;
  };
}

interface OpenApiParameter {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  required?: boolean;
  schema?: AnySchemaObject;
}

function loadSnapshot(): OpenApiSnapshot {
  if (!fs.existsSync(SNAPSHOT_PATH)) {
    throw new Error(
      `OpenAPI snapshot missing at ${SNAPSHOT_PATH}. ${REGEN_HINT}`
    );
  }
  const raw = fs.readFileSync(SNAPSHOT_PATH, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `OpenAPI snapshot at ${SNAPSHOT_PATH} is not valid JSON. ${REGEN_HINT}\n${(err as Error).message}`
    );
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof (parsed as { openapi?: unknown }).openapi !== 'string' ||
    typeof (parsed as { paths?: unknown }).paths !== 'object'
  ) {
    throw new Error(
      `OpenAPI snapshot at ${SNAPSHOT_PATH} is missing top-level "openapi" or "paths". ${REGEN_HINT}`
    );
  }
  return parsed as OpenApiSnapshot;
}

function buildAjv(snapshot: OpenApiSnapshot): Ajv2020 {
  const ajv = new Ajv2020({
    strict: false,
    allErrors: true,
    // OpenAPI 3.1 uses JSON Schema 2020-12. Component refs need to be
    // resolvable via $ref. We register the schemas under their snapshot
    // path so `$ref: "#/components/schemas/Foo"` resolves.
    schemas: [
      {
        $id: 'family-recipe-openapi',
        ...snapshot,
      } as AnySchemaObject,
    ],
  });
  addFormats(ajv);
  return ajv;
}

function formatErrors(errors: ErrorObject[] | null | undefined): string {
  if (!errors || errors.length === 0) return '(no AJV errors)';
  return errors
    .map(
      (err) => `${err.instancePath || '<root>'}: ${err.message ?? 'invalid'}`
    )
    .join('\n  ');
}

function refToBody(
  schemaRef: AnySchemaObject | undefined
): AnySchemaObject | null {
  if (!schemaRef) return null;
  if (typeof schemaRef.$ref === 'string') {
    return {
      $ref: `family-recipe-openapi${schemaRef.$ref.replace(/^#/, '#')}`,
    } as AnySchemaObject;
  }
  return schemaRef;
}

describe('OpenAPI contract — frontend → FastAPI /v1/*', () => {
  let snapshot: OpenApiSnapshot;
  let ajv: Ajv2020;

  beforeAll(() => {
    snapshot = loadSnapshot();
    ajv = buildAjv(snapshot);
  });

  it('snapshot file exists, parses, and declares OpenAPI 3.x', () => {
    expect(snapshot.openapi).toMatch(/^3\./);
    expect(Object.keys(snapshot.paths).length).toBeGreaterThan(0);
  });

  describe.each(
    FRONTEND_CALLS.map((call) => ({
      ...call,
      label: `${call.method.toUpperCase()} ${call.path}`,
    }))
  )('$label  ($callSite)', (call) => {
    it('is defined in the snapshot', () => {
      const pathItem = snapshot.paths[call.path];
      if (!pathItem) {
        throw new Error(
          `Frontend calls ${call.method.toUpperCase()} ${call.path} from ${call.callSite}, ` +
            `but the OpenAPI snapshot has no path for it. Either the frontend is ahead of ` +
            `the FastAPI router or the snapshot is stale. ${REGEN_HINT}`
        );
      }
      const operation = pathItem[call.method];
      if (!operation) {
        throw new Error(
          `Frontend calls ${call.method.toUpperCase()} ${call.path} from ${call.callSite}, ` +
            `but the OpenAPI snapshot defines the path without that method. ` +
            `Available methods on this path: ${Object.keys(pathItem).join(', ')}. ${REGEN_HINT}`
        );
      }
    });

    if (call.body !== undefined) {
      it('request body matches the snapshot schema', () => {
        const operation = snapshot.paths[call.path][call.method];
        const schema =
          operation.requestBody?.content?.['application/json']?.schema;
        const bodySchema = refToBody(schema);
        if (!bodySchema) {
          throw new Error(
            `Frontend sends a JSON body to ${call.method.toUpperCase()} ${call.path}, ` +
              `but the snapshot has no application/json request body schema. ${REGEN_HINT}`
          );
        }
        const validate = ajv.compile(bodySchema);
        const ok = validate(call.body);
        if (!ok) {
          throw new Error(
            `Frontend body fixture for ${call.method.toUpperCase()} ${call.path} ` +
              `(from ${call.callSite}) does not match the FastAPI schema:\n  ` +
              `${formatErrors(validate.errors)}\n${REGEN_HINT}`
          );
        }
      });
    }

    if (call.query !== undefined) {
      it('every query parameter is declared in the snapshot', () => {
        const operation = snapshot.paths[call.path][call.method];
        const declared = new Map(
          (operation.parameters ?? [])
            .filter((p) => p.in === 'query')
            .map((p) => [p.name, p] as const)
        );
        const queryEntries = Object.entries(call.query!);
        for (const [name, value] of queryEntries) {
          const param = declared.get(name);
          if (!param) {
            throw new Error(
              `Frontend sends query param "${name}" on ${call.method.toUpperCase()} ${call.path} ` +
                `(from ${call.callSite}), but the snapshot does not declare it. ` +
                `Declared: ${[...declared.keys()].join(', ') || '(none)'}. ${REGEN_HINT}`
            );
          }
          if (param.schema) {
            const validate = ajv.compile(param.schema);
            const ok = validate(value);
            if (!ok) {
              throw new Error(
                `Frontend value for query param "${name}" on ${call.method.toUpperCase()} ` +
                  `${call.path} (from ${call.callSite}) does not match the snapshot schema:\n  ` +
                  `${formatErrors(validate.errors)}\n${REGEN_HINT}`
              );
            }
          }
        }
      });
    }
  });
});
