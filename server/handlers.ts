import { createAdminAuthorizer } from "./admin.js";
import { createBlobPortfolioStore } from "./blob-store.js";
import { createApiHandlers } from "./portfolio.js";

export function productionHandlers() {
  return createApiHandlers({
    store: createBlobPortfolioStore(),
    authorize: createAdminAuthorizer(),
    reportFailure: (operation) =>
      console.error(`[AP Count] ${operation} failed.`),
  });
}
