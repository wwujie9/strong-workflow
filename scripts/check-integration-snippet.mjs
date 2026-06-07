import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targetArg = process.argv.find((item) => item.startsWith("--file="));
const targetFile = targetArg?.slice("--file=".length) || process.env.INTEGRATION_SNIPPET_FILE || process.env.npm_config_file;
const snippetPath = targetFile ? path.resolve(root, targetFile) : path.join(root, "integrations", "existing-site-entry.html");
const html = await fs.readFile(snippetPath, "utf8");

const required = [
  'class="sw-entry"',
  "data-workflow-origin",
  "data-demo-hazard-id",
  'data-role="workspace"',
  'data-role="rectify"',
  'data-role="review"',
  'data-role="copy"',
  "#rectify/",
  "#review/",
  "navigator.clipboard",
  "进入工作台",
  "示例整改链接",
  "示例复核链接"
];

const missing = required.filter((item) => !html.includes(item));
if (missing.length > 0) {
  console.error(JSON.stringify({ ok: false, missing }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  file: snippetPath,
  checks: required.length,
  workflowOrigin: readAttribute(html, "data-workflow-origin"),
  hazardId: readAttribute(html, "data-demo-hazard-id")
}, null, 2));

function readAttribute(htmlText, name) {
  const match = htmlText.match(new RegExp(`${name}="([^"]+)"`));
  return match?.[1] || "";
}
