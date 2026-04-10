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

const VIDEO_FILE_EXTENSIONS = new Set([".mp4", ".mov", ".mkv", ".webm", ".m4v", ".avi"]);
const SUBTITLE_FILE_EXTENSIONS = new Set([".vtt", ".srt", ".txt"]);
const MAX_TRANSCRIPT_PROMPT_CHARS = 12000;

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

export interface VideoSourcePaths {
  rootDir: string;
  downloadsDir: string;
  transcriptsDir: string;
}

export interface VideoShortsPaths {
  rootDir: string;
  manifestPath: string;
  planPath: string;
  renderScriptPath: string;
  outputDir: string;
}

export interface PreparedVideoSource {
  metadata: VideoSourceMetadata;
  source: {
    sourceType: "local-file" | "youtube-url";
    originalInput: string;
    resolvedInputPath: string;
    ytDlpAvailable: boolean;
    downloadMetadataPath: string | null;
    transcriptSourcePath: string | null;
    transcriptTextPath: string | null;
    transcriptText: string | null;
  };
}

export interface VideoShortCandidate {
  title: string;
  hook: string;
  start: string;
  end: string;
  durationSeconds: number;
  reason: string;
  sourceQuote: string;
  editingNotes: string;
  outputFileName: string;
}

export interface VideoShortsManifest {
  summary: string;
  goal: string;
  editor: VideoEditorTarget;
  source: PreparedVideoSource["source"] & {
    metadata: VideoSourceMetadata;
  };
  highlights: VideoShortCandidate[];
}

function commandAvailable(command: string) {
  const probe = spawnSync(command, ["--version"], { encoding: "utf8", shell: false });
  return probe.status === 0;
}

function isVideoFile(fileName: string) {
  return VIDEO_FILE_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

function isSubtitleFile(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();
  if (!SUBTITLE_FILE_EXTENSIONS.has(extension)) {
    return false;
  }

  return !fileName.endsWith(".part") && !fileName.endsWith(".json");
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeTranscriptContent(rawText: string, extension: string) {
  if (extension === ".vtt") {
    return normalizeVttTranscript(rawText);
  }

  if (extension === ".srt") {
    return normalizeSrtTranscript(rawText);
  }

  return rawText
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)
    .join("\n");
}

function normalizeVttTranscript(rawText: string) {
  return rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      if (line === "WEBVTT") return false;
      if (line.startsWith("NOTE")) return false;
      if (line.includes("-->") || /^\d+$/.test(line)) return false;
      return true;
    })
    .map((line) => normalizeWhitespace(line.replace(/<[^>]+>/g, " ")))
    .filter(Boolean)
    .join("\n");
}

function normalizeSrtTranscript(rawText: string) {
  return rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      if (/^\d+$/.test(line)) return false;
      if (line.includes("-->") || line.startsWith("NOTE")) return false;
      return true;
    })
    .map((line) => normalizeWhitespace(line.replace(/<[^>]+>/g, " ")))
    .filter(Boolean)
    .join("\n");
}

function truncateTranscriptForPrompt(transcriptText: string | null) {
  if (!transcriptText) {
    return null;
  }

  if (transcriptText.length <= MAX_TRANSCRIPT_PROMPT_CHARS) {
    return transcriptText;
  }

  return `${transcriptText.slice(0, MAX_TRANSCRIPT_PROMPT_CHARS).trim()}\n\n[transcript truncated]`;
}

function extractJsonText(input: string) {
  const fencedMatch = input.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const objectStart = input.indexOf("{");
  const objectEnd = input.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    return input.slice(objectStart, objectEnd + 1);
  }

  throw new Error("Nao foi possivel encontrar JSON valido na resposta do provider.");
}

function slugifyFileSegment(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return normalized || "clip";
}

async function listFilesWithStats(dirPath: string) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map(async (entry) => ({
        name: entry.name,
        absolutePath: path.join(dirPath, entry.name),
        stats: await fs.stat(path.join(dirPath, entry.name)),
      })),
  );

  return files;
}

async function findDownloadedVideoFile(downloadsDir: string) {
  const files = await listFilesWithStats(downloadsDir);

  const candidates = files
    .filter((file) => isVideoFile(file.name))
    .sort((left, right) => right.stats.mtimeMs - left.stats.mtimeMs);

  if (!candidates[0]) {
    throw new Error("O download do video foi concluido, mas nenhum arquivo de video foi encontrado.");
  }

  return candidates[0].absolutePath;
}

async function findDownloadedInfoJson(downloadsDir: string) {
  const files = await listFilesWithStats(downloadsDir);
  const candidate = files
    .filter((file) => file.name.endsWith(".info.json"))
    .sort((left, right) => right.stats.mtimeMs - left.stats.mtimeMs)[0];

  return candidate?.absolutePath || null;
}

function subtitlePriority(fileName: string) {
  const lowered = fileName.toLowerCase();
  if (lowered.includes("pt-br")) return 0;
  if (lowered.includes("pt")) return 1;
  if (lowered.includes("en")) return 2;
  return 3;
}

async function findDownloadedTranscript(downloadsDir: string) {
  const files = await listFilesWithStats(downloadsDir);

  const candidate = files
    .filter((file) => isSubtitleFile(file.name))
    .sort((left, right) => {
      const byLanguage = subtitlePriority(left.name) - subtitlePriority(right.name);
      if (byLanguage !== 0) return byLanguage;
      return right.stats.mtimeMs - left.stats.mtimeMs;
    })[0];

  return candidate?.absolutePath || null;
}

async function normalizeTranscriptFile(transcriptPath: string, transcriptDir: string) {
  const absolutePath = path.resolve(transcriptPath);
  const extension = path.extname(absolutePath).toLowerCase();
  const rawText = await fs.readFile(absolutePath, "utf8");
  const transcriptText = normalizeTranscriptContent(rawText, extension).trim();

  if (!transcriptText) {
    return {
      transcriptSourcePath: absolutePath,
      transcriptTextPath: null,
      transcriptText: null,
    };
  }

  const normalizedPath = path.join(transcriptDir, "captions.txt");
  await writeText(normalizedPath, `${transcriptText}\n`);

  return {
    transcriptSourcePath: absolutePath,
    transcriptTextPath: normalizedPath,
    transcriptText,
  };
}

async function downloadVideoFromYouTube(url: string, sourcePaths: VideoSourcePaths) {
  if (!commandAvailable("yt-dlp")) {
    throw new Error("yt-dlp nao encontrado no PATH. Instale o yt-dlp para baixar videos do YouTube.");
  }

  await ensureDir(sourcePaths.downloadsDir);

  const outputTemplate = path.join(sourcePaths.downloadsDir, "source.%(ext)s");
  const download = spawnSync(
    "yt-dlp",
    [
      "--no-playlist",
      "--no-warnings",
      "--write-info-json",
      "--write-subs",
      "--write-auto-subs",
      "--sub-langs",
      "pt.*,en.*",
      "--sub-format",
      "vtt",
      "--merge-output-format",
      "mp4",
      "-o",
      outputTemplate,
      url,
    ],
    { encoding: "utf8", shell: false },
  );

  if (download.status !== 0) {
    const errorText = (download.stderr || download.stdout || "Falha desconhecida do yt-dlp.").trim();
    throw new Error(`Falha ao baixar video do YouTube: ${errorText}`);
  }

  return {
    resolvedInputPath: await findDownloadedVideoFile(sourcePaths.downloadsDir),
    downloadMetadataPath: await findDownloadedInfoJson(sourcePaths.downloadsDir),
    transcriptSourcePath: await findDownloadedTranscript(sourcePaths.downloadsDir),
    ytDlpAvailable: true,
  };
}

export function isYouTubeUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return host === "youtu.be" || host.endsWith("youtube.com");
  } catch {
    return false;
  }
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

export function getVideoSourcePaths(workflowDir: string): VideoSourcePaths {
  const rootDir = path.join(workflowDir, "video", "source");
  return {
    rootDir,
    downloadsDir: path.join(rootDir, "downloads"),
    transcriptsDir: path.join(rootDir, "transcripts"),
  };
}

export function getVideoShortsPaths(workflowDir: string, editor: VideoEditorTarget): VideoShortsPaths {
  const rootDir = path.join(workflowDir, "video", "shorts", editor);
  return {
    rootDir,
    manifestPath: path.join(rootDir, "shorts-manifest.json"),
    planPath: path.join(rootDir, "shorts-plan.md"),
    renderScriptPath: path.join(rootDir, "render-shorts.ps1"),
    outputDir: path.join(rootDir, "rendered"),
  };
}

export async function ensureVideoWorkflowPaths(paths: VideoWorkflowPaths) {
  await ensureDir(paths.rootDir);
}

export async function ensureVideoShortsPaths(paths: VideoShortsPaths) {
  await ensureDir(paths.rootDir);
  await ensureDir(paths.outputDir);
}

export async function prepareVideoSource(options: {
  workflowDir: string;
  input: string;
  transcriptPath?: string;
}) : Promise<PreparedVideoSource> {
  const sourcePaths = getVideoSourcePaths(options.workflowDir);
  await ensureDir(sourcePaths.downloadsDir);
  await ensureDir(sourcePaths.transcriptsDir);

  const originalInput = options.input.trim();
  let sourceType: PreparedVideoSource["source"]["sourceType"] = "local-file";
  let resolvedInputPath = path.resolve(originalInput);
  let downloadMetadataPath: string | null = null;
  let transcriptSourcePath: string | null = null;
  let ytDlpAvailable = commandAvailable("yt-dlp");

  if (isYouTubeUrl(originalInput)) {
    sourceType = "youtube-url";
    const download = await downloadVideoFromYouTube(originalInput, sourcePaths);
    resolvedInputPath = download.resolvedInputPath;
    downloadMetadataPath = download.downloadMetadataPath;
    transcriptSourcePath = download.transcriptSourcePath;
    ytDlpAvailable = download.ytDlpAvailable;
  }

  if (options.transcriptPath?.trim()) {
    transcriptSourcePath = path.resolve(options.transcriptPath);
  }

  const transcript = transcriptSourcePath
    ? await normalizeTranscriptFile(transcriptSourcePath, sourcePaths.transcriptsDir)
    : {
        transcriptSourcePath: null,
        transcriptTextPath: null,
        transcriptText: null,
      };

  const metadata = await analyzeVideoSource(resolvedInputPath);

  return {
    metadata,
    source: {
      sourceType,
      originalInput,
      resolvedInputPath,
      ytDlpAvailable,
      downloadMetadataPath,
      transcriptSourcePath: transcript.transcriptSourcePath,
      transcriptTextPath: transcript.transcriptTextPath,
      transcriptText: transcript.transcriptText,
    },
  };
}

export function buildVideoPlanningPrompt(options: {
  goal: string;
  editor: VideoEditorTarget;
  metadata: VideoSourceMetadata;
  source?: PreparedVideoSource["source"];
}) {
  const transcriptExcerpt = truncateTranscriptForPrompt(options.source?.transcriptText || null);

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
    "Contexto da fonte:",
    JSON.stringify(
      {
        sourceType: options.source?.sourceType || "local-file",
        originalInput: options.source?.originalInput || options.metadata.inputPath,
        transcriptAvailable: Boolean(options.source?.transcriptText),
        transcriptTextPath: options.source?.transcriptTextPath || null,
      },
      null,
      2,
    ),
    transcriptExcerpt ? `Trecho do transcript:\n${transcriptExcerpt}` : "Transcript indisponivel.",
    "Objetivo:",
    options.goal,
  ].join("\n\n");
}

export function buildVideoShortsPlanningPrompt(options: {
  goal: string;
  editor: VideoEditorTarget;
  metadata: VideoSourceMetadata;
  source: PreparedVideoSource["source"];
  count: number;
  minDurationSeconds: number;
  maxDurationSeconds: number;
}) {
  const transcriptExcerpt = truncateTranscriptForPrompt(options.source.transcriptText);
  if (!transcriptExcerpt) {
    throw new Error("Nao foi encontrado transcript para identificar highlights. Use um video do YouTube com legendas ou informe --transcript-file.");
  }

  return [
    "Selecione os melhores highlights de um video longo e transforme-os em shorts independentes.",
    "Use apenas informacao presente no transcript e nos metadados. Nao invente falas, nao invente timestamps.",
    "Retorne JSON puro, sem markdown, com este formato exato:",
    JSON.stringify(
      {
        summary: "string",
        highlights: [
          {
            title: "string",
            hook: "string",
            start: "HH:MM:SS",
            end: "HH:MM:SS",
            durationSeconds: options.minDurationSeconds,
            reason: "string",
            sourceQuote: "string",
            editingNotes: "string",
          },
        ],
      },
      null,
      2,
    ),
    "Regras:",
    `- Gere no maximo ${options.count} highlights, sem repeticao de tese.`,
    `- Cada highlight deve ficar entre ${options.minDurationSeconds} e ${options.maxDurationSeconds} segundos.`,
    "- Prefira ganchos fortes, viradas, frases memoraveis, listas curtas, argumentos densos e momentos com valor autonomo.",
    "- O campo sourceQuote deve conter um trecho real do transcript associado ao corte.",
    "- O campo editingNotes deve orientar ritmo, legenda e CTA sem depender de um editor especifico.",
    `Editor alvo: ${options.editor}`,
    "Metadados do video:",
    JSON.stringify(options.metadata, null, 2),
    "Contexto da fonte:",
    JSON.stringify(
      {
        sourceType: options.source.sourceType,
        originalInput: options.source.originalInput,
        transcriptTextPath: options.source.transcriptTextPath,
      },
      null,
      2,
    ),
    "Objetivo:",
    options.goal,
    "Transcript:",
    transcriptExcerpt,
  ].join("\n\n");
}

export function extractMarkdownSection(content: string, heading: string) {
  const regex = new RegExp(`## ${heading.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\n([\\s\\S]*?)(?=\\n## |$)`, "m");
  const match = content.match(regex);
  return match?.[1]?.trim() || "";
}

export function parseTimestampToSeconds(value: string) {
  const parts = value.trim().split(":").map((part) => Number(part.replace(",", ".")));
  if (parts.some((part) => Number.isNaN(part))) {
    throw new Error(`Timestamp invalido: ${value}`);
  }

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  throw new Error(`Timestamp invalido: ${value}`);
}

export function formatSecondsAsTimestamp(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = Math.floor(safeSeconds % 60);
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

export function parseVideoShortsResponse(options: {
  responseText: string;
  goal: string;
  editor: VideoEditorTarget;
  source: PreparedVideoSource;
  count: number;
}) : VideoShortsManifest {
  const parsed = JSON.parse(extractJsonText(options.responseText)) as {
    summary?: unknown;
    highlights?: unknown;
  };

  const highlights = Array.isArray(parsed.highlights)
    ? parsed.highlights
        .map((entry, index) => {
          const candidate = entry as Record<string, unknown>;
          const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
          const hook = typeof candidate.hook === "string" ? candidate.hook.trim() : "";
          const start = typeof candidate.start === "string" ? candidate.start.trim() : "";
          const end = typeof candidate.end === "string" ? candidate.end.trim() : "";
          const reason = typeof candidate.reason === "string" ? candidate.reason.trim() : "";
          const sourceQuote = typeof candidate.sourceQuote === "string" ? candidate.sourceQuote.trim() : "";
          const editingNotes = typeof candidate.editingNotes === "string" ? candidate.editingNotes.trim() : "";

          if (!title || !hook || !start || !end || !reason) {
            return null;
          }

          const startSeconds = parseTimestampToSeconds(start);
          const endSeconds = parseTimestampToSeconds(end);
          if (endSeconds <= startSeconds) {
            return null;
          }

          const durationSeconds = endSeconds - startSeconds;
          return {
            title,
            hook,
            start: formatSecondsAsTimestamp(startSeconds),
            end: formatSecondsAsTimestamp(endSeconds),
            durationSeconds,
            reason,
            sourceQuote,
            editingNotes,
            outputFileName: `${String(index + 1).padStart(2, "0")}-${slugifyFileSegment(title)}.mp4`,
          } satisfies VideoShortCandidate;
        })
        .filter((entry): entry is VideoShortCandidate => Boolean(entry))
        .slice(0, options.count)
    : [];

  if (!highlights.length) {
    throw new Error("O provider nao retornou highlights validos para montar os shorts.");
  }

  return {
    summary: typeof parsed.summary === "string" && parsed.summary.trim()
      ? parsed.summary.trim()
      : `Shorts gerados a partir do objetivo: ${options.goal}`,
    goal: options.goal,
    editor: options.editor,
    source: {
      ...options.source.source,
      metadata: options.source.metadata,
    },
    highlights,
  };
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

export function buildVideoShortsMarkdown(manifest: VideoShortsManifest) {
  return [
    `# Shorts Plan (${manifest.editor})`,
    "",
    `- Goal: ${manifest.goal}`,
    `- Source: ${manifest.source.originalInput}`,
    `- Resolved input: ${manifest.source.resolvedInputPath}`,
    `- Transcript: ${manifest.source.transcriptTextPath || "indisponivel"}`,
    "",
    "## Summary",
    "",
    manifest.summary,
    "",
    "## Highlights",
    "",
    ...manifest.highlights.flatMap((highlight, index) => [
      `### ${index + 1}. ${highlight.title}`,
      "",
      `- Hook: ${highlight.hook}`,
      `- Range: ${highlight.start} -> ${highlight.end} (${highlight.durationSeconds}s)`,
      `- Why it works: ${highlight.reason}`,
      `- Source quote: ${highlight.sourceQuote || "n/a"}`,
      `- Editing notes: ${highlight.editingNotes || "n/a"}`,
      `- Output file: ${highlight.outputFileName}`,
      "",
    ]),
  ].join("\n");
}

export function buildVideoShortsRenderScript(manifest: VideoShortsManifest, paths: VideoShortsPaths) {
  return [
    `$input = \"${manifest.source.resolvedInputPath.replaceAll("\\", "\\\\")}\"`,
    `$outputDir = \"${paths.outputDir.replaceAll("\\", "\\\\")}\"`,
    "New-Item -ItemType Directory -Force -Path $outputDir | Out-Null",
    "",
    ...manifest.highlights.flatMap((highlight) => [
      `# ${highlight.title}`,
      `ffmpeg -y -ss ${highlight.start} -to ${highlight.end} -i $input -c:v libx264 -c:a aac -movflags +faststart \"${path.join(paths.outputDir, highlight.outputFileName).replaceAll("\\", "\\\\")}\"`,
      "",
    ]),
  ].join("\n");
}

export async function writeVideoShortsArtifacts(options: {
  paths: VideoShortsPaths;
  manifest: VideoShortsManifest;
}) {
  await ensureVideoShortsPaths(options.paths);
  await writeText(options.paths.manifestPath, `${JSON.stringify(options.manifest, null, 2)}\n`);
  await writeText(options.paths.planPath, `${buildVideoShortsMarkdown(options.manifest)}\n`);
  await writeText(options.paths.renderScriptPath, `${buildVideoShortsRenderScript(options.manifest, options.paths)}\n`);
}

export async function materializeVideoShorts(manifest: VideoShortsManifest, outputDir: string) {
  if (!commandAvailable("ffmpeg")) {
    throw new Error("ffmpeg nao encontrado no PATH. Instale o ffmpeg para renderizar os shorts automaticamente.");
  }

  await ensureDir(outputDir);

  const renderedFiles: string[] = [];
  for (const highlight of manifest.highlights) {
    const outputPath = path.join(outputDir, highlight.outputFileName);
    const render = spawnSync(
      "ffmpeg",
      [
        "-y",
        "-ss",
        highlight.start,
        "-to",
        highlight.end,
        "-i",
        manifest.source.resolvedInputPath,
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        outputPath,
      ],
      { encoding: "utf8", shell: false },
    );

    if (render.status !== 0) {
      const errorText = (render.stderr || render.stdout || "Falha desconhecida do ffmpeg.").trim();
      throw new Error(`Falha ao renderizar short '${highlight.title}': ${errorText}`);
    }

    renderedFiles.push(outputPath);
  }

  return renderedFiles;
}

export function makeVideoRunId() {
  return timestampForRun();
}
