import { validateRules } from "../src/lib/analysis.js";
import { freshDefaultRules } from "../src/lib/default-rules.js";
import type { APPortfolio, RuleIssue } from "../src/lib/types.js";

export const INITIAL_REVISION = "initial";
export const MAX_JSON_BYTES = 1024 * 1024;

export interface StoredPortfolio {
  version: 1;
  updatedAt: string;
  portfolios: APPortfolio[];
}

export interface PortfolioSnapshot {
  version: 1;
  revision: string;
  updatedAt: string | null;
  portfolios: APPortfolio[];
}

export interface PortfolioStore {
  read(): Promise<{ document: StoredPortfolio; revision: string } | null>;
  write(document: StoredPortfolio, expectedRevision: string): Promise<string>;
}

export interface AdminAuthorization {
  signedIn: boolean;
  canEdit: boolean;
}

export interface ApiDependencies {
  store: PortfolioStore;
  authorize(request: Request): Promise<AdminAuthorization>;
  now?: () => Date;
  reportFailure?: (operation: string) => void;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly issues?: RuleIssue[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class RevisionConflictError extends Error {
  constructor() {
    super("The shared distribution changed.");
    this.name = "RevisionConflictError";
  }
}

const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: responseHeaders });
}

/** Store only the AP-rule schema, never arbitrary fields from an uploaded JSON. */
export function cleanPortfolios(input: unknown): APPortfolio[] {
  const issues = validateRules(input);
  if (issues.length)
    throw new ApiError(
      422,
      "invalid_rules",
      "Resolve the portfolio rule issues before saving.",
      issues,
    );
  const rules = input as APPortfolio[];
  if (rules.some((rule) => rule.id.length > 200 || rule.name.length > 100))
    throw new ApiError(
      422,
      "invalid_rules",
      "AP names must be at most 100 characters and IDs at most 200 characters.",
    );
  return rules.map((rule) => ({
    id: rule.id,
    name: rule.name.trim(),
    ranges: rule.ranges.map((range) => ({
      start: range.start,
      end: range.end,
    })),
    include: [...new Set(rule.include)],
    exclude: [...new Set(rule.exclude)],
  }));
}

export function parseStoredPortfolio(input: unknown): StoredPortfolio {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    !("version" in input) ||
    input.version !== 1 ||
    !("updatedAt" in input) ||
    typeof input.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(input.updatedAt)) ||
    !("portfolios" in input)
  )
    throw new Error("Invalid stored portfolio schema.");
  try {
    return {
      version: 1,
      updatedAt: input.updatedAt,
      portfolios: cleanPortfolios(input.portfolios),
    };
  } catch {
    throw new Error("Invalid stored portfolio rules.");
  }
}

async function readSnapshot(store: PortfolioStore): Promise<PortfolioSnapshot> {
  const current = await store.read();
  if (!current)
    return {
      version: 1,
      revision: INITIAL_REVISION,
      updatedAt: null,
      portfolios: freshDefaultRules(),
    };
  if (!current.revision || current.revision === INITIAL_REVISION)
    throw new Error("The stored portfolio revision is missing.");
  const document = parseStoredPortfolio(current.document);
  return { ...document, revision: current.revision };
}

/** Bound the streamed request body before JSON parsing. */
async function readJson(request: Request): Promise<unknown> {
  if (
    !/^application\/json(?:\s*;|$)/i.test(
      request.headers.get("content-type") ?? "",
    )
  )
    throw new ApiError(415, "unsupported_media_type", "Send application/json.");
  const declared = request.headers.get("content-length");
  if (declared && /^\d+$/.test(declared) && Number(declared) > MAX_JSON_BYTES)
    throw new ApiError(
      413,
      "payload_too_large",
      "The rules JSON exceeds 1 MB.",
    );
  if (!request.body)
    throw new ApiError(400, "invalid_request", "Send a JSON request body.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_JSON_BYTES) {
        await reader.cancel();
        throw new ApiError(
          413,
          "payload_too_large",
          "The rules JSON exceeds 1 MB.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ApiError(400, "invalid_request", "Send valid UTF-8 JSON.");
  }
}

export function createApiHandlers(deps: ApiDependencies) {
  async function respond(operation: string, action: () => Promise<Response>) {
    try {
      return await action();
    } catch (error) {
      if (error instanceof RevisionConflictError)
        return json(
          {
            code: "revision_conflict",
            message:
              "The shared distribution changed. Reload the latest rules before saving.",
          },
          409,
        );
      if (error instanceof ApiError)
        return json(
          {
            code: error.code,
            message: error.message,
            ...(error.issues ? { issues: error.issues } : {}),
          },
          error.status,
        );
      // Provider error messages can contain request details or secrets; never return or log them.
      deps.reportFailure?.(operation);
      return json(
        {
          code: "service_unavailable",
          message:
            "Shared portfolio service is temporarily unavailable. Please try again.",
        },
        503,
      );
    }
  }

  return {
    getPortfolio: (_request: Request) =>
      respond("read-portfolio", async () =>
        json(await readSnapshot(deps.store)),
      ),

    getAdmin: (request: Request) =>
      respond("check-admin", async () => {
        const authorization = await deps.authorize(request);
        return json({
          canEdit: authorization.signedIn && authorization.canEdit,
        });
      }),

    putPortfolio: (request: Request) =>
      respond("save-portfolio", async () => {
        const authorization = await deps.authorize(request);
        if (!authorization.signedIn)
          throw new ApiError(
            401,
            "unauthorized",
            "Sign in as the administrator to save shared rules.",
          );
        if (!authorization.canEdit)
          throw new ApiError(
            403,
            "forbidden",
            "Only the administrator can change shared rules.",
          );
        const input = await readJson(request);
        if (
          !input ||
          typeof input !== "object" ||
          Array.isArray(input) ||
          !("revision" in input) ||
          typeof input.revision !== "string" ||
          !input.revision ||
          input.revision.length > 512 ||
          !("portfolios" in input)
        )
          throw new ApiError(
            400,
            "invalid_request",
            "Send the current revision and portfolios.",
          );
        const portfolios = cleanPortfolios(input.portfolios);
        const current = await readSnapshot(deps.store);
        if (input.revision !== current.revision)
          throw new RevisionConflictError();
        const document: StoredPortfolio = {
          version: 1,
          portfolios,
          updatedAt: (deps.now?.() ?? new Date()).toISOString(),
        };
        if (
          new TextEncoder().encode(JSON.stringify(document)).byteLength >
          MAX_JSON_BYTES
        )
          throw new ApiError(
            413,
            "payload_too_large",
            "The rules JSON exceeds 1 MB.",
          );
        const revision = await deps.store.write(document, current.revision);
        if (!revision || revision === INITIAL_REVISION)
          throw new Error("The new storage revision is missing.");
        return json({ ...document, revision } satisfies PortfolioSnapshot);
      }),
  };
}
