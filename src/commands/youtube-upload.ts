import path from "node:path";

import { loadEnvironment } from "../config.js";
import { normalizeYouTubePrivacyStatus, parseYouTubeTags, uploadVideoToYouTube } from "../youtube-utils.js";

export async function runYouTubeUploadCommand(options: {
  workspaceDir: string;
  filePath: string;
  title: string;
  description?: string;
  tags?: string;
  privacyStatus?: string;
  playlistId?: string;
  thumbnailPath?: string;
  publishAt?: string;
  categoryId?: string;
  madeForKids: boolean;
  notifySubscribers: boolean;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
}) {
  await loadEnvironment(options.workspaceDir);

  const resolvedFilePath = path.isAbsolute(options.filePath)
    ? options.filePath
    : path.join(options.workspaceDir, options.filePath);
  const resolvedThumbnailPath = options.thumbnailPath
    ? (path.isAbsolute(options.thumbnailPath)
        ? options.thumbnailPath
        : path.join(options.workspaceDir, options.thumbnailPath))
    : undefined;

  return await uploadVideoToYouTube({
    workspaceDir: path.resolve(options.workspaceDir),
    filePath: resolvedFilePath,
    title: options.title,
    description: options.description,
    tags: parseYouTubeTags(options.tags),
    privacyStatus: normalizeYouTubePrivacyStatus(options.privacyStatus),
    playlistId: options.playlistId,
    thumbnailPath: resolvedThumbnailPath,
    publishAt: options.publishAt,
    categoryId: options.categoryId,
    madeForKids: options.madeForKids,
    notifySubscribers: options.notifySubscribers,
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    refreshToken: options.refreshToken,
  });
}
