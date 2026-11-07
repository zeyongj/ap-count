import { BlobPreconditionFailedError, get, put } from "@vercel/blob";
import {
  INITIAL_REVISION,
  MAX_STORED_BYTES,
  parseStoredPortfolio,
  RevisionConflictError,
  type PortfolioStore,
  type StoredPortfolio,
} from "./portfolio.js";

export const PORTFOLIO_PATH = "ap-count/portfolio-v1.json";

export function createBlobPortfolioStore(
  env: NodeJS.ProcessEnv = process.env,
): PortfolioStore {
  function storageOptions() {
    if (env.BLOB_READ_WRITE_TOKEN)
      return { token: env.BLOB_READ_WRITE_TOKEN, access: "private" as const };
    if (!env.BLOB_STORE_ID)
      throw new Error("The private portfolio store is not configured.");
    return { storeId: env.BLOB_STORE_ID, access: "private" as const };
  }
  async function read() {
    const result = await get(PORTFOLIO_PATH, {
      ...storageOptions(),
      useCache: false,
    });
    if (!result) return null;
    if (result.statusCode !== 200 || result.blob.size > MAX_STORED_BYTES)
      throw new Error("Unexpected shared portfolio storage response.");
    const text = await new Response(result.stream).text();
    if (new TextEncoder().encode(text).byteLength > MAX_STORED_BYTES)
      throw new Error("The stored portfolio is too large.");
    return {
      document: parseStoredPortfolio(JSON.parse(text)),
      revision: result.blob.etag,
    };
  }
  async function write(document: StoredPortfolio, expectedRevision: string) {
    const initial = expectedRevision === INITIAL_REVISION;
    try {
      const result = await put(PORTFOLIO_PATH, JSON.stringify(document), {
        ...storageOptions(),
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: !initial,
        ...(initial ? {} : { ifMatch: expectedRevision }),
      });
      return result.etag;
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError)
        throw new RevisionConflictError();
      // The first writer uses create-only semantics. An existing object means another
      // request won the initialization race; it must never be overwritten.
      if (initial) {
        try {
          if (await read()) throw new RevisionConflictError();
        } catch (readError) {
          if (readError instanceof RevisionConflictError) throw readError;
        }
      }
      throw error;
    }
  }
  return { read, write };
}
