import { describe, expect, it } from "vitest";
import { serializeValue, toEnvelope } from "@/lib/db/serialize";

describe("serialize (DuckDB → JSON)", () => {
  it("BIGINT seguro → number; grande → string; JSON.stringify não lança", () => {
    expect(serializeValue(42n)).toBe(42);
    expect(serializeValue(2n ** 62n)).toBe((2n ** 62n).toString());
    expect(() =>
      JSON.stringify({ v: serializeValue(2n ** 62n) }),
    ).not.toThrow();
  });

  it("NaN/Infinity → null; null/undefined → null", () => {
    expect(serializeValue(NaN)).toBe(null);
    expect(serializeValue(Infinity)).toBe(null);
    expect(serializeValue(null)).toBe(null);
    expect(serializeValue(undefined)).toBe(null);
  });

  it("TIMESTAMP naive → ISO sem Z", () => {
    const s = serializeValue(new Date(2018, 0, 15, 10, 30, 0));
    expect(s).toBe("2018-01-15T10:30:00");
    expect(String(s).endsWith("Z")).toBe(false);
  });

  it("envelope: 101 linhas → 100 + truncated", () => {
    const raw = Array.from({ length: 101 }, (_, i) => [BigInt(i), `c${i}`]);
    const env = toEnvelope(["n", "c"], raw);
    expect(env.rows).toHaveLength(100);
    expect(env.row_count).toBe(100);
    expect(env.truncated).toBe(true);
    expect(env.rows[0]).toEqual({ n: 0, c: "c0" });
  });

  it("envelope: 3 linhas → truncated=false", () => {
    const env = toEnvelope(["a"], [[1], [2], [3]]);
    expect(env.truncated).toBe(false);
    expect(env.row_count).toBe(3);
  });
});
