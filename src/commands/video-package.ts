import path from "node:path";

import { buildUniversalImportGuide, ensureVideoWorkflowPaths, getVideoWorkflowPaths, type VideoEditorTarget } from "../video-utils.js";
import { analyzeVideoSource } from "../video-utils.js";
import { writeText } from "../fs-utils.js";

export async function runVideoPackageCommand(options: {
  workspaceDir: string;
  workflowName: string;
  inputPath: string;
  editor: VideoEditorTarget;
}) {
  const absoluteInput = path.isAbsolute(options.inputPath)
    ? options.inputPath
    : path.join(options.workspaceDir, options.inputPath);
  const metadata = await analyzeVideoSource(absoluteInput);
  const workflowDir = path.join(options.workspaceDir, ".software-factory", "workflows", options.workflowName);
  const videoPaths = getVideoWorkflowPaths(workflowDir, options.editor);

  await ensureVideoWorkflowPaths(videoPaths);

  const guide = buildUniversalImportGuide({ editor: options.editor, metadata });
  await writeText(videoPaths.importGuidePath, `${guide}\n`);
  await writeText(videoPaths.metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

  return {
    workflowName: options.workflowName,
    editor: options.editor,
    metadataPath: videoPaths.metadataPath,
    importGuidePath: videoPaths.importGuidePath,
  };
}
