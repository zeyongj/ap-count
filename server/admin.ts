import { createClerkClient } from "@clerk/backend";
import {
  ApiError,
  normalizeEmail,
  type AdminAuthorization,
} from "./portfolio.js";
import type { RuleActor } from "../src/lib/governance.js";

interface AdminUser {
  id?: string;
  banned?: boolean;
  locked?: boolean;
  primaryEmailAddressId: string | null;
  emailAddresses: {
    id: string;
    emailAddress: string;
    verification: { status: string } | null;
  }[];
}
function verifiedPrimaryEmail(user: AdminUser): string | null {
  if (user.banned || user.locked) return null;
  const primary = user.emailAddresses.find(
    (email) => email.id === user.primaryEmailAddressId,
  );
  return primary?.verification?.status === "verified"
    ? normalizeEmail(primary.emailAddress)
    : null;
}
export function isVerifiedAdministrator(
  user: AdminUser,
  adminEmail: string,
): boolean {
  return Boolean(
    adminEmail.trim() &&
      verifiedPrimaryEmail(user) === normalizeEmail(adminEmail),
  );
}
export function authorizedOrigins(env: NodeJS.ProcessEnv): string[] {
  const origins = ["https://ap-count.vercel.app"];
  if (env.NODE_ENV !== "production")
    origins.push(
      "http://127.0.0.1:4173",
      "http://localhost:4173",
      "http://127.0.0.1:5173",
      "http://localhost:5173",
    );
  return origins;
}
function clerkClient(env: NodeJS.ProcessEnv) {
  if (
    !env.CLERK_SECRET_KEY ||
    !env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
    !env.AP_COUNT_ADMIN_EMAIL?.trim()
  )
    throw new Error("Administrator authentication is not configured.");
  return createClerkClient({
    secretKey: env.CLERK_SECRET_KEY,
    publishableKey: env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    telemetry: { disabled: true },
  });
}
export function createAdminAuthorizer(env: NodeJS.ProcessEnv = process.env) {
  return async (request: Request): Promise<AdminAuthorization> => {
    const header = request.headers.get("authorization");
    if (!header) return { signedIn: false, canEdit: false };
    if (!/^Bearer [^\s]+$/i.test(header) || header.length > 16_384)
      throw new ApiError(
        401,
        "unauthorized",
        "Your administrator session is invalid. Please sign in again.",
      );
    const client = clerkClient(env);
    const state = await client.authenticateRequest(request, {
      authorizedParties: authorizedOrigins(env),
      acceptsToken: "session_token",
    });
    if (!state.isAuthenticated)
      throw new ApiError(
        401,
        "unauthorized",
        "Your administrator session has expired or is invalid. Please sign in again.",
      );
    const authentication = state.toAuth();
    if (!authentication?.userId)
      throw new ApiError(
        401,
        "unauthorized",
        "Your administrator session is invalid. Please sign in again.",
      );
    // Identity always comes from Clerk's server API; custom claims, request emails,
    // secondary email addresses, and client roles never confer administrator access.
    const user = await client.users.getUser(authentication.userId);
    const email = verifiedPrimaryEmail(user);
    const isOwner = Boolean(
      email && email === normalizeEmail(env.AP_COUNT_ADMIN_EMAIL!),
    );
    return {
      signedIn: true,
      canEdit: isOwner,
      isOwner,
      ...(email ? { actor: { userId: authentication.userId, email } } : {}),
    };
  };
}
export function createAdministratorLookup(
  env: NodeJS.ProcessEnv = process.env,
) {
  return async (email: string): Promise<RuleActor> => {
    const normalized = normalizeEmail(email);
    const client = clerkClient(env);
    const result = await client.users.getUserList({
      emailAddress: [normalized],
      limit: 100,
    });
    const matching = result.data.filter((user) => {
      const primary = user.emailAddresses.find(
        (address) => address.id === user.primaryEmailAddressId,
      );
      return primary && normalizeEmail(primary.emailAddress) === normalized;
    });
    if (matching.length !== 1)
      throw new ApiError(
        422,
        "account_not_found",
        "Ask this person to sign up first using this primary email address.",
      );
    const user = matching[0];
    if (!verifiedPrimaryEmail(user))
      throw new ApiError(
        422,
        "email_not_verified",
        "This account needs an active, verified primary email before administrator access can be granted.",
      );
    return { userId: user.id, email: normalized };
  };
}
