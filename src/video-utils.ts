import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { ensureDir, timestampForRun, writeText } from "./fs-utils.js";

export const SUPPORTED_VIDEO_EDITORS = [
  "generic",
  "capcut",
  "premiere",
  "davinci",
  "shotcut",
  "kdenlive",
  "final-cut",
] as const;

export type VideoEditorTarget = (typeof SUPPORTED_VIDEO_EDITORS)[number];

export interface VideoSourceMetadata {
  inputPath: string;
  fileName: string;
  extension: string;
  sizeBytes: number;
  modifiedAt: string;
  ffprobeAvailable: boolean;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  frameRate: string | null;
}

export interface VideoWorkflowPaths {
  rootDir: string;
  metadataPath: string;
  planPath: string;
  importGuidePath: string;
  ffmpegTemplatePath: string;
  assetChecklistPath: string;
}

export async function analyzeVideoSource(inputPath: string): Promise<VideoSourceMetadata> {
  const absolutePath = path.resolve(inputPath);
  const stats = await fs.stat(absolutePath);
  const fileName = path.basename(absolutePath);
  const extension = path.extname(fileName).toLowerCase();
  const base: VideoSourceMetadata = {
    inputPath: absolutePath,
    fileName,
    extension,
    sizeBytes: stats.size,
    modifiedAt: stats.mtime.toISOString(),
    ffprobeAvailable: false,
    durationSeconds: null,
    width: null,
    height: null,
    videoCodec: null,
    audioCodec: null,
    frameRate: null,
  };

  const probe = spawnSync(
    "ffprobe",
    [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_streams",
      "-show_format",
      absolutePath,
    ],
    { encoding: "utf8" },
  );

  if (probe.status !== 0 || !probe.stdout.trim()) {
    return base;
  }

  try {
    const parsed = JSON.parse(probe.stdout);
    const videoStream = (parsed.streams || []).find((stream: { codec_type?: string }) => stream.codec_type === "video");
    const audioStream = (parsed.streams || []).find((stream: { codec_type?: string }) => stream.codec_type === "audio");

    return {
      ...base,
      ffprobeAvailable: true,
      durationSeconds: parsed.format?.duration ? Number(parsed.format.duration) : null,
      width: videoStream?.width || null,
      height: videoStream?.height || null,
      videoCodec: videoStream?.codec_name || null,
      audioCodec: audioStream?.codec_name || null,
      frameRate: videoStream?.r_frame_rate || null,
    };
  } catch {
    return base;
  }
}

export function getVideoWorkflowPaths(workflowDir: string, editor: VideoEditorTarget): VideoWorkflowPaths {
  const rootDir = path.join(workflowDir, "video", editor);
  return {
    rootDir,
    metadataPath: path.join(rootDir, "source-metadata.json"),
    planPath: path.join(rootDir, "edit-plan.md"),
    importGuidePath: path.join(rootDir, "import-guide.md"),
    ffmpegTemplatePath: path.join(rootDir, "ffmpeg-template.ps1"),
    assetChecklistPath: path.join(rootDir, "asset-checklist.md"),
  };
}

export async function ensureVideoWorkflowPaths(paths: VideoWorkflowPaths) {
  await ensureDir(paths.rootDir);
}

export function buildVideoPlanningPrompt(options: {
  goal: string;
  editor: VideoEditorTarget;
  metadata: VideoSourceMetadata;
}) {
  return [
    "Planeje a edicao de video de forma universal, pensando em qualquer editor nao linear e em uma trilha base com ffmpeg.",
    "Seja especifico, economico em tokens e produza um plano executavel.",
    `Editor alvo: ${options.editor}`,
    "Respeite este formato exatamente:",
    "## Objective",
    "## Source Analysis",
    "## Edit Strategy",
    "## Cut Plan",
    "## Audio Plan",
    "## Subtitle Plan",
    "## Export Profiles",
    "## Editor Import Guide",
    "## FFmpeg Baseline Commands",
    "## Asset Checklist",
    "Dados do arquivo:",
    JSON.stringify(options.metadata, null, 2),
    "Objetivo:",
    options.goal,
  ].join("\n\n");
}

export function extractMarkdownSection(content: string, heading: string) {
  const regex = new RegExp(`## ${heading.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\n([\\s\\S]*?)(?=\\n## |$)`, "m");
  const match = content.match(regex);
  return match?.[1]?.trim() || "";
}

export async function writeVideoArtifacts(options: {
  paths: VideoWorkflowPaths;
  editor: VideoEditorTarget;
  metadata: VideoSourceMetadata;
  planText: string;
  workflowName: string;
}) {
  await ensureVideoWorkflowPaths(options.paths);

  await writeText(options.paths.metadataPath, `${JSON.stringify(options.metadata, null, 2)}\n`);
  await writeText(options.paths.planPath, `${options.planText.trim()}\n`);
  await writeText(
    options.paths.importGuidePath,
    [
      `# Import Guide (${options.editor})`,
      "",
      extractMarkdownSection(options.planText, "Editor Import Guide") || "Sem guia especifico. Use a timeline principal e siga o Cut Plan.",
    ].join("\n"),
  );
  await writeText(
    options.paths.assetChecklistPath,
    [
      "# Asset Checklist",
      "",
      extractMarkdownSection(options.planText, "Asset Checklist") || "- Video fonte\n- Audio\n- Legendas\n- Imagens de apoio",
    ].join("\n"),
  );
  await writeText(
    options.paths.ffmpegTemplatePath,
    buildFfmpegTemplate(options.workflowName, options.metadata, options.planText),
  );
}

function buildFfmpegTemplate(workflowName: string, metadata: VideoSourceMetadata, planText: string) {
  const exportProfiles = extractMarkdownSection(planText, "Export Profiles") || "1080x1920 vertical\n1920x1080 horizontal";

  return [
    "$input = \"./INPUT_VIDEO.mp4\"",
    `$workflow = \"${workflowName}\"`,
    "$outputDir = \"./video-output\"",
    "New-Item -ItemType Directory -Force -Path $outputDir | Out-Null",
    "",
    "# Base command for editing pipeline materialization.",
    `# Source metadata: ${metadata.width || "?"}x${metadata.height || "?"} | codec ${metadata.videoCodec || "unknown"} | duration ${metadata.durationSeconds || "unknown"}`,
    "# Replace filters, trims and subtitle inputs according to the generated plan.",
    "",
    "ffmpeg -y -i $input `",
    "  -c:v libx264 `",
    "  -c:a aac `",
    "  -preset medium `",
    "  -crf 20 `",
    "  \"$outputDir/$workflow-master.mp4\"",
    "",
    "# Suggested export profiles",
    ...exportProfiles.split("\n").map((line) => `# ${line}`),
  ].join("\n");
}

export function buildUniversalImportGuide(options: { editor: VideoEditorTarget; metadata: VideoSourceMetadata }) {
  const editorNotes: Record<VideoEditorTarget, string> = {
    generic: "Importe o video fonte, siga o Cut Plan, aplique Audio Plan e Subtitle Plan, depois exporte conforme Export Profiles.",
    capcut: "Importe o video e assets, monte a timeline principal, aplique subtitulos e transicoes leves, depois exporte conforme Export Profiles.",
    premiere: "Crie uma sequence alinhada ao aspect ratio alvo, importe os assets, execute os cortes do Cut Plan, depois normalize audio e exporte.",
    davinci: "Use Media Pool para importar tudo, monte a timeline no Edit page, finalize audio no Fairlight se necessario e exporte na Deliver page.",
    shotcut: "Importe os assets, monte faixas separadas para video, audio e legendas, siga o Cut Plan e exporte via preset manual.",
    kdenlive: "Crie um projeto com perfil correspondente ao export final, importe tudo no project bin e siga o Cut Plan por trilhas separadas.",
    "final-cut": "Crie uma library para o job, importe os assets, siga o Cut Plan na timeline principal e exporte por Share preset.",
  };

  return [
    `# Universal Import Guide (${options.editor})`,
    "",
    `- Arquivo fonte: ${options.metadata.fileName}`,
    `- Dimensoes conhecidas: ${options.metadata.width || "desconhecido"}x${options.metadata.height || "desconhecido"}`,
    `- Codec de video: ${options.metadata.videoCodec || "desconhecido"}`,
    `- Codec de audio: ${options.metadata.audioCodec || "desconhecido"}`,
    "",
    editorNotes[options.editor],
    "",
    "## Ordem sugerida",
    "",
    "1. Importar video fonte e assets auxiliares.",
    "2. Criar timeline principal no aspect ratio final.",
    "3. Aplicar cortes e marcacoes conforme o plano.",
    "4. Ajustar audio, legenda e motion apenas depois dos cortes base.",
    "5. Exportar uma master e as variacoes derivadas.",
  ].join("\n");
}

export function makeVideoRunId() {
  return timestampForRun();
}
