import { randomUUID } from "node:crypto";
import { validateRules } from "../src/lib/analysis.js";
import { freshDefaultRules } from "../src/lib/default-rules.js";
import type { APPortfolio, RuleIssue } from "../src/lib/types.js";
import type {
  AccessRole,
  Administrator,
  GovernanceSnapshot,
  RuleActor,
  RuleVersion,
} from "../src/lib/governance.js";

export const INITIAL_REVISION = "initial";
export const MAX_JSON_BYTES = 1024 * 1024;
export const MAX_STORED_BYTES = 3 * MAX_JSON_BYTES;
export const HISTORY_LIMIT = 100;
export const ADMIN_LIMIT = 20;

export interface AdminGrant {
  userId: string;
  email: string;
  addedAt: string;
  addedBy: RuleActor;
}
export interface StoredPortfolio {
  version: 1;
  updatedAt: string;
  portfolios: APPortfolio[];
  /** Optional for backwards-compatible migration of the existing rule document. */
  governance?: { administrators: AdminGrant[]; history: RuleVersion[] };
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
  /** Bootstrap-owner status only; dynamic roles are resolved against current storage. */
  canEdit: boolean;
  isOwner?: boolean;
  actor?: RuleActor;
}
export interface ApiDependencies {
  store: PortfolioStore;
  authorize(request: Request): Promise<AdminAuthorization>;
  lookupAdministrator?(email: string): Promise<RuleActor>;
  ownerEmail?: string;
  now?: () => Date;
  newId?: () => string;
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
function record(input: unknown): input is Record<string, unknown> {
  return Boolean(input && typeof input === "object" && !Array.isArray(input));
}
export const normalizeEmail = (email: string) => email.trim().toLowerCase();
function validTime(input: unknown): input is string {
  return (
    typeof input === "string" &&
    input.length <= 100 &&
    Number.isFinite(Date.parse(input))
  );
}
function cleanActor(input: unknown): RuleActor {
  if (
    !record(input) ||
    typeof input.userId !== "string" ||
    !input.userId ||
    input.userId.length > 200 ||
    typeof input.email !== "string" ||
    !input.email ||
    input.email.length > 254
  )
    throw new Error("Invalid stored actor.");
  return { userId: input.userId, email: normalizeEmail(input.email) };
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
function cleanVersion(input: unknown): RuleVersion {
  if (
    !record(input) ||
    typeof input.id !== "string" ||
    !input.id ||
    input.id.length > 200 ||
    !Number.isSafeInteger(input.number) ||
    (input.number as number) < 1 ||
    (input.createdAt !== null && !validTime(input.createdAt)) ||
    !["baseline", "save", "rollback"].includes(input.action as string) ||
    (input.restoredFrom !== null &&
      (typeof input.restoredFrom !== "string" ||
        !input.restoredFrom ||
        input.restoredFrom.length > 200))
  )
    throw new Error("Invalid stored version.");
  if (
    (input.action === "baseline") !== (input.actor === null) ||
    (input.action === "rollback") !== (input.restoredFrom !== null) ||
    (input.action !== "baseline" && input.createdAt === null)
  )
    throw new Error("Invalid stored version attribution.");
  return {
    id: input.id,
    number: input.number as number,
    createdAt: input.createdAt as string | null,
    actor: input.actor === null ? null : cleanActor(input.actor),
    action: input.action as RuleVersion["action"],
    restoredFrom: input.restoredFrom as string | null,
    portfolios: cleanPortfolios(input.portfolios),
  };
}
export function parseStoredPortfolio(input: unknown): StoredPortfolio {
  if (
    !record(input) ||
    input.version !== 1 ||
    !validTime(input.updatedAt) ||
    !("portfolios" in input)
  )
    throw new Error("Invalid stored portfolio schema.");
  try {
    const result: StoredPortfolio = {
      version: 1,
      updatedAt: input.updatedAt,
      portfolios: cleanPortfolios(input.portfolios),
    };
    if (input.governance !== undefined) {
      const governance = input.governance;
      if (
        !record(governance) ||
        !Array.isArray(governance.administrators) ||
        governance.administrators.length > ADMIN_LIMIT ||
        !Array.isArray(governance.history) ||
        !governance.history.length ||
        governance.history.length > HISTORY_LIMIT
      )
        throw new Error("Invalid governance schema.");
      const administrators = governance.administrators.map(
        (item: unknown): AdminGrant => {
          if (!record(item) || !validTime(item.addedAt))
            throw new Error("Invalid administrator grant.");
          return {
            ...cleanActor(item),
            addedAt: item.addedAt,
            addedBy: cleanActor(item.addedBy),
          };
        },
      );
      if (
        new Set(administrators.map((item) => item.userId)).size !==
          administrators.length ||
        new Set(administrators.map((item) => item.email)).size !==
          administrators.length
      )
        throw new Error("Duplicate administrator grants.");
      const history = governance.history.map(cleanVersion);
      if (
        new Set(history.map((item) => item.id)).size !== history.length ||
        history.some(
          (item, index) =>
            index > 0 && item.number !== history[index - 1].number - 1,
        ) ||
        JSON.stringify(history[0].portfolios) !==
          JSON.stringify(result.portfolios) ||
        (history[0].createdAt !== null &&
          history[0].createdAt !== result.updatedAt)
      )
        throw new Error("Invalid history sequence.");
      result.governance = { administrators, history };
    }
    return result;
  } catch {
    throw new Error("Invalid stored portfolio rules or governance.");
  }
}
interface CurrentPortfolio extends PortfolioSnapshot {
  document: StoredPortfolio | null;
}
async function readCurrent(store: PortfolioStore): Promise<CurrentPortfolio> {
  const current = await store.read();
  if (!current)
    return {
      version: 1,
      revision: INITIAL_REVISION,
      updatedAt: null,
      portfolios: freshDefaultRules(),
      document: null,
    };
  if (!current.revision || current.revision === INITIAL_REVISION)
    throw new Error("The stored portfolio revision is missing.");
  const document = parseStoredPortfolio(current.document);
  return {
    version: 1,
    revision: current.revision,
    updatedAt: document.updatedAt,
    portfolios: document.portfolios,
    document,
  };
}
function publicSnapshot(current: PortfolioSnapshot): PortfolioSnapshot {
  return {
    version: 1,
    revision: current.revision,
    updatedAt: current.updatedAt,
    portfolios: current.portfolios,
  };
}
function governance(
  current: CurrentPortfolio,
): NonNullable<StoredPortfolio["governance"]> {
  return (
    current.document?.governance ?? {
      administrators: [],
      history: [
        {
          id: "baseline",
          number: 1,
          createdAt: current.updatedAt,
          actor: null,
          action: "baseline",
          restoredFrom: null,
          portfolios: current.portfolios,
        },
      ],
    }
  );
}
function roleFor(
  authorization: AdminAuthorization,
  current: CurrentPortfolio,
): AccessRole {
  if (!authorization.signedIn || !authorization.actor) return "visitor";
  if (authorization.isOwner) return "owner";
  return governance(current).administrators.some(
    (grant) =>
      grant.userId === authorization.actor!.userId &&
      grant.email === normalizeEmail(authorization.actor!.email),
  )
    ? "admin"
    : "visitor";
}
function requireEditor(
  authorization: AdminAuthorization,
  current: CurrentPortfolio,
) {
  if (!authorization.signedIn)
    throw new ApiError(
      401,
      "unauthorized",
      "Sign in as an administrator to continue.",
    );
  const role = roleFor(authorization, current);
  if (role === "visitor")
    throw new ApiError(403, "forbidden", "Administrator access is required.");
  return role;
}
function requireRevision(
  input: unknown,
): asserts input is Record<string, unknown> & { revision: string } {
  if (
    !record(input) ||
    typeof input.revision !== "string" ||
    !input.revision ||
    input.revision.length > 512
  )
    throw new ApiError(400, "invalid_request", "Send the current revision.");
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
      "The request JSON exceeds 1 MB.",
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
          "The request JSON exceeds 1 MB.",
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
  const now = () => (deps.now?.() ?? new Date()).toISOString();
  async function respond(operation: string, action: () => Promise<Response>) {
    try {
      return await action();
    } catch (error) {
      if (error instanceof RevisionConflictError)
        return json(
          {
            code: "revision_conflict",
            message:
              "Shared rules or administrator access changed. Reload the latest state before saving.",
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
  function managementSnapshot(
    current: CurrentPortfolio,
    authorization: AdminAuthorization,
  ): GovernanceSnapshot {
    const role = requireEditor(authorization, current);
    const data = governance(current);
    const administrators: Administrator[] =
      role === "owner"
        ? [
            {
              userId: authorization.actor!.userId,
              email: normalizeEmail(
                deps.ownerEmail ?? authorization.actor!.email,
              ),
              role: "owner",
              addedAt: null,
              addedBy: null,
            },
            ...data.administrators.map((grant) => ({
              ...grant,
              role: "admin" as const,
            })),
          ]
        : [];
    return {
      revision: current.revision,
      role,
      administrators,
      history: data.history,
      historyLimit: HISTORY_LIMIT,
    };
  }
  async function persist(
    current: CurrentPortfolio,
    document: StoredPortfolio,
  ): Promise<CurrentPortfolio> {
    const sanitized = parseStoredPortfolio(document);
    const byteSize = () =>
      new TextEncoder().encode(JSON.stringify(sanitized)).byteLength;
    // Retention is bounded by both count and bytes. Trim only complete oldest
    // snapshots so large historical rules cannot lock out future saves/revokes.
    while (
      byteSize() > MAX_STORED_BYTES &&
      sanitized.governance!.history.length > 1
    )
      sanitized.governance!.history.pop();
    if (byteSize() > MAX_STORED_BYTES)
      throw new ApiError(
        413,
        "payload_too_large",
        "The current portfolio rules exceed their storage size limit.",
      );
    const revision = await deps.store.write(sanitized, current.revision);
    if (!revision || revision === INITIAL_REVISION)
      throw new Error("The new storage revision is missing.");
    return {
      version: 1,
      revision,
      updatedAt: sanitized.updatedAt,
      portfolios: sanitized.portfolios,
      document: sanitized,
    };
  }
  function nextVersion(
    current: CurrentPortfolio,
    portfolios: APPortfolio[],
    actor: RuleActor,
    action: "save" | "rollback",
    restoredFrom: string | null = null,
  ): StoredPortfolio {
    const data = governance(current);
    const timestamp = now();
    const entry: RuleVersion = {
      id: deps.newId?.() ?? randomUUID(),
      number: data.history[0].number + 1,
      createdAt: timestamp,
      actor: cleanActor(actor),
      action,
      restoredFrom,
      portfolios,
    };
    return {
      version: 1,
      updatedAt: timestamp,
      portfolios,
      governance: {
        administrators: data.administrators,
        history: [entry, ...data.history].slice(0, HISTORY_LIMIT),
      },
    };
  }
  return {
    getPortfolio: (_request: Request) =>
      respond("read-portfolio", async () =>
        json(publicSnapshot(await readCurrent(deps.store))),
      ),
    getAdmin: (request: Request) =>
      respond("check-admin", async () => {
        const authorization = await deps.authorize(request);
        if (!authorization.signedIn)
          return json({
            canEdit: false,
            role: "visitor",
            canManageAdmins: false,
          });
        const current = await readCurrent(deps.store);
        const role = roleFor(authorization, current);
        return json({
          canEdit: role !== "visitor",
          role,
          canManageAdmins: role === "owner",
        });
      }),
    putPortfolio: (request: Request) =>
      respond("save-portfolio", async () => {
        const authorization = await deps.authorize(request);
        if (!authorization.signedIn)
          throw new ApiError(
            401,
            "unauthorized",
            "Sign in as an administrator to save shared rules.",
          );
        const current = await readCurrent(deps.store);
        requireEditor(authorization, current);
        const input = await readJson(request);
        requireRevision(input);
        if (!("portfolios" in input))
          throw new ApiError(
            400,
            "invalid_request",
            "Send the current revision and portfolios.",
          );
        if (input.revision !== current.revision)
          throw new RevisionConflictError();
        const portfolios = cleanPortfolios(input.portfolios);
        return json(
          publicSnapshot(
            await persist(
              current,
              nextVersion(current, portfolios, authorization.actor!, "save"),
            ),
          ),
        );
      }),
    getGovernance: (request: Request) =>
      respond("read-governance", async () => {
        const authorization = await deps.authorize(request);
        if (!authorization.signedIn)
          throw new ApiError(
            401,
            "unauthorized",
            "Sign in as an administrator to view history.",
          );
        const current = await readCurrent(deps.store);
        return json(managementSnapshot(current, authorization));
      }),
    postGovernance: (request: Request) =>
      respond("change-governance", async () => {
        const authorization = await deps.authorize(request);
        if (!authorization.signedIn)
          throw new ApiError(
            401,
            "unauthorized",
            "Sign in as an administrator to continue.",
          );
        const current = await readCurrent(deps.store);
        const role = requireEditor(authorization, current);
        const input = await readJson(request);
        requireRevision(input);
        if (input.revision !== current.revision)
          throw new RevisionConflictError();
        const data = governance(current);
        let document: StoredPortfolio;
        if (input.action === "rollback") {
          if (
            typeof input.versionId !== "string" ||
            input.versionId.length > 200
          )
            throw new ApiError(
              400,
              "invalid_request",
              "Choose a saved version.",
            );
          const target = data.history.find(
            (entry) => entry.id === input.versionId,
          );
          if (!target)
            throw new ApiError(
              422,
              "version_not_found",
              "This version is no longer available.",
            );
          if (target.id === data.history[0].id)
            throw new ApiError(
              422,
              "current_version",
              "This is already the current version.",
            );
          document = nextVersion(
            current,
            cleanPortfolios(target.portfolios),
            authorization.actor!,
            "rollback",
            target.id,
          );
        } else {
          if (role !== "owner")
            throw new ApiError(
              403,
              "forbidden",
              "Only the Owner can manage administrator access.",
            );
          let administrators = [...data.administrators];
          if (input.action === "grant-admin") {
            if (
              typeof input.email !== "string" ||
              input.email.length > 254 ||
              !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())
            )
              throw new ApiError(
                422,
                "invalid_email",
                "Enter a valid email address.",
              );
            const email = normalizeEmail(input.email);
            if (
              email ===
              normalizeEmail(deps.ownerEmail ?? authorization.actor!.email)
            )
              throw new ApiError(
                422,
                "owner_protected",
                "The Owner already has permanent administrator access.",
              );
            if (administrators.length >= ADMIN_LIMIT)
              throw new ApiError(
                422,
                "admin_limit",
                "At most 20 additional administrators can be granted access.",
              );
            if (!deps.lookupAdministrator)
              throw new Error("Administrator lookup is not configured.");
            const actor = cleanActor(await deps.lookupAdministrator(email));
            if (actor.email !== email)
              throw new Error(
                "Administrator lookup returned an unexpected identity.",
              );
            if (actor.userId === authorization.actor!.userId)
              throw new ApiError(
                422,
                "owner_protected",
                "The Owner already has permanent administrator access.",
              );
            if (
              administrators.some(
                (entry) =>
                  entry.userId === actor.userId || entry.email === actor.email,
              )
            )
              throw new ApiError(
                422,
                "already_admin",
                "This account already has administrator access.",
              );
            administrators.push({
              ...actor,
              addedAt: now(),
              addedBy: cleanActor(authorization.actor!),
            });
          } else if (input.action === "revoke-admin") {
            if (
              typeof input.userId !== "string" ||
              !input.userId ||
              input.userId.length > 200
            )
              throw new ApiError(
                400,
                "invalid_request",
                "Choose an administrator account.",
              );
            if (input.userId === authorization.actor!.userId)
              throw new ApiError(
                422,
                "owner_protected",
                "The Owner's access cannot be revoked.",
              );
            if (!administrators.some((entry) => entry.userId === input.userId))
              throw new ApiError(
                422,
                "admin_not_found",
                "This administrator no longer has access.",
              );
            administrators = administrators.filter(
              (entry) => entry.userId !== input.userId,
            );
          } else
            throw new ApiError(
              400,
              "invalid_request",
              "Choose a supported management action.",
            );
          document = {
            version: 1,
            updatedAt: current.updatedAt ?? now(),
            portfolios: current.portfolios,
            governance: { administrators, history: data.history },
          };
        }
        return json(
          managementSnapshot(await persist(current, document), authorization),
        );
      }),
  };
}
