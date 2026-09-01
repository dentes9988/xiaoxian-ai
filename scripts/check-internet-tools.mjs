import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const mcporterCli = join(rootDir, "node_modules", "mcporter", "dist", "cli.js");
const configPath = process.env.AGENT_REACH_CONFIG ?? join(homedir(), ".agent-reach", "mcporter.json");
const result = spawnSync(
  process.execPath,
  [
    mcporterCli,
    "--config",
    configPath,
    "call",
    "exa.web_search_exa",
    "--args",
    JSON.stringify({ query: "Example Domain official website", numResults: 1 }),
    "--output",
    "text",
    "--timeout",
    "20000"
  ],
  {
    encoding: "utf8",
    timeout: 25_000,
    maxBuffer: 1_000_000
  }
);

if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(`Exa search check failed with exit code ${result.status}`);
}
if (!/^URL:\s+https?:\/\//m.test(result.stdout)) {
  throw new Error("Exa search check returned no public URL");
}

console.log("Internet tool check passed: Exa returned a public source URL.");

