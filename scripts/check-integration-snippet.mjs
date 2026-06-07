import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const snippetPath = path.join(root, "integrations", "existing-site-entry.html");
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
  "navigator.clipboard"
];

const missing = required.filter((item) => !html.includes(item));
if (missing.length > 0) {
  console.error(JSON.stringify({ ok: false, missing }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  file: snippetPath,
  checks: required.length
}, null, 2));
