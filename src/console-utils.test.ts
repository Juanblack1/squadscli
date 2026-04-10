import { describe, expect, it } from "vitest";

import { extractSquadSkills, parseSkillSelection } from "./console-utils.js";

describe("console-utils", () => {
  it("extracts squad skills from squad yaml", () => {
    const result = extractSquadSkills(`name: test\n\nskills:\n  - alpha\n  - beta\n\ndata:\n  - file.md\n`);

    expect(result).toEqual(["alpha", "beta"]);
  });

  it("parses focused skills as unique csv values", () => {
    expect(parseSkillSelection("api-design, code-review, api-design\nptbr-ux-writing")).toEqual([
      "api-design",
      "code-review",
      "ptbr-ux-writing",
    ]);
  });
});
