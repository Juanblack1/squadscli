import path from "node:path";

import {
  buildUniversalImportGuide,
  ensureVideoWorkflowPaths,
  getVideoWorkflowPaths,
  isYouTubeUrl,
  prepareVideoSource,
  type VideoEditorTarget,
} from "../video-utils.js";
import { writeText } from "../fs-utils.js";

export async function runVideoPackageCommand(options: {
  workspaceDir: string;
  workflowName: string;
  inputPath: string;
  editor: VideoEditorTarget;
}) {
  const absoluteInput = isYouTubeUrl(options.inputPath)
    ? options.inputPath
    : path.isAbsolute(options.inputPath)
    ? options.inputPath
    : path.join(options.workspaceDir, options.inputPath);
  const workflowDir = path.join(options.workspaceDir, ".software-factory", "workflows", options.workflowName);
  const preparedSource = await prepareVideoSource({
    workflowDir,
    input: absoluteInput,
  });
  const metadata = preparedSource.metadata;
  const videoPaths = getVideoWorkflowPaths(workflowDir, options.editor);

  await ensureVideoWorkflowPaths(videoPaths);

  const guide = buildUniversalImportGuide({ editor: options.editor, metadata });
  await writeText(videoPaths.importGuidePath, `${guide}\n`);
  await writeText(videoPaths.metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

  return {
    workflowName: options.workflowName,
    editor: options.editor,
    source: preparedSource.source,
    metadataPath: videoPaths.metadataPath,
    importGuidePath: videoPaths.importGuidePath,
  };
}
