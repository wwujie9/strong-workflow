import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = (process.env.E2E_BASE_URL || "http://127.0.0.1:5174").replace(/\/$/, "");
const apiBase = `${baseUrl}/api`;
const restoreData = process.env.E2E_RESTORE !== "false";

const checks = [];

function record(name, details = "") {
  checks.push({ name, details });
  console.log(`[ok] ${name}${details ? ` - ${details}` : ""}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(pathname, options = {}) {
  const response = await fetch(`${apiBase}${pathname}`, {
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${pathname} failed: ${response.status} ${text}`);
  }
  return body;
}

async function requestRaw(pathname, options = {}) {
  const response = await fetch(`${apiBase}${pathname}`, {
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  return { response, text, body: text ? JSON.parse(text) : null };
}

function jsonBody(value) {
  return { body: JSON.stringify(value) };
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

async function restore(originalHazards, originalConfig) {
  if (!restoreData) return;
  await request("/hazards", { method: "PUT", ...jsonBody(originalHazards) });
  await request("/project-config", { method: "PUT", ...jsonBody(originalConfig) });
  record("恢复原始隐患和项目配置", `${originalHazards.length} 条隐患`);
}

async function main() {
  console.log(`[e2e] baseUrl=${baseUrl}`);
  const originalHazards = await request("/hazards");
  const originalConfig = await request("/project-config");

  try {
    const health = await request("/health");
    assert(health.ok, "health ok must be true");
    assert(health.port === 5174, "Docker/API 端口应固定为 5174");
    assert(Boolean(health.projectConfigFile), "health should expose projectConfigFile");
    record("Docker API 健康检查", `${health.host}:${health.port}`);

    const templates = await request("/project-templates");
    assert(Array.isArray(templates) && templates.length >= 3, "客户模板库至少需要 3 个模板");
    assert(templates.every((item) => item.config?.assignmentRules?.keywordRules?.length), "每个客户模板都应带规则模板");
    record("客户模板库可复用", `${templates.map((item) => item.name).join(" / ")}`);

    const seed = await request("/seed-real-template", { method: "POST" });
    assert(seed.count === 30, "真实试点模板应初始化 30 条隐患");
    const seededHazards = await request("/hazards");
    assert(seededHazards.length === 30, "隐患列表应为 30 条");
    assert(seededHazards.every((item) => item.owner && item.owner !== "待分派" && item.reviewer && item.due), "30 条隐患应已预分派责任人/复核人/期限");
    record("真实试点 30 条隐患初始化", `${seededHazards.length} 条`);

    const csvText = await fs.readFile(path.join(root, "samples", "customer-hazards-template.csv"), "utf8");
    const csvLines = csvText.trim().split(/\r?\n/);
    assert(csvLines.length >= 31, "真实客户 CSV 模板样例应包含表头和至少 30 条隐患");
    assert(csvLines[0].includes("责任人") && csvLines[0].includes("复核人") && csvLines[0].includes("整改前证据"), "CSV 模板应包含责任人/复核人/证据字段");
    record("真实客户 CSV 模板样例", `${csvLines.length - 1} 条样例`);

    const unassigned = { ...seededHazards[0], id: "e2e-unassigned", code: "XF-E2E-UNASSIGNED", status: "待分派", owner: "待分派", afterEvidence: [], logs: ["E2E 临时未分派隐患"] };
    await request("/hazards", { method: "PUT", ...jsonBody([unassigned, ...seededHazards]) });
    const blockedEvidence = await requestRaw(`/hazards/${unassigned.id}/actions`, { method: "POST", ...jsonBody({ action: "submitEvidence", evidence: "不应允许提交" }) });
    assert(blockedEvidence.response.status === 409, "待分派状态不应允许提交整改证据");
    record("状态机阻断待分派提交整改", `HTTP ${blockedEvidence.response.status}`);

    const assigned = await request(`/hazards/${unassigned.id}/actions`, {
      method: "POST",
      ...jsonBody({ action: "assign", owner: "物业工程-陈工", reviewer: "安全负责人-周经理", due: addDays(3) })
    });
    assert(assigned.hazard.status === "待整改", "分派后应进入待整改");
    record("单条分派 API", `${assigned.hazard.code} -> ${assigned.hazard.owner}`);

    const uploaded = await uploadTextEvidence();
    assert(uploaded.publicUrl && uploaded.url, "上传接口应返回可访问文件 URL");
    record("图片/文件上传接口", uploaded.url);

    const submitted = await request(`/hazards/${assigned.hazard.id}/actions`, {
      method: "POST",
      ...jsonBody({ action: "submitEvidence", evidence: uploaded.publicUrl })
    });
    assert(submitted.hazard.status === "待复核", "提交整改证据后应进入待复核");
    assert(submitted.hazard.afterEvidence.includes(uploaded.publicUrl), "整改后证据应写入隐患");
    record("整改链接流程提交证据", submitted.hazard.status);

    const approved = await request(`/hazards/${submitted.hazard.id}/actions`, { method: "POST", ...jsonBody({ action: "approve" }) });
    assert(approved.hazard.status === "已闭环", "复核通过后应闭环");
    assert(approved.hazard.closedAt, "闭环后应写入 closedAt");
    record("复核链接流程闭环", approved.hazard.closedAt);

    const rejectTarget = seededHazards[1];
    await request(`/hazards/${rejectTarget.id}/actions`, { method: "POST", ...jsonBody({ action: "submitEvidence", evidence: "E2E 整改后照片 2 张" }) });
    const rejected = await request(`/hazards/${rejectTarget.id}/actions`, { method: "POST", ...jsonBody({ action: "reject", reason: "E2E 证据角度不足" }) });
    assert(rejected.hazard.status === "已驳回" && rejected.hazard.rejectReason, "复核驳回应写入驳回原因");
    const resubmitted = await request(`/hazards/${rejectTarget.id}/actions`, { method: "POST", ...jsonBody({ action: "submitEvidence", evidence: "E2E 补充近景照片" }) });
    assert(resubmitted.hazard.status === "待复核", "驳回后补证据应回到待复核");
    record("复核驳回与补充整改", `${rejected.hazard.status} -> ${resubmitted.hazard.status}`);

    const reminder = await request("/reminders/run", { method: "POST", ...jsonBody({ force: true }) });
    assert(reminder.ok && reminder.count > 0, "强制催办应命中未闭环隐患");
    const remindedHazards = await request("/hazards");
    assert(remindedHazards.some((item) => item.lastReminderAt && item.reminderCount > 0), "催办后隐患应记录 lastReminderAt/reminderCount");
    record("自动催办扫描", `${reminder.count} 条`);

    const notify = await request("/notify", { method: "POST", ...jsonBody({ title: "E2E 群消息文案", text: "整改链接/复核链接/催办文案复制验证", source: "e2e" }) });
    assert(notify.ok && notify.dryRun === true, "未配置机器人时 notify 应进入 dry-run");
    const notifications = await request("/notifications");
    const healthAfterNotify = await request("/health");
    assert(Array.isArray(notifications) && notifications.some((item) => item.source === "e2e"), "通知记录接口应能读取最近通知");
    assert(healthAfterNotify.notificationSummary?.total >= notifications.length, "健康检查应暴露最近通知状态摘要");
    record("机器人 dry-run 与通知状态", `${notifications.length} 条通知记录`);

    const configExport = await request("/project-config/export");
    assert(configExport.kind === "strong-workflow.project-config" && configExport.config, "配置导出应返回标准配置包");
    const copiedConfig = {
      ...configExport.config,
      customerName: "复制客户-E2E",
      projectName: "复制客户-E2E 快速试点",
      templateAuditLog: [
        {
          id: `audit-e2e-${Date.now()}`,
          at: new Date().toISOString(),
          actor: "E2E 验收",
          action: "编辑规则",
          summary: "验证配置包复制后审计记录可保留",
          details: ["复制客户配置包", "验证下一家客户可复用"]
        },
        ...(configExport.config.templateAuditLog || [])
      ]
    };
    const importedConfig = await request("/project-config/import", { method: "POST", ...jsonBody({ config: copiedConfig }) });
    assert(importedConfig.config.customerName === "复制客户-E2E", "配置导入应切换客户名称");
    assert(importedConfig.config.templateAuditLog?.[0]?.actor === "E2E 验收", "规则变更审计应随配置包保留");
    record("配置包复制到下一家客户", importedConfig.config.projectName);

    const copiedExport = await request("/project-config/export");
    assert(copiedExport.config.templateAuditLog?.length >= 1, "复制后的配置导出应包含审计记录");
    record("配置导出保留模板审计", `${copiedExport.config.templateAuditLog.length} 条`);

    const pageHtml = await fetch(baseUrl).then((res) => res.text());
    assert(pageHtml.includes("src=") && pageHtml.includes("/assets/"), "站点首页应返回前端资源入口");
    record("站点首页可作为复制工作流入口", baseUrl);

    console.log(JSON.stringify({ ok: true, checkedAt: new Date().toISOString(), checks }, null, 2));
  } finally {
    await restore(originalHazards, originalConfig);
  }
}

async function uploadTextEvidence() {
  const form = new FormData();
  const blob = new Blob(["E2E 整改文件证据"], { type: "text/plain" });
  form.append("file", blob, `e2e-evidence-${Date.now()}.txt`);
  return request("/upload", { method: "POST", body: form });
}

main().catch((error) => {
  console.error(`[fail] ${error.message}`);
  console.error(error.stack);
  process.exit(1);
});
