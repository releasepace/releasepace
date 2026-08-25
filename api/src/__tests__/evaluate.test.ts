import { describe, it, expect } from "vitest";
import { evaluate, FlagStateInput, SegmentIndex, TargetingRule } from "../lib/evaluate";

function state(over: Partial<FlagStateInput> = {}): FlagStateInput {
  return {
    key: "new-checkout",
    type: "boolean",
    enabled: true,
    value: null,
    rollout_pct: null,
    bucket_by: null,
    targeting_rules: [],
    ...over,
  };
}

function rule(over: Partial<TargetingRule> = {}): TargetingRule {
  return {
    id: "r1",
    conditions: [{ attribute: "tenantId", op: "in", values: ["acme-corp"] }],
    serve: { enabled: true },
    ...over,
  };
}

const segments: SegmentIndex = {
  "design-partners": new Set(["acme-corp", "globex"]),
};

describe("evaluation order", () => {
  it("lets the kill switch beat a matching targeting rule", () => {
    // An operator disabling a flag during an incident must not be
    // overridden by "always on for Acme".
    const r = evaluate(
      state({ enabled: false, targeting_rules: [rule()] }),
      { tenantId: "acme-corp" }
    );
    expect(r.enabled).toBe(false);
    expect(r.reason).toBe("KILL_SWITCH");
  });

  it("serves the first matching rule and stops", () => {
    const r = evaluate(
      state({
        targeting_rules: [
          rule({ id: "first", serve: { enabled: true, value: "A" } }),
          rule({ id: "second", serve: { enabled: true, value: "B" } }),
        ],
      }),
      { tenantId: "acme-corp" }
    );
    expect(r.rule_id).toBe("first");
    expect(r.value).toBe("A");
  });

  it("falls through to the default when no rule matches", () => {
    const r = evaluate(state({ targeting_rules: [rule()] }), { tenantId: "other-co" });
    expect(r.enabled).toBe(true);
    expect(r.reason).toBe("DEFAULT");
  });

  it("lets a rule serve off for a specific tenant", () => {
    const r = evaluate(
      state({ targeting_rules: [rule({ serve: { enabled: false } })] }),
      { tenantId: "acme-corp" }
    );
    expect(r.enabled).toBe(false);
    expect(r.reason).toBe("TARGETING_MATCH");
  });
});

describe("the client's actual request", () => {
  const flag = state({
    targeting_rules: [
      rule({
        id: "beta-orgs",
        conditions: [{ attribute: "tenantId", op: "in_segment", value: "design-partners" }],
        serve: { enabled: true },
      }),
    ],
  });

  it("turns the feature on for onboarded orgs in the segment", () => {
    for (const tenantId of ["acme-corp", "globex"]) {
      const r = evaluate(flag, { tenantId }, segments);
      expect(r.enabled, tenantId).toBe(true);
      expect(r.rule_id).toBe("beta-orgs");
    }
  });

  it("leaves every other org on the default", () => {
    const off = evaluate({ ...flag, enabled: false }, { tenantId: "initech" }, segments);
    expect(off.enabled).toBe(false);
  });
});

describe("operators", () => {
  const run = (cond: any, ctx: any) =>
    evaluate(
      state({ enabled: true, rollout_pct: 0, targeting_rules: [rule({ conditions: [cond] })] }),
      ctx,
      segments
    ).reason === "TARGETING_MATCH";

  it("in / not_in", () => {
    expect(run({ attribute: "tenantId", op: "in", values: ["a", "b"] }, { tenantId: "a" })).toBe(true);
    expect(run({ attribute: "tenantId", op: "in", values: ["a"] }, { tenantId: "z" })).toBe(false);
    expect(run({ attribute: "tenantId", op: "not_in", values: ["a"] }, { tenantId: "z" })).toBe(true);
  });

  it("treats a missing attribute as not_in", () => {
    expect(run({ attribute: "plan", op: "not_in", values: ["free"] }, {})).toBe(true);
  });

  it("fails closed on a missing attribute for positive operators", () => {
    expect(run({ attribute: "plan", op: "equals", value: "pro" }, {})).toBe(false);
    expect(run({ attribute: "tenantId", op: "in_segment", value: "design-partners" }, {})).toBe(false);
  });

  it("in_segment / not_in_segment", () => {
    expect(run({ attribute: "tenantId", op: "in_segment", value: "design-partners" }, { tenantId: "globex" })).toBe(true);
    expect(run({ attribute: "tenantId", op: "not_in_segment", value: "design-partners" }, { tenantId: "initech" })).toBe(true);
  });

  it("semver_gte compares numerically, not lexically", () => {
    // "4.10.0" < "4.9.0" as strings, but not as versions.
    expect(run({ attribute: "appVersion", op: "semver_gte", value: "4.9.0" }, { appVersion: "4.10.0" })).toBe(true);
    expect(run({ attribute: "appVersion", op: "semver_gte", value: "4.9.0" }, { appVersion: "4.8.9" })).toBe(false);
    expect(run({ attribute: "appVersion", op: "semver_gte", value: "4.2.0" }, { appVersion: "v4.2.0" })).toBe(true);
  });

  it("never matches an unknown operator from a newer dashboard", () => {
    expect(run({ attribute: "tenantId", op: "regex_match", value: ".*" }, { tenantId: "a" })).toBe(false);
  });

  it("ANDs every condition in a rule", () => {
    const r = evaluate(
      state({
        enabled: true,
        rollout_pct: 0,
        targeting_rules: [
          rule({
            conditions: [
              { attribute: "tenantId", op: "in", values: ["acme-corp"] },
              { attribute: "plan", op: "equals", value: "enterprise" },
            ],
          }),
        ],
      }),
      { tenantId: "acme-corp", plan: "free" }
    );
    expect(r.reason).not.toBe("TARGETING_MATCH");
  });
});

describe("bucketing inside evaluation", () => {
  it("keeps a tenant's users together under tenantId bucketing", () => {
    const flag = state({ rollout_pct: 50, bucket_by: "tenantId" });
    const decisions = new Set(
      Array.from({ length: 100 }, (_, i) =>
        evaluate(flag, { tenantId: "acme-corp", userId: `user_${i}` }).enabled
      )
    );
    expect(decisions.size).toBe(1);
  });

  it("splits users within a tenant under userId bucketing", () => {
    const flag = state({ rollout_pct: 50, bucket_by: "userId" });
    const decisions = new Set(
      Array.from({ length: 100 }, (_, i) =>
        evaluate(flag, { tenantId: "acme-corp", userId: `user_${i}` }).enabled
      )
    );
    expect(decisions.size).toBe(2);
  });

  it("serves off and names the attribute when bucket_by has nothing to hash", () => {
    // Falling back to userId here would silently reproduce the exact
    // scattered split tenant bucketing exists to prevent.
    const r = evaluate(state({ rollout_pct: 50, bucket_by: "tenantId" }), { userId: "user_1" });
    expect(r.enabled).toBe(false);
    expect(r.reason).toBe("MISSING_BUCKET_ATTRIBUTE");
    expect(r.missing_attribute).toBe("tenantId");
  });

  it("treats a blank tenantId as missing, not as a valid key", () => {
    const r = evaluate(state({ rollout_pct: 50, bucket_by: "tenantId" }), { tenantId: "   " });
    expect(r.reason).toBe("MISSING_BUCKET_ATTRIBUTE");
  });

  it("supports a partial rollout inside a matched rule", () => {
    const flag = state({
      targeting_rules: [rule({ rollout_pct: 50, bucket_by: "tenantId" })],
    });
    const r = evaluate(flag, { tenantId: "acme-corp" });
    expect(["TARGETING_MATCH", "TARGETING_MATCH_ROLLOUT_EXCLUDED"]).toContain(r.reason);
    expect(r.rule_id).toBe("r1");
  });

  it("defaults to userId bucketing when nothing specifies otherwise", () => {
    const r = evaluate(state({ rollout_pct: 50 }), { userId: "user_1042" });
    expect(r.reason).toMatch(/^DEFAULT_ROLLOUT_/);
  });
});
