import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Map(
  process.argv.slice(2).map((item) => {
    const [key, ...rest] = item.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "true"];
  })
);

const workflowOrigin = String(readOption("origin", "WORKFLOW_ORIGIN", "http://127.0.0.1:5174")).replace(/\/$/, "");
const hazardId = String(readOption("hazard", "WORKFLOW_HAZARD_ID", "real-001"));
const customerName = String(readOption("customer", "WORKFLOW_CUSTOMER", "客户现有站点"));
const output = path.resolve(root, String(readOption("out", "WORKFLOW_ENTRY_OUT", "dist-integrations/existing-site-entry.generated.html")));

if (!/^https?:\/\//.test(workflowOrigin)) {
  throw new Error("--origin must be an http or https URL");
}

const snippetPath = path.join(root, "integrations", "existing-site-entry.html");
let snippet = await fs.readFile(snippetPath, "utf8");
snippet = snippet
  .replace(/data-workflow-origin="[^"]+"/, `data-workflow-origin="${escapeAttribute(workflowOrigin)}"`)
  .replace(/data-demo-hazard-id="[^"]+"/, `data-demo-hazard-id="${escapeAttribute(hazardId)}"`)
  .replace("消防隐患整改闭环</h2>", `${escapeHtml(customerName)}消防隐患整改闭环</h2>`);

const page = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(customerName)}工作流入口</title>
  <style>
    body {
      margin: 0;
      background: #f3f6f7;
      color: #17202a;
      font-family: "Microsoft YaHei", Arial, sans-serif;
    }

    .legacy-shell {
      max-width: 1080px;
      margin: 0 auto;
      padding: 24px 14px 40px;
    }

    .legacy-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      padding: 14px 0;
      border-bottom: 1px solid #d9e4e8;
    }

    .legacy-head strong {
      font-size: 18px;
    }

    .legacy-head span,
    .legacy-note {
      color: #60727a;
      font-size: 13px;
      line-height: 1.5;
    }

    .legacy-note {
      margin: 16px 0 0;
      padding: 10px 12px;
      border-left: 4px solid #14746f;
      background: #ffffff;
    }
  </style>
</head>
<body>
  <main class="legacy-shell">
    <header class="legacy-head">
      <strong>${escapeHtml(customerName)}门户</strong>
      <span>这里模拟客户已有官网、内部门户或公众号落地页。</span>
    </header>
    <p class="legacy-note">下方组件可直接嵌入现有流量站点，不需要改造客户原有业务页面。</p>
    ${snippet}
  </main>
</body>
</html>
`;

await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, page, "utf8");

console.log(JSON.stringify({
  ok: true,
  output,
  workflowOrigin,
  hazardId,
  customerName
}, null, 2));

function escapeAttribute(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function readOption(name, envName, fallback) {
  return args.get(name) || process.env[envName] || process.env[`npm_config_${name}`] || fallback;
}
