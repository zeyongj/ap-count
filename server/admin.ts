import { createClerkClient } from "@clerk/backend";
import { ApiError, type AdminAuthorization } from "./portfolio.js";

interface AdminUser {
  primaryEmailAddressId: string | null;
  emailAddresses: {
    id: string;
    emailAddress: string;
    verification: { status: string } | null;
  }[];
}

export function isVerifiedAdministrator(
  user: AdminUser,
  adminEmail: string,
): boolean {
  const primary = user.emailAddresses.find(
    (email) => email.id === user.primaryEmailAddressId,
  );
  return Boolean(
    adminEmail.trim() &&
      primary?.verification?.status === "verified" &&
      primary.emailAddress.trim().toLowerCase() ===
        adminEmail.trim().toLowerCase(),
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
    if (
      !env.CLERK_SECRET_KEY ||
      !env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
      !env.AP_COUNT_ADMIN_EMAIL?.trim()
    )
      throw new Error("Administrator authentication is not configured.");
    const client = createClerkClient({
      secretKey: env.CLERK_SECRET_KEY,
      publishableKey: env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      telemetry: { disabled: true },
    });
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
    // Fetch the verified identity server-side. Frontend roles, JWT custom claims,
    // secondary email addresses, and request-supplied email values grant no access.
    const user = await client.users.getUser(authentication.userId);
    return {
      signedIn: true,
      canEdit: isVerifiedAdministrator(user, env.AP_COUNT_ADMIN_EMAIL),
    };
  };
}
