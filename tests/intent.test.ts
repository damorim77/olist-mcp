import { describe, expect, it } from "vitest";
import {
  INTENT_SYSTEM,
  IntentVerdict,
  OUT_OF_SCOPE_REPLY,
} from "@/lib/chat/intent";

describe("verificador de intenção (gate do chat)", () => {
  it("schema do veredito aceita in_scope booleano", () => {
    expect(IntentVerdict.parse({ in_scope: true })).toEqual({
      in_scope: true,
    });
    expect(IntentVerdict.parse({ in_scope: false })).toEqual({
      in_scope: false,
    });
    expect(() => IntentVerdict.parse({ in_scope: "SIM" })).toThrow();
  });

  it("recusa orienta de volta ao escopo", () => {
    expect(OUT_OF_SCOPE_REPLY).toContain("Olist");
    expect(OUT_OF_SCOPE_REPLY).toContain("2016");
    expect(OUT_OF_SCOPE_REPLY).toContain("Funil de pedidos de 2017?");
  });

  it("prompt do gate cobre o escopo (dados + leniência)", () => {
    for (const kw of ["Olist", "pagamentos", "dúvida", "in_scope"]) {
      expect(INTENT_SYSTEM).toContain(kw);
    }
  });
});
