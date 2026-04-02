import { describe, expect, it } from "vitest";

import { getWorkflowPaths, resolveWorkflowName } from "./workflow.js";

describe("workflow helpers", () => {
  it("slugifies workflow names safely", () => {
    expect(resolveWorkflowName("Criar Dashboard de Onboarding")).toBe("criar-dashboard-de-onboarding");
  });

  it("builds workflow paths under state dir", () => {
    const paths = getWorkflowPaths("C:/repo/.software-factory", "onboarding", "run-1");

    expect(paths.workflowDir).toContain("workflows");
    expect(paths.prdPath).toContain("_prd.md");
    expect(paths.currentRunDir).toContain("run-1");
  });
});
