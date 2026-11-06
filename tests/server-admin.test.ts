import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  user: vi.fn(),
  client: vi.fn(),
}));
vi.mock("@clerk/backend", () => ({
  createClerkClient: (...options: unknown[]) => {
    mocks.client(...options);
    return {
      authenticateRequest: mocks.authenticate,
      users: { getUser: mocks.user },
    };
  },
}));

import {
  authorizedOrigins,
  createAdminAuthorizer,
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
      expect(await authorize(bearerRequest())).toEqual({
        signedIn: true,
        canEdit: false,
      });
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
