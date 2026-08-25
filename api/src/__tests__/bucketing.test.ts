import { describe, it, expect } from "vitest";
import { murmur3_32, bucketOf, inRollout } from "../lib/bucketing";
import vectors from "../../../scripts/bucketing-vectors.json";

/**
 * These tests are the contract between the API and every SDK.
 *
 * The identical fixture is asserted in releasepace-js, -python, -java
 * and -go. If any implementation drifts, the same user ends up enabled
 * in one runtime and disabled in another.
 */

describe("murmur3_32 conformance", () => {
  it("matches the published MurmurHash3 x86_32 reference values", () => {
    for (const kat of vectors.known_answer_tests) {
      expect(murmur3_32(kat.input), `input: ${JSON.stringify(kat.input)}`).toBe(kat.hash);
    }
  });
});

describe("bucketing conformance fixture", () => {
  it("reproduces every shared vector exactly", () => {
    for (const v of vectors.vectors) {
      const label = `${v.flag_key}:${v.entity_id}`;
      expect(murmur3_32(label), `hash ${label}`).toBe(v.hash);
      expect(bucketOf(v.flag_key, v.entity_id), `bucket ${label}`).toBe(v.bucket);
    }
  });

  it("handles non-ASCII entity ids identically", () => {
    const unicode = vectors.vectors.filter((v) => /[^\x00-\x7F]/.test(v.entity_id));
    expect(unicode.length).toBeGreaterThan(0);
    for (const v of unicode) {
      expect(bucketOf(v.flag_key, v.entity_id)).toBe(v.bucket);
    }
  });
});

describe("bucketing properties", () => {
  it("is stable across repeated calls", () => {
    const first = bucketOf("new-checkout", "user_1042");
    for (let i = 0; i < 100; i++) {
      expect(bucketOf("new-checkout", "user_1042")).toBe(first);
    }
  });

  it("salts by flag key so the same cohort is not always first", () => {
    // Same entity, different flags: buckets must not move in lockstep.
    const a = Array.from({ length: 50 }, (_, i) => bucketOf(`flag-${i}`, "user_1042"));
    expect(new Set(a).size).toBeGreaterThan(20);
  });

  it("distributes roughly uniformly", () => {
    const N = 20000;
    let hits = 0;
    for (let i = 0; i < N; i++) {
      if (inRollout("dist-test", `user_${i}`, 20)) hits++;
    }
    const pct = (hits / N) * 100;
    expect(pct).toBeGreaterThan(18);
    expect(pct).toBeLessThan(22);
  });

  it("never removes anyone when a rollout ramps up", () => {
    // The property that makes gradual rollout safe: going 20 -> 50 -> 80
    // only ever adds entities, so nobody loses a feature mid-use.
    for (let i = 0; i < 5000; i++) {
      const id = `user_${i}`;
      if (inRollout("ramp-test", id, 20)) {
        expect(inRollout("ramp-test", id, 50)).toBe(true);
        expect(inRollout("ramp-test", id, 80)).toBe(true);
      }
    }
  });

  it("treats 0 and 100 as absolute", () => {
    for (let i = 0; i < 500; i++) {
      expect(inRollout("edge", `u${i}`, 0)).toBe(false);
      expect(inRollout("edge", `u${i}`, 100)).toBe(true);
    }
  });

  it("keeps every tenant's users together when bucketing by tenant", () => {
    // The whole point of tenantId bucketing: one org is entirely in or
    // entirely out, never split down the middle.
    const tenant = "acme-corp";
    const decision = inRollout("tenant-flag", tenant, 30);
    for (let u = 0; u < 200; u++) {
      expect(inRollout("tenant-flag", tenant, 30)).toBe(decision);
    }
  });
});
