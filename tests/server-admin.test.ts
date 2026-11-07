import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  user: vi.fn(),
  userList: vi.fn(),
  client: vi.fn(),
}));
vi.mock("@clerk/backend", () => ({
  createClerkClient: (...options: unknown[]) => {
    mocks.client(...options);
    return {
      authenticateRequest: mocks.authenticate,
      users: { getUser: mocks.user, getUserList: mocks.userList },
    };
  },
}));

import {
  authorizedOrigins,
  createAdminAuthorizer,
  createAdministratorLookup,
  isVerifiedAdministrator,
} from "../server/admin";

const env: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  CLERK_SECRET_KEY: "unit-test-secret",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "unit-test-publishable",
  AP_COUNT_ADMIN_EMAIL: "admin@example.test",
};
const primary = {
  id: "email_primary",
  emailAddress: "admin@example.test",
  verification: { status: "verified" },
};
const user = () => ({
  primaryEmailAddressId: primary.id,
  emailAddresses: [structuredClone(primary)],
});
const bearerRequest = () =>
  new Request("https://ap-count.vercel.app/api/admin", {
    headers: {
      Authorization: "Bearer unit-test-session",
      Host: "attacker.example",
    },
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticate.mockResolvedValue({
    isAuthenticated: true,
    toAuth: () => ({ userId: "user_verified" }),
  });
  mocks.user.mockResolvedValue(user());
});

describe("administrator identity enforcement", () => {
  test("requires the verified primary email, not a secondary email or client role", () => {
    expect(isVerifiedAdministrator(user(), " ADMIN@example.test ")).toBe(true);
    expect(
      isVerifiedAdministrator(
        { ...user(), primaryEmailAddressId: null },
        "admin@example.test",
      ),
    ).toBe(false);
    expect(
      isVerifiedAdministrator(
        {
          ...user(),
          emailAddresses: [
            { ...primary, verification: { status: "unverified" } },
          ],
        },
        "admin@example.test",
      ),
    ).toBe(false);
    expect(
      isVerifiedAdministrator(
        {
          primaryEmailAddressId: "other",
          emailAddresses: [
            primary,
            { ...primary, id: "other", emailAddress: "reader@example.test" },
          ],
        },
        "admin@example.test",
      ),
    ).toBe(false);
    expect(isVerifiedAdministrator(user(), "")).toBe(false);
  });

  test("no bearer token stays read-only even if a session cookie is present", async () => {
    const authorize = createAdminAuthorizer(env);
    expect(
      await authorize(
        new Request("https://ap-count.vercel.app/api/admin", {
          headers: { cookie: "__session=untrusted" },
        }),
      ),
    ).toEqual({ signedIn: false, canEdit: false });
    expect(mocks.client).not.toHaveBeenCalled();
  });

  test("malformed credentials and rejected Clerk sessions yield 401", async () => {
    const authorize = createAdminAuthorizer(env);
    await expect(
      authorize(
        new Request("https://ap-count.vercel.app/api/admin", {
          headers: { Authorization: "Basic unit-test" },
        }),
      ),
    ).rejects.toMatchObject({ status: 401, code: "unauthorized" });
    mocks.authenticate.mockResolvedValue({
      isAuthenticated: false,
      toAuth: () => null,
    });
    await expect(authorize(bearerRequest())).rejects.toMatchObject({
      status: 401,
      code: "unauthorized",
    });
    expect(mocks.user).not.toHaveBeenCalled();
  });

  test("a verified administrator is obtained from Clerk's server API", async () => {
    const authorize = createAdminAuthorizer(env);
    expect(await authorize(bearerRequest())).toEqual({
      signedIn: true,
      canEdit: true,
      isOwner: true,
      actor: { userId: "user_verified", email: "admin@example.test" },
    });
    expect(mocks.user).toHaveBeenCalledWith("user_verified");
    expect(mocks.authenticate).toHaveBeenCalledWith(expect.any(Request), {
      authorizedParties: ["https://ap-count.vercel.app"],
      acceptsToken: "session_token",
    });
  });

  test("signed-in non-admin and unverified identities remain read-only", async () => {
    const authorize = createAdminAuthorizer(env);
    for (const identity of [
      {
        ...user(),
        emailAddresses: [{ ...primary, emailAddress: "reader@example.test" }],
      },
      {
        ...user(),
        emailAddresses: [
          { ...primary, verification: { status: "unverified" } },
        ],
      },
    ]) {
      mocks.user.mockResolvedValue(identity);
      const authorization = await authorize(bearerRequest());
      expect(authorization).toMatchObject({
        signedIn: true,
        canEdit: false,
        isOwner: false,
      });
      if (identity.emailAddresses[0].verification?.status === "verified") {
        expect(authorization.actor).toEqual({
          userId: "user_verified",
          email: "reader@example.test",
        });
      } else {
        expect(authorization.actor).toBeUndefined();
      }
    }
  });

  test("unknown configuration or provider failure does not grant access", async () => {
    await expect(createAdminAuthorizer({})(bearerRequest())).rejects.toThrow(
      "not configured",
    );
    mocks.user.mockRejectedValue(new Error("provider outage"));
    await expect(createAdminAuthorizer(env)(bearerRequest())).rejects.toThrow(
      "provider outage",
    );
  });

  test("trusted origins are fixed, with local development origins excluded from production", () => {
    expect(authorizedOrigins(env)).toEqual(["https://ap-count.vercel.app"]);
    expect(authorizedOrigins({ NODE_ENV: "development" })).toContain(
      "http://127.0.0.1:4173",
    );
    expect(authorizedOrigins(env)).not.toContain("http://127.0.0.1:4173");
  });
});

describe("administrator grant identity lookup", () => {
  test("looks up an existing exact verified primary email and binds Clerk user ID", async () => {
    mocks.userList.mockResolvedValue({
      data: [{ ...user(), id: "user_resolved" }],
    });
    expect(
      await createAdministratorLookup(env)(" ADMIN@example.test "),
    ).toEqual({ userId: "user_resolved", email: "admin@example.test" });
    expect(mocks.userList).toHaveBeenCalledWith({
      emailAddress: ["admin@example.test"],
      limit: 100,
    });
  });
  test("missing, secondary-only and ambiguous identities cannot receive grants", async () => {
    for (const data of [
      [],
      [{ ...user(), id: "user_secondary", primaryEmailAddressId: "other" }],
      [
        { ...user(), id: "one" },
        { ...user(), id: "two" },
      ],
    ]) {
      mocks.userList.mockResolvedValue({ data });
      await expect(
        createAdministratorLookup(env)("admin@example.test"),
      ).rejects.toMatchObject({ status: 422, code: "account_not_found" });
    }
  });
  test("unverified, banned and locked accounts cannot receive grants or retain privileged identity", async () => {
    for (const identity of [
      {
        ...user(),
        id: "user_unverified",
        emailAddresses: [
          { ...primary, verification: { status: "unverified" } },
        ],
      },
      { ...user(), id: "user_banned", banned: true },
      { ...user(), id: "user_locked", locked: true },
    ]) {
      mocks.userList.mockResolvedValue({ data: [identity] });
      await expect(
        createAdministratorLookup(env)("admin@example.test"),
      ).rejects.toMatchObject({ status: 422, code: "email_not_verified" });
      mocks.user.mockResolvedValue(identity);
      expect(await createAdminAuthorizer(env)(bearerRequest())).toEqual({
        signedIn: true,
        canEdit: false,
        isOwner: false,
      });
    }
  });
});
