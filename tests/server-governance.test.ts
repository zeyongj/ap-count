import { describe, expect, test, vi } from "vitest";
import { freshDefaultRules } from "../src/lib/default-rules";
import {
  ApiError,
  createApiHandlers,
  HISTORY_LIMIT,
  INITIAL_REVISION,
  parseStoredPortfolio,
  RevisionConflictError,
  type AdminAuthorization,
  type PortfolioStore,
  type StoredPortfolio,
} from "../server/portfolio";
import type { GovernanceSnapshot } from "../src/lib/governance";

const timestamp = "2026-11-07T12:00:00.000Z";
const ownerActor = { userId: "user_owner", email: "owner@example.test" };
const memberActor = { userId: "user_member", email: "member@example.test" };
const owner: AdminAuthorization = {
  signedIn: true,
  canEdit: true,
  isOwner: true,
  actor: ownerActor,
};
const member: AdminAuthorization = {
  signedIn: true,
  canEdit: false,
  isOwner: false,
  actor: memberActor,
};
const reader: AdminAuthorization = {
  signedIn: true,
  canEdit: false,
  isOwner: false,
  actor: { userId: "user_reader", email: "reader@example.test" },
};
const document = (): StoredPortfolio => ({
  version: 1,
  updatedAt: "2026-11-06T12:00:00.000Z",
  portfolios: freshDefaultRules(),
});
const get = () => new Request("https://ap-count.vercel.app/api/governance");
const post = (body: unknown) =>
  new Request("https://ap-count.vercel.app/api/governance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
function setup(initial: StoredPortfolio | null = document()) {
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
  const lookup = vi.fn(async () => memberActor);
  const deps = {
    store,
    lookupAdministrator: lookup,
    ownerEmail: ownerActor.email,
    now: () => new Date(timestamp),
  };
  return {
    api: (authorization: AdminAuthorization = owner) =>
      createApiHandlers({ ...deps, authorize: async () => authorization }),
    store,
    write,
    lookup,
    current: () => structuredClone(current),
  };
}
async function grant(env: ReturnType<typeof setup>) {
  const before: GovernanceSnapshot = await (
    await env.api().getGovernance(get())
  ).json();
  const response = await env
    .api()
    .postGovernance(
      post({
        revision: before.revision,
        action: "grant-admin",
        email: memberActor.email,
      }),
    );
  expect(response.status).toBe(200);
  return response.json() as Promise<GovernanceSnapshot>;
}

describe("administrator management and rule history", () => {
  test("legacy reads preserve real rules and expose an unattributed baseline without migrating storage", async () => {
    const legacy = document();
    legacy.portfolios[0].name = "Existing customized AP";
    const env = setup(legacy);
    const response = await env.api().getGovernance(get());
    const value: GovernanceSnapshot = await response.json();
    expect(response.status).toBe(200);
    expect(value.history).toEqual([
      {
        id: "baseline",
        number: 1,
        action: "baseline",
        actor: null,
        createdAt: legacy.updatedAt,
        restoredFrom: null,
        portfolios: legacy.portfolios,
      },
    ]);
    expect(value.administrators).toEqual([
      {
        userId: ownerActor.userId,
        email: ownerActor.email,
        role: "owner",
        addedAt: null,
        addedBy: null,
      },
    ]);
    expect(env.write).not.toHaveBeenCalled();
    expect(env.current()!.document).toEqual(legacy);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });

  test.each([
    [{ signedIn: false, canEdit: false }, 401],
    [reader, 403],
    [{ signedIn: true, canEdit: true }, 403],
    [{ signedIn: true, canEdit: true, isOwner: true }, 403],
  ])(
    "private management rejects unauthorized identity %j",
    async (authorization, status) => {
      const env = setup();
      expect((await env.api(authorization).getGovernance(get())).status).toBe(
        status,
      );
      expect(
        (
          await env
            .api(authorization)
            .postGovernance(
              post({
                revision: '"v1"',
                action: "grant-admin",
                email: memberActor.email,
              }),
            )
        ).status,
      ).toBe(status);
      expect(
        (
          await env
            .api(authorization)
            .putPortfolio(
              post({ revision: '"v1"', portfolios: freshDefaultRules() }),
            )
        ).status,
      ).toBe(status);
      expect(env.lookup).not.toHaveBeenCalled();
      expect(env.write).not.toHaveBeenCalled();
    },
  );

  test("Owner grants a verified account by server-resolved identity, not request-supplied fields", async () => {
    const env = setup();
    const response = await env
      .api()
      .postGovernance(
        post({
          revision: '"v1"',
          action: "grant-admin",
          email: " MEMBER@example.test ",
          userId: "attacker",
          role: "owner",
          actor: { userId: "fake", email: "fake@example.test" },
          addedAt: "1900-01-01",
        }),
      );
    expect(response.status).toBe(200);
    const value: GovernanceSnapshot = await response.json();
    expect(env.lookup).toHaveBeenCalledWith(memberActor.email);
    expect(value.administrators[1]).toEqual({
      ...memberActor,
      role: "admin",
      addedAt: timestamp,
      addedBy: ownerActor,
    });
    expect(value.history).toHaveLength(1);
    expect((await env.api(member).getAdmin(get())).status).toBe(200);
    expect(await (await env.api(member).getAdmin(get())).json()).toEqual({
      canEdit: true,
      role: "admin",
      canManageAdmins: false,
    });
  });

  test("Admin can read rules history and save, but never sees roster or manages access", async () => {
    const env = setup();
    const value = await grant(env);
    const history: GovernanceSnapshot = await (
      await env.api(member).getGovernance(get())
    ).json();
    expect(history.role).toBe("admin");
    expect(history.administrators).toEqual([]);
    expect(history.history).toHaveLength(1);
    const denied = await env
      .api(member)
      .postGovernance(
        post({
          revision: value.revision,
          action: "revoke-admin",
          userId: ownerActor.userId,
        }),
      );
    expect(denied.status).toBe(403);
    const rules = freshDefaultRules();
    rules[0].name = "Edited by another admin";
    const saved = await env
      .api(member)
      .putPortfolio(post({ revision: value.revision, portfolios: rules }));
    expect(saved.status).toBe(200);
    expect(env.current()!.document.governance!.history[0].actor).toEqual(
      memberActor,
    );
  });

  test("grant is bound to BOTH immutable account ID and current verified primary email", async () => {
    const env = setup();
    await grant(env);
    for (const actor of [
      { ...memberActor, userId: "replacement_user_with_same_email" },
      { ...memberActor, email: "changed-primary@example.test" },
    ]) {
      const status = await (
        await env.api({ ...member, actor }).getAdmin(get())
      ).json();
      expect(status).toEqual({
        canEdit: false,
        role: "visitor",
        canManageAdmins: false,
      });
    }
  });

  test("Owner is permanent and cannot be granted or revoked as a managed Admin", async () => {
    const env = setup();
    for (const input of [
      { action: "grant-admin", email: ownerActor.email },
      { action: "revoke-admin", userId: ownerActor.userId },
    ]) {
      const response = await env
        .api()
        .postGovernance(post({ revision: '"v1"', ...input }));
      expect(response.status).toBe(422);
      expect((await response.json()).code).toBe("owner_protected");
    }
    expect(env.write).not.toHaveBeenCalled();
  });

  test("missing/unverified accounts, duplicate grants and malformed management input do not write", async () => {
    const env = setup();
    for (const code of ["account_not_found", "email_not_verified"]) {
      env.lookup.mockRejectedValueOnce(
        new ApiError(422, code, "Account is not eligible."),
      );
      const response = await env
        .api()
        .postGovernance(
          post({
            revision: '"v1"',
            action: "grant-admin",
            email: memberActor.email,
          }),
        );
      expect(response.status).toBe(422);
      expect((await response.json()).code).toBe(code);
    }
    expect(env.write).not.toHaveBeenCalled();
    const after = await grant(env);
    const repeated = await env
      .api()
      .postGovernance(
        post({
          revision: after.revision,
          action: "grant-admin",
          email: memberActor.email,
        }),
      );
    expect(repeated.status).toBe(422);
    expect((await repeated.json()).code).toBe("already_admin");
    const malformed = await env
      .api()
      .postGovernance(
        post({ revision: after.revision, action: "grant-admin", email: "bad" }),
      );
    expect(malformed.status).toBe(422);
    const stale = await env
      .api()
      .postGovernance(
        post({
          revision: '"v1"',
          action: "revoke-admin",
          userId: memberActor.userId,
        }),
      );
    expect(stale.status).toBe(409);
    expect(env.write).toHaveBeenCalledTimes(1);
  });

  test("history attributes saves to the trusted actor and strips spoofed fields and private data from public reads", async () => {
    const env = setup();
    await grant(env);
    const current = env.current()!;
    const rules = freshDefaultRules();
    rules[0].name = "Updated AP";
    const result = await env
      .api()
      .putPortfolio(
        post({
          revision: current.revision,
          portfolios: rules,
          actor: memberActor,
          updatedAt: "1900-01-01",
          history: [{ invoiceData: "private rows" }],
        }),
      );
    expect(result.status).toBe(200);
    const saved = await result.json();
    expect(Object.keys(saved).sort()).toEqual([
      "portfolios",
      "revision",
      "updatedAt",
      "version",
    ]);
    const history = env.current()!.document.governance!.history;
    expect(history[0]).toMatchObject({
      number: 2,
      actor: ownerActor,
      action: "save",
      createdAt: timestamp,
    });
    expect(history[1]).toMatchObject({
      number: 1,
      actor: null,
      action: "baseline",
    });
    const publicRead = await (await env.api(reader).getPortfolio(get())).text();
    expect(publicRead).not.toContain(ownerActor.email);
    expect(publicRead).not.toContain(memberActor.email);
    expect(publicRead).not.toContain("governance");
    expect(JSON.stringify(env.current())).not.toContain("private rows");
  });

  test("rollback appends a new audited version restoring only rules and preserving current administrator grants", async () => {
    const env = setup();
    const changed = freshDefaultRules();
    changed[0].name = "New assignment name";
    const saved = await env
      .api()
      .putPortfolio(post({ revision: '"v1"', portfolios: changed }));
    expect(saved.status).toBe(200);
    const afterGrant = await grant(env);
    const response = await env
      .api(member)
      .postGovernance(
        post({
          revision: afterGrant.revision,
          action: "rollback",
          versionId: "baseline",
        }),
      );
    expect(response.status).toBe(200);
    const value: GovernanceSnapshot = await response.json();
    expect(value.history).toHaveLength(3);
    expect(value.history[0]).toMatchObject({
      number: 3,
      action: "rollback",
      restoredFrom: "baseline",
      actor: memberActor,
      portfolios: freshDefaultRules(),
    });
    expect(value.history[0].id).not.toBe(value.history[1].id);
    expect(value.history[1].portfolios).toEqual(changed);
    expect(env.current()!.document.governance!.administrators[0].userId).toBe(
      memberActor.userId,
    );
    expect((await (await env.api(member).getAdmin(get())).json()).canEdit).toBe(
      true,
    );
  });

  test("rollback rejects the current, missing, or stale version without modifying the document", async () => {
    const env = setup();
    for (const [versionId, code] of [
      ["baseline", "current_version"],
      ["missing", "version_not_found"],
    ]) {
      const response = await env
        .api()
        .postGovernance(
          post({ revision: '"v1"', action: "rollback", versionId }),
        );
      expect(response.status).toBe(422);
      expect((await response.json()).code).toBe(code);
    }
    const stale = await env
      .api()
      .postGovernance(
        post({
          revision: "outdated",
          action: "rollback",
          versionId: "baseline",
        }),
      );
    expect(stale.status).toBe(409);
    expect(env.write).not.toHaveBeenCalled();
  });

  test("revocation wins over a concurrent admin save through a shared atomic revision", async () => {
    const env = setup();
    const after = await grant(env);
    let release!: () => void;
    let reached!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const waiting = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const realWrite = env.write.getMockImplementation()!;
    env.write.mockImplementation(async (next, revision) => {
      if (next.governance!.history[0].action === "save") {
        reached();
        await blocked;
      }
      return realWrite(next, revision);
    });
    const modified = freshDefaultRules();
    modified[0].name = "Revoked user's draft";
    const saving = env
      .api(member)
      .putPortfolio(post({ revision: after.revision, portfolios: modified }));
    await waiting;
    const revoked = await env
      .api()
      .postGovernance(
        post({
          revision: after.revision,
          action: "revoke-admin",
          userId: memberActor.userId,
        }),
      );
    expect(revoked.status).toBe(200);
    release();
    expect((await saving).status).toBe(409);
    expect(env.current()!.document.portfolios).toEqual(freshDefaultRules());
    expect(
      (
        await env
          .api(member)
          .putPortfolio(
            post({ revision: env.current()!.revision, portfolios: modified }),
          )
      ).status,
    ).toBe(403);
  });

  test("storage failure saves neither rules nor history and never returns provider details", async () => {
    const env = setup();
    env.write.mockRejectedValueOnce(new Error("token=do-not-leak"));
    const response = await env
      .api()
      .putPortfolio(
        post({ revision: '"v1"', portfolios: freshDefaultRules() }),
      );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("do-not-leak");
    expect(env.current()!.document.governance).toBeUndefined();
  });

  test("history retains the latest 100 complete versions with monotonic numbering", async () => {
    const env = setup();
    for (let i = 0; i < HISTORY_LIMIT + 2; i++) {
      const response = await env
        .api()
        .putPortfolio(
          post({
            revision: env.current()!.revision,
            portfolios: freshDefaultRules(),
          }),
        );
      expect(response.status).toBe(200);
    }
    const value: GovernanceSnapshot = await (
      await env.api().getGovernance(get())
    ).json();
    expect(value.historyLimit).toBe(100);
    expect(value.history).toHaveLength(100);
    expect(value.history[0].number).toBe(103);
    expect(value.history.at(-1)!.number).toBe(4);
    expect(value.history.every((entry) => entry.portfolios.length === 7)).toBe(
      true,
    );
  });

  test("byte-limited retention permits future small saves and role changes after large snapshots", async () => {
    const env = setup();
    const large = freshDefaultRules();
    large.forEach((rule, clerk) => {
      rule.ranges = [];
      rule.exclude = [];
      rule.include = Array.from(
        { length: 10_000 },
        (_, index) => 1_000_000 + clerk * 10_000 + index,
      );
    });
    for (let index = 0; index < 8; index++) {
      large[0].name = `Large version ${index}`;
      const response = await env
        .api()
        .putPortfolio(
          post({ revision: env.current()!.revision, portfolios: large }),
        );
      expect(response.status).toBe(200);
    }
    const retained = env.current()!.document.governance!.history;
    expect(retained.length).toBeLessThan(9);
    expect(retained[0].number).toBe(9);
    expect(retained[0].portfolios[6].include).toHaveLength(10_000);
    const small = await env
      .api()
      .putPortfolio(
        post({
          revision: env.current()!.revision,
          portfolios: freshDefaultRules(),
        }),
      );
    expect(small.status).toBe(200);
    const membership = await grant(env);
    const revoked = await env
      .api()
      .postGovernance(
        post({
          revision: membership.revision,
          action: "revoke-admin",
          userId: memberActor.userId,
        }),
      );
    expect(revoked.status).toBe(200);
    expect(env.current()!.document.governance!.administrators).toEqual([]);
    expect(env.current()!.document.governance!.history[0].number).toBe(10);
    expect(env.current()!.document.portfolios).toEqual(freshDefaultRules());
    expect(() => parseStoredPortfolio(env.current()!.document)).not.toThrow();
  }, 20_000);

  test("corrupt governance fails closed rather than dropping history or resetting access", async () => {
    const env = setup();
    await grant(env);
    const valid = env.current()!.document;
    const invalidCases: unknown[] = [
      { ...valid, governance: { ...valid.governance, history: [] } },
      {
        ...valid,
        governance: {
          ...valid.governance,
          administrators: [
            { ...valid.governance!.administrators[0], addedBy: null },
          ],
        },
      },
      {
        ...valid,
        governance: {
          ...valid.governance,
          history: [{ ...valid.governance!.history[0], actor: ownerActor }],
        },
      },
      {
        ...valid,
        portfolios: freshDefaultRules().map((p, index) =>
          index ? p : { ...p, name: "mismatch" },
        ),
      },
    ];
    for (const invalid of invalidCases)
      expect(() => parseStoredPortfolio(invalid)).toThrow(
        "Invalid stored portfolio",
      );
  });
});
