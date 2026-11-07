import { createAdminAuthorizer, createAdministratorLookup } from "./admin.js";
import { createBlobPortfolioStore } from "./blob-store.js";
import { createApiHandlers } from "./portfolio.js";

export function productionHandlers() {
  return createApiHandlers({
    store: createBlobPortfolioStore(),
    authorize: createAdminAuthorizer(),
    lookupAdministrator: createAdministratorLookup(),
    ownerEmail: process.env.AP_COUNT_ADMIN_EMAIL,
    reportFailure: (operation) =>
      console.error(`[AP Count] ${operation} failed.`),
  });
}
