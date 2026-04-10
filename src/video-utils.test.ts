import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  analyzeVideoSource,
  buildUniversalImportGuide,
  formatSecondsAsTimestamp,
  getVideoShortsPaths,
  getVideoWorkflowPaths,
  isYouTubeUrl,
  parseTimestampToSeconds,
  parseVideoShortsResponse,
} from "./video-utils.js";

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

  it("detects youtube urls", () => {
    expect(isYouTubeUrl("https://www.youtube.com/watch?v=abc123")).toBe(true);
    expect(isYouTubeUrl("https://youtu.be/abc123")).toBe(true);
    expect(isYouTubeUrl("C:/videos/local.mp4")).toBe(false);
  });

  it("parses timestamps for highlight ranges", () => {
    expect(parseTimestampToSeconds("01:02:03")).toBe(3723);
    expect(formatSecondsAsTimestamp(3723)).toBe("01:02:03");
  });

  it("normalizes shorts manifest from provider json", () => {
    const manifest = parseVideoShortsResponse({
      responseText: JSON.stringify({
        summary: "Melhores cortes do episodio.",
        highlights: [
          {
            title: "Gancho inicial",
            hook: "A pergunta que prende atencao.",
            start: "00:00:10",
            end: "00:00:35",
            reason: "Abre com tensao e entrega contexto rapido.",
            sourceQuote: "Como eu faria isso hoje?",
            editingNotes: "Comece seco e entre legenda grande no primeiro segundo.",
          },
        ],
      }),
      goal: "Criar shorts com ganchos fortes",
      editor: "generic",
      source: {
        metadata: {
          inputPath: "C:/video.mp4",
          fileName: "video.mp4",
          extension: ".mp4",
          sizeBytes: 100,
          modifiedAt: new Date().toISOString(),
          ffprobeAvailable: false,
          durationSeconds: 120,
          width: 1920,
          height: 1080,
          videoCodec: "h264",
          audioCodec: "aac",
          frameRate: null,
        },
        source: {
          sourceType: "youtube-url",
          originalInput: "https://youtu.be/abc123",
          resolvedInputPath: "C:/video.mp4",
          ytDlpAvailable: true,
          downloadMetadataPath: null,
          transcriptSourcePath: "C:/captions.vtt",
          transcriptTextPath: "C:/captions.txt",
          transcriptText: "Como eu faria isso hoje?",
        },
      },
      count: 3,
    });

    expect(manifest.highlights).toHaveLength(1);
    expect(manifest.highlights[0]?.durationSeconds).toBe(25);
    expect(manifest.highlights[0]?.outputFileName).toBe("01-gancho-inicial.mp4");
  });

  it("creates deterministic shorts workflow paths", () => {
    const paths = getVideoShortsPaths("C:/repo/.software-factory/workflows/wf", "premiere");

    expect(paths.manifestPath).toContain("shorts-manifest.json");
    expect(paths.renderScriptPath).toContain("render-shorts.ps1");
  });
});
