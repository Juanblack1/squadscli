import { describe, expect, it } from "vitest";

import { resolveModelForProvider } from "./model-utils.js";

describe("model-utils", () => {
  it("prefers explicit model over env defaults", () => {
    process.env.OPENAI_MODEL = "env-model";
    expect(resolveModelForProvider("openai", "explicit-model")).toBe("explicit-model");
  });

  it("falls back to provider-specific env model", () => {
    process.env.CODEX_MODEL = "gpt-5.4";
    expect(resolveModelForProvider("codex")).toBe("gpt-5.4");
  });
});
