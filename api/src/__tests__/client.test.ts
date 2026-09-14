import { describe, expect, it } from "vitest";
import { handleClientEvaluate, handleClientFeatures } from "../routes/client";
import { KeyContext } from "../lib/auth";

const headers = { "Content-Type": "application/json" };
const context = (keyType: KeyContext["keyType"]): KeyContext => ({
  orgId: "org-1",
  environmentId: "env-1",
  keyType,
  userId: null,
  userEmail: null,
  role: null,
});

describe("client SDK endpoint access", () => {
  it("does not let client keys download rules", async () => {
    const response = await handleClientFeatures(
      new Request("https://api.test/api/client/features"),
      {} as never,
      context("client"),
      headers
    );
    expect(response.status).toBe(403);
  });

  it("does not let server keys use remote client evaluation", async () => {
    const response = await handleClientEvaluate(
      new Request("https://api.test/api/client/evaluate", {
        method: "POST",
        body: JSON.stringify({ context: {} }),
      }),
      {} as never,
      context("server"),
      headers
    );
    expect(response.status).toBe(403);
  });
});
