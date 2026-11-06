import { beforeEach, describe, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  Precondition: class extends Error {},
}));
vi.mock("@vercel/blob", () => ({
  get: mocks.get,
  put: mocks.put,
  BlobPreconditionFailedError: mocks.Precondition,
}));
import { createBlobPortfolioStore, PORTFOLIO_PATH } from "../server/blob-store";
import { freshDefaultRules } from "../src/lib/default-rules";
import {
  RevisionConflictError,
  type StoredPortfolio,
} from "../server/portfolio";

const document: StoredPortfolio = {
  version: 1,
  updatedAt: "2026-11-06T15:00:00.000Z",
  portfolios: freshDefaultRules(),
};
const blobResult = (value: unknown = document) => ({
  statusCode: 200,
  stream: new Response(JSON.stringify(value)).body!,
  blob: { size: JSON.stringify(value).length, etag: '"v1"' },
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockImplementation(async () => blobResult());
  mocks.put.mockResolvedValue({ etag: '"v2"' });
});

describe("private Blob portfolio adapter", () => {
  test("reads always use the latest origin data and a fixed private pathname", async () => {
    const store = createBlobPortfolioStore({
      BLOB_STORE_ID: "store_unit_test",
    });
    expect(await store.read()).toEqual({ document, revision: '"v1"' });
    expect(mocks.get).toHaveBeenCalledWith(PORTFOLIO_PATH, {
      access: "private",
      storeId: "store_unit_test",
      useCache: false,
    });
  });

  test("managed read-write credentials are supported without exposing them in results", async () => {
    const store = createBlobPortfolioStore({
      BLOB_READ_WRITE_TOKEN: "unit-test-credential",
    });
    const result = await store.read();
    expect(mocks.get).toHaveBeenCalledWith(PORTFOLIO_PATH, {
      access: "private",
      token: "unit-test-credential",
      useCache: false,
    });
    expect(JSON.stringify(result)).not.toContain("unit-test-credential");
  });

  test("updates require the exact expected ETag", async () => {
    const store = createBlobPortfolioStore({
      BLOB_STORE_ID: "store_unit_test",
    });
    expect(await store.write(document, '"v1"')).toBe('"v2"');
    expect(mocks.put).toHaveBeenCalledWith(
      PORTFOLIO_PATH,
      JSON.stringify(document),
      expect.objectContaining({
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        ifMatch: '"v1"',
      }),
    );
    mocks.put.mockRejectedValue(new mocks.Precondition());
    await expect(store.write(document, '"v1"')).rejects.toBeInstanceOf(
      RevisionConflictError,
    );
  });

  test("initialization uses create-only and reports a concurrent winner as 409-compatible", async () => {
    const store = createBlobPortfolioStore({
      BLOB_STORE_ID: "store_unit_test",
    });
    expect(await store.write(document, "initial")).toBe('"v2"');
    const options = mocks.put.mock.calls[0][2];
    expect(options.allowOverwrite).toBe(false);
    expect(options).not.toHaveProperty("ifMatch");
    mocks.put.mockRejectedValue(new Error("already exists"));
    await expect(store.write(document, "initial")).rejects.toBeInstanceOf(
      RevisionConflictError,
    );
  });

  test("missing configuration, storage errors, and invalid documents fail closed", async () => {
    await expect(createBlobPortfolioStore({}).read()).rejects.toThrow(
      "not configured",
    );
    expect(mocks.get).not.toHaveBeenCalled();
    const store = createBlobPortfolioStore({
      BLOB_STORE_ID: "store_unit_test",
    });
    mocks.get.mockResolvedValue(null);
    expect(await store.read()).toBeNull();
    mocks.put.mockRejectedValue(new Error("storage offline"));
    await expect(store.write(document, "initial")).rejects.toThrow(
      "storage offline",
    );
    mocks.get.mockImplementation(async () =>
      blobResult({ ...document, portfolios: [] }),
    );
    await expect(store.read()).rejects.toThrow("Invalid stored portfolio");
  });
});
