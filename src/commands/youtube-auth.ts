import path from "node:path";

import { loadEnvironment } from "../config.js";
import { runYouTubeAuthFlow } from "../youtube-utils.js";

export async function runYouTubeAuthCommand(options: {
  workspaceDir: string;
  clientId?: string;
  clientSecret?: string;
  port?: number;
  openBrowser: boolean;
}) {
  await loadEnvironment(options.workspaceDir);

  return await runYouTubeAuthFlow({
    workspaceDir: path.resolve(options.workspaceDir),
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    port: options.port,
    openBrowser: options.openBrowser,
  });
}
