import { describe, expect, test, vi } from "vitest";
import { freshDefaultRules } from "../src/lib/default-rules";
import {
  ApiError,
  createApiHandlers,
  INITIAL_REVISION,
  MAX_JSON_BYTES,
  RevisionConflictError,
  type PortfolioStore,
  type StoredPortfolio,
} from "../server/portfolio";

const now = new Date("2026-11-06T15:00:00.000Z");
const document = (): StoredPortfolio => ({
  version: 1,
  updatedAt: now.toISOString(),
  portfolios: freshDefaultRules(),
});
const admin = async () => ({ signedIn: true, canEdit: true });
const request = (body: unknown, extra: RequestInit = {}) =>
  new Request("https://ap-count.vercel.app/api/portfolio", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...extra,
  });

function memoryStore(initial: StoredPortfolio | null = document()) {
  let current = initial
    ? { document: structuredClone(initial), revision: '"v1"' }
    : null;
  let counter = initial ? 1 : 0;
  const write = vi.fn(async (next: StoredPortfolio, expected: string) => {
    if (expected !== (current?.revision ?? INITIAL_REVISION))
      throw new RevisionConflictError();
    current = { document: structuredClone(next), revision: `"v${++counter}"` };
    return current.revision;
  });
  const store: PortfolioStore = {
    read: async () => structuredClone(current),
    write,
  };
  return { store, write, current: () => current };
}

describe("shared portfolio API", () => {
  test("public reads return the current shared rules without checking identity or caching", async () => {
    const { store } = memoryStore();
    const authorize = vi.fn(admin);
    const api = createApiHandlers({ store, authorize });
    const response = await api.getPortfolio(
      new Request("https://ap-count.vercel.app/api/portfolio"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ...document(), revision: '"v1"' });
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Vercel-CDN-Cache-Control")).toBe("no-store");
    expect(authorize).not.toHaveBeenCalled();
  });

  test("an empty configured store has a shared initial revision", async () => {
    const { store } = memoryStore(null);
    const api = createApiHandlers({ store, authorize: admin });
    const response = await api.getPortfolio(
      new Request("https://ap-count.vercel.app/api/portfolio"),
    );
    expect(await response.json()).toEqual({
      version: 1,
      revision: "initial",
      updatedAt: null,
      portfolios: freshDefaultRules(),
    });
  });

  test.each([
    [{ signedIn: false, canEdit: false }, 401, "unauthorized"],
    [{ signedIn: true, canEdit: false }, 403, "forbidden"],
    [{ signedIn: false, canEdit: true }, 401, "unauthorized"],
  ])(
    "writes are enforced server-side for authorization %j",
    async (authorization, status, code) => {
      const { store, write } = memoryStore();
      const api = createApiHandlers({
        store,
        authorize: async () => authorization,
      });
      const response = await api.putPortfolio(
        request({ revision: '"v1"', portfolios: freshDefaultRules() }),
      );
      expect(response.status).toBe(status);
      expect((await response.json()).code).toBe(code);
      expect(write).not.toHaveBeenCalled();
    },
  );

  test("admin status exposes only a boolean, including for signed-in non-admin users", async () => {
    const { store } = memoryStore();
    for (const authorization of [
      { signedIn: false, canEdit: false },
      { signedIn: true, canEdit: false },
      { signedIn: true, canEdit: true },
    ]) {
      const api = createApiHandlers({
        store,
        authorize: async () => authorization,
      });
      const response = await api.getAdmin(
        new Request("https://ap-count.vercel.app/api/admin"),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ canEdit: authorization.canEdit });
    }
  });

  test("invalid sessions return 401 without echoing identity-provider details", async () => {
    const { store } = memoryStore();
    const api = createApiHandlers({
      store,
      authorize: async () => {
        throw new ApiError(401, "unauthorized", "Sign in again.");
      },
    });
    const response = await api.getAdmin(
      new Request("https://ap-count.vercel.app/api/admin"),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      code: "unauthorized",
      message: "Sign in again.",
    });
  });

  test("a successful administrator save is visible through an independent reader", async () => {
    const { store } = memoryStore();
    const writer = createApiHandlers({
      store,
      authorize: admin,
      now: () => now,
    });
    const reader = createApiHandlers({
      store,
      authorize: async () => ({ signedIn: false, canEdit: false }),
    });
    const rules = freshDefaultRules();
    rules[0].name = "Updated AP";
    const response = await writer.putPortfolio(
      request({
        revision: '"v1"',
        portfolios: rules,
        updatedAt: "1900-01-01",
        secret: "do not store",
      }),
    );
    expect(response.status).toBe(200);
    const saved = await response.json();
    expect(saved).toEqual({
      version: 1,
      revision: '"v2"',
      updatedAt: now.toISOString(),
      portfolios: rules,
    });
    expect(
      await (
        await reader.getPortfolio(
          new Request("https://ap-count.vercel.app/api/portfolio"),
        )
      ).json(),
    ).toEqual(saved);
  });

  test("arbitrary fields in imported rules are not stored or returned", async () => {
    const { store, current } = memoryStore();
    const rules = freshDefaultRules() as (ReturnType<
      typeof freshDefaultRules
    >[number] & { invoiceRows?: string[] })[];
    rules[0].invoiceRows = ["private invoice payload"];
    const api = createApiHandlers({ store, authorize: admin });
    const response = await api.putPortfolio(
      request({ revision: '"v1"', portfolios: rules }),
    );
    expect(response.status).toBe(200);
    expect(JSON.stringify(current())).not.toContain("private invoice");
    expect(JSON.stringify(await response.json())).not.toContain("invoiceRows");
  });

  test("an explicit project that also belongs to another range requires resolution", async () => {
    const { store, write } = memoryStore();
    const rules = freshDefaultRules();
    rules[2].include.push(5537);
    const api = createApiHandlers({ store, authorize: admin });
    const response = await api.putPortfolio(
      request({ revision: '"v1"', portfolios: rules }),
    );
    expect(response.status).toBe(422);
    const error = await response.json();
    expect(error.code).toBe("invalid_rules");
    expect(
      error.issues.some(
        (issue: { project?: number }) => issue.project === 5537,
      ),
    ).toBe(true);
    expect(write).not.toHaveBeenCalled();
  });

  test("stale revisions never overwrite the shared distribution", async () => {
    const { store, write } = memoryStore();
    const api = createApiHandlers({ store, authorize: admin });
    const response = await api.putPortfolio(
      request({ revision: '"outdated"', portfolios: freshDefaultRules() }),
    );
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("revision_conflict");
    expect(write).not.toHaveBeenCalled();
  });

  test.each([false, true])(
    "concurrent %s initialization/update yields one success and one 409",
    async (empty) => {
      const { store, current } = memoryStore(empty ? null : document());
      const api = createApiHandlers({ store, authorize: admin });
      const firstRules = freshDefaultRules();
      const secondRules = freshDefaultRules();
      firstRules[0].name = "First choice";
      secondRules[0].name = "Second choice";
      const revision = empty ? "initial" : '"v1"';
      const responses = await Promise.all([
        api.putPortfolio(request({ revision, portfolios: firstRules })),
        api.putPortfolio(request({ revision, portfolios: secondRules })),
      ]);
      expect(responses.map((response) => response.status).sort()).toEqual([
        200, 409,
      ]);
      const winner = await responses
        .find((response) => response.status === 200)!
        .json();
      expect(current()?.document.portfolios[0].name).toBe(
        winner.portfolios[0].name,
      );
    },
  );

  test("storage outages and corrupted stored rules fail closed rather than reverting to defaults", async () => {
    const reportFailure = vi.fn();
    for (const read of [
      async () => {
        throw new Error("token=secret not for response");
      },
      async () => ({
        document: { ...document(), portfolios: [] },
        revision: '"v1"',
      }),
    ]) {
      const api = createApiHandlers({
        store: { read, write: vi.fn() },
        authorize: admin,
        reportFailure,
      });
      const response = await api.getPortfolio(
        new Request("https://ap-count.vercel.app/api/portfolio"),
      );
      expect(response.status).toBe(503);
      const body = await response.text();
      expect(body).not.toContain("secret");
      expect(body).not.toContain("portfolios");
    }
    expect(reportFailure).toHaveBeenCalledWith("read-portfolio");
  });

  test("request format and size are validated before any save", async () => {
    const { store, write } = memoryStore();
    const api = createApiHandlers({ store, authorize: admin });
    const cases = [
      [
        new Request("https://ap-count.vercel.app/api/portfolio", {
          method: "PUT",
          body: "not JSON",
        }),
        415,
      ],
      [
        new Request("https://ap-count.vercel.app/api/portfolio", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: "{",
        }),
        400,
      ],
      [request({ portfolios: freshDefaultRules() }), 400],
      [request({ revision: '"v1"', portfolios: [] }), 422],
      [
        request(
          { revision: '"v1"', portfolios: freshDefaultRules() },
          {
            headers: {
              "Content-Type": "application/json",
              "Content-Length": String(MAX_JSON_BYTES + 1),
            },
          },
        ),
        413,
      ],
      [
        new Request("https://ap-count.vercel.app/api/portfolio", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: " ".repeat(MAX_JSON_BYTES + 1),
        }),
        413,
      ],
    ] as const;
    for (const [input, status] of cases)
      expect((await api.putPortfolio(input)).status).toBe(status);
    expect(write).not.toHaveBeenCalled();
  });
});
