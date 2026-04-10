import { describe, expect, it } from "vitest";

import { getYouTubePaths, normalizeYouTubePrivacyStatus, parseYouTubeTags } from "./youtube-utils.js";

describe("youtube-utils", () => {
  it("creates deterministic youtube storage paths", () => {
    const paths = getYouTubePaths("C:/repo");

    expect(paths.clientPath).toContain("oauth-client.json");
    expect(paths.tokenPath).toContain("oauth-tokens.json");
  });

  it("normalizes privacy values", () => {
    expect(normalizeYouTubePrivacyStatus(undefined)).toBe("private");
    expect(normalizeYouTubePrivacyStatus("Unlisted")).toBe("unlisted");
  });

  it("parses comma separated tags", () => {
    expect(parseYouTubeTags("shorts, youtube, clips")).toEqual(["shorts", "youtube", "clips"]);
    expect(parseYouTubeTags("")).toEqual([]);
  });
});
