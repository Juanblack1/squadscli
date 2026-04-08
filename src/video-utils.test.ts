import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { analyzeVideoSource, buildUniversalImportGuide, getVideoWorkflowPaths } from "./video-utils.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("video-utils", () => {
  it("analyzes source metadata even when ffprobe is unavailable", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sf-video-"));
    tempDirs.push(root);
    const input = path.join(root, "clip.mp4");
    await fs.writeFile(input, "fake-video", "utf8");

    const metadata = await analyzeVideoSource(input);

    expect(metadata.fileName).toBe("clip.mp4");
    expect(metadata.extension).toBe(".mp4");
    expect(metadata.sizeBytes).toBeGreaterThan(0);
  });

  it("builds editor-specific import guidance", () => {
    const guide = buildUniversalImportGuide({
      editor: "premiere",
      metadata: {
        inputPath: "C:/video.mp4",
        fileName: "video.mp4",
        extension: ".mp4",
        sizeBytes: 100,
        modifiedAt: new Date().toISOString(),
        ffprobeAvailable: false,
        durationSeconds: null,
        width: 1920,
        height: 1080,
        videoCodec: "h264",
        audioCodec: "aac",
        frameRate: null,
      },
    });

    expect(guide).toContain("(premiere)");
    expect(guide).toContain("sequence");
  });

  it("creates deterministic video workflow paths", () => {
    const paths = getVideoWorkflowPaths("C:/repo/.software-factory/workflows/wf", "generic");

    expect(paths.planPath).toContain("edit-plan.md");
    expect(paths.importGuidePath).toContain("import-guide.md");
  });
});
