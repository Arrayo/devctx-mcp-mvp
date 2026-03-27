const configuredProjectRoot =
  process.env.DEVCTX_PROJECT_ROOT?.trim() ||
  process.env.MCP_PROJECT_ROOT?.trim();

if (configuredProjectRoot) {
  process.chdir(configuredProjectRoot);
}

import { runDevctxServer } from './server.js';

await runDevctxServer();
