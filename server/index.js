import cors from "cors";
import crypto from "node:crypto";
import express from "express";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import https from "node:https";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");

function loadEnvFile(fileName) {
  const filePath = path.join(rootDir, fileName);
  if (!fsSync.existsSync(filePath)) return;
  const lines = fsSync.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const rawValue = trimmed.slice(eqIndex + 1).trim();
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

loadEnvFile(".env");
loadEnvFile(".env.local");

function resolveWorkspacePath(value, fallback) {
  const input = value || fallback;
  return path.isAbsolute(input) ? input : path.join(rootDir, input);
}

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 5174);
const publicBaseUrl = (process.env.PUBLIC_BASE_URL || `http://${host}:${port}`).replace(/\/$/, "");
const dataFile = resolveWorkspacePath(process.env.DATA_FILE, "data/hazards.json");
const dataDir = path.dirname(dataFile);
const notificationFile = resolveWorkspacePath(process.env.NOTIFICATION_FILE, "data/notifications.json");
const projectConfigFile = resolveWorkspacePath(process.env.PROJECT_CONFIG_FILE, "data/project-config.json");
const uploadDir = resolveWorkspacePath(process.env.UPLOAD_DIR, "server/uploads");
const maxUploadMb = Number(process.env.MAX_UPLOAD_MB || 15);
const httpsCertFile = process.env.HTTPS_CERT_FILE ? resolveWorkspacePath(process.env.HTTPS_CERT_FILE, "") : "";
const httpsKeyFile = process.env.HTTPS_KEY_FILE ? resolveWorkspacePath(process.env.HTTPS_KEY_FILE, "") : "";
const httpsEnabled = Boolean(httpsCertFile && httpsKeyFile && fsSync.existsSync(httpsCertFile) && fsSync.existsSync(httpsKeyFile));
const reminderIntervalMinutes = Number(process.env.REMINDER_INTERVAL_MINUTES || 60);
const reminderJobEnabled = process.env.ENABLE_REMINDER_JOB === "true";
const allowedOrigins = Array.from(new Set((process.env.ALLOWED_ORIGINS || "http://127.0.0.1:5173,http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean)
  .concat(publicBaseUrl)));

fsSync.mkdirSync(uploadDir, { recursive: true });

const initialHazards = [
  {
    id: "hz-001",
    code: "XF-2026-001",
    project: "南城商业综合体",
    location: "B1 停车场 A 区疏散通道",
    category: "消防通道",
    title: "疏散通道堆放杂物",
    description: "月度维保检查发现通道被临时物料占用，影响人员疏散。",
    suggestion: "清理全部杂物，设置禁止堆放标识，上传整改后照片。",
    status: "待整改",
    severity: "紧急",
    owner: "物业工程-陈工",
    reviewer: "安全负责人-周经理",
    due: "2026-06-08",
    beforeEvidence: ["维保报告第 3 项", "整改前照片 2 张"],
    afterEvidence: [],
    updated: "今天 09:12",
    logs: ["维保报告导入", "机器人分派给物业工程-陈工", "到期前 24 小时自动提醒"]
  },
  {
    id: "hz-002",
    code: "XF-2026-002",
    project: "南城商业综合体",
    location: "3F 餐饮区 3-18 商户",
    category: "灭火器",
    title: "灭火器压力不足",
    description: "现场抽查发现 2 具灭火器压力指针处于黄色区域。",
    suggestion: "更换或重新充装灭火器，上传更换凭证和现场照片。",
    status: "待复核",
    severity: "普通",
    owner: "商户负责人-王店长",
    reviewer: "维保项目-李工",
    due: "2026-06-10",
    beforeEvidence: ["巡检照片 1 张", "设备编号：MFZ/ABC4-0318"],
    afterEvidence: ["整改后照片 2 张", "更换凭证截图"],
    updated: "今天 10:40",
    logs: ["商户通过链接提交整改", "机器人通知维保项目-李工复核"]
  }
];

const defaultProjectConfig = {
  schemaVersion: 2,
  templateId: "industrial-park-fire",
  industry: "园区/物业消防维保",
  customerName: "青浦智造产业园",
  projectName: "青浦智造产业园消防维保试点",
  maintainerName: "维保项目-李工",
  defaultDue: "2026-06-15",
  owners: ["待分派", "物业工程-陈工", "物业客服-沈主管", "外包维修-赵师傅", "租户负责人-王店长", "仓储主管-刘主管", "维保项目-李工"],
  reviewers: ["安全负责人-周经理", "维保项目-李工", "园区安全-林主管", "物业经理-黄经理"],
  assignmentRules: {
    fallbackOwner: "物业工程-陈工",
    fallbackReviewer: "安全负责人-周经理",
    dueDays: 7,
    keywordRules: [
      { id: "door-outsourced", label: "防火门/闭门器", keywords: ["防火门", "闭门器", "顺序器"], owner: "外包维修-赵师傅", reviewer: "安全负责人-周经理", dueDays: 3 },
      { id: "merchant-extinguisher", label: "商户灭火器", keywords: ["商户", "灭火器", "餐饮"], owner: "租户负责人-王店长", reviewer: "维保项目-李工", dueDays: 5 },
      { id: "sprinkler-tenant", label: "喷淋遮挡/堆放", keywords: ["喷淋", "遮挡", "货物", "堆放"], owner: "仓储主管-刘主管", reviewer: "维保项目-李工", dueDays: 3 },
      { id: "passage-property", label: "消防通道/疏散", keywords: ["通道", "疏散", "占用", "堵塞"], owner: "物业工程-陈工", reviewer: "安全负责人-周经理", dueDays: 2 }
    ]
  },
  templateAuditLog: []
};

const projectTemplates = [
  {
    id: "industrial-park-fire",
    name: "园区/物业消防维保",
    description: "适合园区、商业综合体、物业项目，责任人按物业工程、客服、租户、外包维修拆分。",
    config: defaultProjectConfig
  },
  {
    id: "factory-maintenance",
    name: "制造工厂 EHS 隐患整改",
    description: "适合工厂 EHS、设备维保、安环检查，强调车间负责人和安环复核。",
    config: {
      ...defaultProjectConfig,
      templateId: "factory-maintenance",
      industry: "制造工厂 EHS",
      customerName: "华东精密制造工厂",
      projectName: "华东精密制造工厂 EHS 隐患整改试点",
      maintainerName: "安环负责人-吴工",
      owners: ["待分派", "一车间-张主管", "二车间-钱主管", "设备维修-孙工", "仓储物流-李主管", "外包维修-赵师傅"],
      reviewers: ["安环负责人-吴工", "厂务经理-周经理", "设备经理-郑经理"],
      assignmentRules: {
        fallbackOwner: "设备维修-孙工",
        fallbackReviewer: "安环负责人-吴工",
        dueDays: 5,
        keywordRules: [
          { id: "factory-equipment", label: "设备/电气", keywords: ["设备", "电气", "配电", "电源", "照明"], owner: "设备维修-孙工", reviewer: "设备经理-郑经理", dueDays: 3 },
          { id: "factory-warehouse", label: "仓储堆放/通道", keywords: ["仓储", "货物", "堆放", "通道", "遮挡"], owner: "仓储物流-李主管", reviewer: "安环负责人-吴工", dueDays: 2 },
          { id: "factory-workshop-1", label: "一车间隐患", keywords: ["一车间", "1车间", "1号车间"], owner: "一车间-张主管", reviewer: "安环负责人-吴工", dueDays: 5 },
          { id: "factory-workshop-2", label: "二车间隐患", keywords: ["二车间", "2车间", "2号车间"], owner: "二车间-钱主管", reviewer: "安环负责人-吴工", dueDays: 5 }
        ]
      }
    }
  },
  {
    id: "property-merchant",
    name: "商业物业/商户整改",
    description: "适合商场、餐饮街区、写字楼，强调商户负责人和物业经理复核。",
    config: {
      ...defaultProjectConfig,
      templateId: "property-merchant",
      industry: "商业物业/商户整改",
      customerName: "南城商业综合体",
      projectName: "南城商业综合体消防整改闭环试点",
      maintainerName: "消防维保-李工",
      owners: ["待分派", "物业工程-陈工", "物业客服-沈主管", "商户负责人-王店长", "餐饮商户-刘店长", "外包维修-赵师傅"],
      reviewers: ["物业经理-黄经理", "安全负责人-周经理", "消防维保-李工"],
      assignmentRules: {
        fallbackOwner: "物业工程-陈工",
        fallbackReviewer: "物业经理-黄经理",
        dueDays: 3,
        keywordRules: [
          { id: "merchant-extinguisher", label: "商户/餐饮灭火器", keywords: ["商户", "餐饮", "灭火器"], owner: "商户负责人-王店长", reviewer: "消防维保-李工", dueDays: 3 },
          { id: "restaurant-merchant", label: "餐饮商户整改", keywords: ["厨房", "油烟", "燃气", "餐饮"], owner: "餐饮商户-刘店长", reviewer: "物业经理-黄经理", dueDays: 2 },
          { id: "outsourced-door", label: "防火门/设施维修", keywords: ["防火门", "闭门器", "顺序器", "消防栓箱门"], owner: "外包维修-赵师傅", reviewer: "消防维保-李工", dueDays: 2 },
          { id: "property-passage", label: "公共区通道/疏散", keywords: ["通道", "疏散", "大堂", "楼梯间"], owner: "物业工程-陈工", reviewer: "物业经理-黄经理", dueDays: 2 }
        ]
      }
    }
  }
];

function createPilotHazards() {
  const templates = [
    ["消防通道", "B1 停车场疏散通道堆放杂物", "清理杂物并上传整改后照片"],
    ["灭火器", "商户灭火器压力不足", "更换或重新充装灭火器并上传凭证"],
    ["防火门", "防火门闭门器失效", "维修闭门器并提交自动闭合视频"],
    ["喷淋遮挡", "货物堆放高度遮挡喷淋", "调整堆放高度并上传前后对比照片"],
    ["应急照明", "应急照明灯不亮", "更换灯具或电池并上传测试照片"],
    ["报警系统", "手动报警按钮标识脱落", "补齐标识并上传现场照片"]
  ];

  return Array.from({ length: 30 }, (_, index) => {
    const [category, title, suggestion] = templates[index % templates.length];
    const number = index + 1;
    const severity = category === "防火门" || category === "消防通道" ? "紧急" : "普通";
    return {
      id: `pilot-${String(number).padStart(3, "0")}`,
      code: `XF-PILOT-${String(number).padStart(3, "0")}`,
      project: "南城商业综合体试点",
      location: `${Math.floor(index / 6) + 1}F ${String.fromCharCode(65 + (index % 6))} 区`,
      category,
      title,
      description: `第 ${index + 1} 条试点隐患：${title}。`,
      suggestion,
      status: "待分派",
      severity,
      owner: "待分派",
      reviewer: "安全负责人-周经理",
      due: "2026-06-12",
      beforeEvidence: [`试点报告第 ${index + 1} 项`],
      afterEvidence: [],
      updated: "刚刚",
      logs: ["30 条试点隐患批量生成，等待分派责任人"]
    };
  });
}

function createRealTemplateHazards() {
  const rows = [
    ["1号楼 B1 配电间前室", "消防通道", "前室堆放清洁工具，影响应急疏散", "物业工程-陈工", "紧急"],
    ["1号楼 2F 东侧楼梯间", "防火门", "防火门闭门器回弹无力，无法自动闭合", "外包维修-赵师傅", "重大"],
    ["1号楼 4F 共享办公区", "应急照明", "应急照明灯断电测试不亮", "物业工程-陈工", "普通"],
    ["1号楼 6F 走廊", "报警系统", "手动报警按钮标识脱落", "维保项目-李工", "普通"],
    ["2号楼 1F 大堂", "灭火器", "灭火器压力指针偏低", "物业客服-沈主管", "普通"],
    ["2号楼 3F 西侧茶水间", "喷淋遮挡", "高柜遮挡喷淋头覆盖范围", "租户负责人-王店长", "紧急"],
    ["2号楼 5F 北侧消防栓", "消防栓", "消防栓箱门开启不顺畅", "外包维修-赵师傅", "普通"],
    ["3号楼 B1 车库 C 区", "消防通道", "疏散指示牌被广告牌遮挡", "物业工程-陈工", "紧急"],
    ["3号楼 2F 西侧防火门", "防火门", "防火门顺序器损坏", "外包维修-赵师傅", "重大"],
    ["3号楼 8F 会议区", "应急照明", "安全出口灯面板松动", "物业工程-陈工", "普通"]
  ];

  return Array.from({ length: 30 }, (_, index) => {
    const [location, category, title, owner, severity] = rows[index % rows.length];
    const number = index + 1;
    return {
      id: `real-${String(number).padStart(3, "0")}`,
      code: `XF-REAL-${String(number).padStart(3, "0")}`,
      project: "青浦智造产业园消防维保试点",
      location: `${location}${index >= rows.length ? ` 第 ${Math.floor(index / rows.length) + 1} 轮复查` : ""}`,
      category,
      title,
      description: `现场维保检查发现：${title}。该问题需责任人在整改期限内提交照片或视频证据。`,
      suggestion: "按消防维保意见完成整改，上传整改后照片；涉及防火门、报警系统的隐患需补充短视频或复测说明。",
      status: "待整改",
      severity,
      owner,
      reviewer: index % 3 === 0 ? "安全负责人-周经理" : "维保项目-李工",
      due: index < 10 ? "2026-06-12" : "2026-06-15",
      beforeEvidence: [`真实模板维保报告第 ${number} 项`, `点位：${location}`],
      afterEvidence: [],
      updated: "刚刚",
      logs: ["真实试点模板初始化", `已预分派给 ${owner}`]
    };
  });
}

async function ensureDataFile() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, JSON.stringify(initialHazards, null, 2), "utf8");
  }
}

async function readHazards() {
  await ensureDataFile();
  const raw = await fs.readFile(dataFile, "utf8");
  return JSON.parse(raw);
}

async function writeHazards(hazards) {
  await fs.mkdir(dataDir, { recursive: true });
  const tmpFile = `${dataFile}.tmp`;
  await fs.writeFile(tmpFile, JSON.stringify(hazards, null, 2), "utf8");
  await fs.rename(tmpFile, dataFile);
}

function normalizeNameList(values, includePending = false) {
  const source = Array.isArray(values) ? values : String(values || "").split(/[\n,，;；]+/);
  const cleaned = source.map((value) => String(value || "").trim()).filter(Boolean);
  const list = includePending ? ["待分派", ...cleaned] : cleaned;
  return Array.from(new Set(list));
}

function normalizeDueDays(value, fallback = 7) {
  const days = Number(value);
  return Number.isFinite(days) && days > 0 && days <= 365 ? Math.round(days) : fallback;
}

function normalizeTemplateAuditLog(logs = []) {
  if (!Array.isArray(logs)) return [];
  return logs
    .map((entry, index) => ({
      id: String(entry?.id || `audit-${index + 1}`).trim(),
      at: String(entry?.at || new Date().toISOString()).trim(),
      actor: String(entry?.actor || "系统").trim(),
      action: ["新增规则", "编辑规则", "调整优先级"].includes(String(entry?.action)) ? String(entry.action) : "编辑规则",
      summary: String(entry?.summary || "模板规则变更").trim(),
      details: Array.isArray(entry?.details) ? entry.details.map((detail) => String(detail).trim()).filter(Boolean).slice(0, 8) : []
    }))
    .filter((entry) => entry.id && entry.summary)
    .slice(0, 80);
}

function normalizeProjectConfig(config = {}) {
  const assignmentRules = config.assignmentRules && typeof config.assignmentRules === "object" ? config.assignmentRules : {};
  const keywordRules = Array.isArray(assignmentRules.keywordRules) ? assignmentRules.keywordRules : defaultProjectConfig.assignmentRules.keywordRules;
  const normalizedKeywordRules = keywordRules
    .map((rule, index) => ({
      id: String(rule.id || `rule-${index + 1}`).trim(),
      label: String(rule.label || `规则 ${index + 1}`).trim(),
      keywords: Array.isArray(rule.keywords) ? rule.keywords.map((keyword) => String(keyword).trim()).filter(Boolean) : [],
      owner: String(rule.owner || assignmentRules.fallbackOwner || defaultProjectConfig.assignmentRules.fallbackOwner).trim(),
      reviewer: String(rule.reviewer || assignmentRules.fallbackReviewer || defaultProjectConfig.assignmentRules.fallbackReviewer).trim(),
      dueDays: normalizeDueDays(rule.dueDays || assignmentRules.dueDays, defaultProjectConfig.assignmentRules.dueDays)
    }))
    .filter((rule) => rule.keywords.length > 0 && rule.owner);
  const fallbackOwner = String(assignmentRules.fallbackOwner || config.fallbackOwner || defaultProjectConfig.assignmentRules.fallbackOwner).trim();
  const fallbackReviewer = String(assignmentRules.fallbackReviewer || config.fallbackReviewer || defaultProjectConfig.assignmentRules.fallbackReviewer).trim();
  return {
    schemaVersion: 2,
    templateId: String(config.templateId || defaultProjectConfig.templateId).trim(),
    industry: String(config.industry || defaultProjectConfig.industry).trim(),
    customerName: String(config.customerName || defaultProjectConfig.customerName).trim(),
    projectName: String(config.projectName || defaultProjectConfig.projectName).trim(),
    maintainerName: String(config.maintainerName || defaultProjectConfig.maintainerName).trim(),
    defaultDue: String(config.defaultDue || defaultProjectConfig.defaultDue).trim(),
    owners: normalizeNameList([...(Array.isArray(config.owners) ? config.owners : defaultProjectConfig.owners), fallbackOwner, ...normalizedKeywordRules.map((rule) => rule.owner)], true),
    reviewers: normalizeNameList([...(Array.isArray(config.reviewers) ? config.reviewers : defaultProjectConfig.reviewers), fallbackReviewer, ...normalizedKeywordRules.map((rule) => rule.reviewer)], false),
    assignmentRules: {
      fallbackOwner,
      fallbackReviewer,
      dueDays: normalizeDueDays(assignmentRules.dueDays || config.dueDays, defaultProjectConfig.assignmentRules.dueDays),
      keywordRules: normalizedKeywordRules
    },
    templateAuditLog: normalizeTemplateAuditLog(config.templateAuditLog)
  };
}

function isValidProjectConfig(config) {
  const normalized = normalizeProjectConfig(config);
  return (
    normalized.customerName.length > 0 &&
    normalized.projectName.length > 0 &&
    normalized.maintainerName.length > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(normalized.defaultDue) &&
    normalized.owners.length > 1 &&
    normalized.reviewers.length > 0
  );
}

async function ensureProjectConfigFile() {
  await fs.mkdir(path.dirname(projectConfigFile), { recursive: true });
  try {
    await fs.access(projectConfigFile);
  } catch {
    await writeProjectConfig(defaultProjectConfig);
  }
}

async function readProjectConfig() {
  await ensureProjectConfigFile();
  const raw = await fs.readFile(projectConfigFile, "utf8");
  return normalizeProjectConfig(JSON.parse(raw));
}

async function writeProjectConfig(config) {
  const normalized = normalizeProjectConfig(config);
  await fs.mkdir(path.dirname(projectConfigFile), { recursive: true });
  const tmpFile = `${projectConfigFile}.tmp`;
  await fs.writeFile(tmpFile, JSON.stringify(normalized, null, 2), "utf8");
  await fs.rename(tmpFile, projectConfigFile);
  return normalized;
}

async function readNotifications() {
  await fs.mkdir(path.dirname(notificationFile), { recursive: true });
  try {
    const raw = await fs.readFile(notificationFile, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeNotifications(notifications) {
  await fs.mkdir(path.dirname(notificationFile), { recursive: true });
  const tmpFile = `${notificationFile}.tmp`;
  await fs.writeFile(tmpFile, JSON.stringify(notifications.slice(0, 100), null, 2), "utf8");
  await fs.rename(tmpFile, notificationFile);
}

async function appendNotificationLog(entry) {
  const notifications = await readNotifications();
  const nextEntry = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    ...entry
  };
  await writeNotifications([nextEntry, ...notifications]);
  return nextEntry;
}

function isValidHazard(hazard) {
  const statuses = new Set(["待分派", "待整改", "待复核", "已驳回", "已闭环", "已逾期"]);
  const severities = new Set(["重大", "紧急", "普通"]);
  return (
    hazard &&
    typeof hazard.id === "string" &&
    typeof hazard.code === "string" &&
    typeof hazard.project === "string" &&
    typeof hazard.location === "string" &&
    typeof hazard.title === "string" &&
    statuses.has(hazard.status) &&
    severities.has(hazard.severity) &&
    Array.isArray(hazard.beforeEvidence) &&
    Array.isArray(hazard.afterEvidence) &&
    Array.isArray(hazard.logs)
  );
}

function nowText() {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date());
}

function isValidHazardPatch(patch) {
  const allowedKeys = new Set([
    "project",
    "location",
    "category",
    "title",
    "description",
    "suggestion",
    "severity",
    "owner",
    "reviewer",
    "due",
    "beforeEvidence"
  ]);
  const severities = new Set(["重大", "紧急", "普通"]);
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return false;
  if (Object.keys(patch).some((key) => !allowedKeys.has(key))) return false;
  if (patch.severity !== undefined && !severities.has(patch.severity)) return false;
  if (patch.beforeEvidence !== undefined && !Array.isArray(patch.beforeEvidence)) return false;
  return Object.entries(patch).every(([key, value]) => key === "beforeEvidence" || typeof value === "string");
}

async function replaceHazard(id, updater) {
  const hazards = await readHazards();
  const index = hazards.findIndex((hazard) => hazard.id === id);
  if (index === -1) {
    return { ok: false, status: 404, error: "hazard not found" };
  }

  const result = updater(hazards[index]);
  if (result?.error) return { ok: false, status: result.status || 400, error: result.error };
  const nextHazard = result?.hazard;
  if (!isValidHazard(nextHazard)) {
    return { ok: false, status: 400, error: "updated hazard is invalid" };
  }

  const nextHazards = [...hazards];
  nextHazards[index] = nextHazard;
  await writeHazards(nextHazards);
  return { ok: true, hazard: nextHazard };
}

function applyHazardAction(hazard, action, payload = {}) {
  const logPrefix = typeof payload.log === "string" && payload.log.trim() ? payload.log.trim() : "";

  if (action === "assign") {
    if (hazard.status === "已闭环") return { error: "closed hazard cannot be reassigned", status: 409 };
    const owner = String(payload.owner || hazard.owner || "").trim();
    const reviewer = String(payload.reviewer || hazard.reviewer || "").trim();
    const due = String(payload.due || hazard.due || "").trim();
    if (!owner || owner === "待分派") return { error: "owner is required before assignment", status: 400 };
    if (!reviewer) return { error: "reviewer is required before assignment", status: 400 };
    return {
      hazard: {
        ...hazard,
        owner,
        reviewer,
        due,
        status: "待整改",
        updated: "刚刚",
        logs: [logPrefix || `已分派给 ${owner}，复核人 ${reviewer}，期限 ${due}`, ...hazard.logs]
      }
    };
  }

  if (action === "submitEvidence") {
    if (!["待整改", "已驳回", "已逾期"].includes(hazard.status)) {
      return { error: "evidence can only be submitted while remediation is pending", status: 409 };
    }
    const evidence = String(payload.evidence || "").trim();
    if (!evidence) return { error: "evidence is required", status: 400 };
    return {
      hazard: {
        ...hazard,
        status: "待复核",
        afterEvidence: Array.from(new Set([...hazard.afterEvidence, evidence])),
        updated: "刚刚",
        logs: [logPrefix || `${hazard.owner} 提交整改证据：${evidence}`, ...hazard.logs]
      }
    };
  }

  if (action === "approve") {
    if (hazard.status !== "待复核") return { error: "only reviewing hazards can be approved", status: 409 };
    if (hazard.afterEvidence.length === 0) return { error: "cannot approve without after evidence", status: 409 };
    return {
      hazard: {
        ...hazard,
        status: "已闭环",
        closedAt: nowText(),
        rejectReason: undefined,
        updated: "刚刚",
        logs: [logPrefix || `${hazard.reviewer} 复核通过，隐患闭环`, ...hazard.logs]
      }
    };
  }

  if (action === "reject") {
    if (hazard.status !== "待复核") return { error: "only reviewing hazards can be rejected", status: 409 };
    const reason = String(payload.reason || "证据不足，请补充整改后近景照片或短视频。").trim();
    return {
      hazard: {
        ...hazard,
        status: "已驳回",
        rejectReason: reason,
        updated: "刚刚",
        logs: [logPrefix || `${hazard.reviewer} 驳回整改：${reason}`, ...hazard.logs]
      }
    };
  }

  if (action === "remind") {
    if (hazard.status === "已闭环") return { error: "closed hazard does not need reminders", status: 409 };
    if (hazard.status === "待分派") return { error: "unassigned hazard cannot be reminded", status: 409 };
    const nextReminderCount = Number(hazard.reminderCount || 0) + 1;
    const escalationLevel = nextReminderCount >= 3 ? "三级升级" : nextReminderCount >= 2 ? "二级升级" : "一级催办";
    return {
      hazard: {
        ...hazard,
        status: "已逾期",
        lastReminderAt: new Date().toISOString(),
        reminderCount: nextReminderCount,
        escalationLevel,
        updated: "刚刚",
        logs: [logPrefix || `催办 ${hazard.owner}，${escalationLevel}，累计 ${nextReminderCount} 次`, ...hazard.logs]
      }
    };
  }

  return { error: "unknown hazard action", status: 400 };
}

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadDir),
  filename: (_req, file, callback) => {
    const safeName = file.originalname.replace(/[^\w.\-\u4e00-\u9fa5]/g, "_");
    callback(null, `${Date.now()}-${safeName}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: maxUploadMb * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    // 试点阶段只放行整改常用证据类型，避免任意文件写入风险。
    const allowedMimes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/plain"
    ];
    const allowedExts = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".txt"]);
    const ext = path.extname(file.originalname).toLowerCase();
    callback(null, allowedMimes.includes(file.mimetype) || allowedExts.has(ext));
  }
});

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return { ok: response.ok, status: response.status, text: await response.text() };
}

function buildDingTalkWebhookUrl() {
  const webhook = process.env.DINGTALK_WEBHOOK_URL;
  const secret = process.env.DINGTALK_SECRET;
  if (!webhook || !secret) return webhook;
  const timestamp = Date.now();
  const signBase = `${timestamp}\n${secret}`;
  const sign = crypto.createHmac("sha256", secret).update(signBase).digest("base64");
  const url = new URL(webhook);
  url.searchParams.set("timestamp", String(timestamp));
  url.searchParams.set("sign", sign);
  return url.toString();
}

async function sendWebhook({ title, text, source = "manual" }) {
  const results = [];
  const channels = [];
  if (!process.env.WECOM_WEBHOOK_URL && !process.env.DINGTALK_WEBHOOK_URL) {
    console.log(`[notify:dry-run] ${title}\n${text}`);
    await appendNotificationLog({
      source,
      title,
      text,
      channels: [],
      ok: true,
      dryRun: true,
      results: []
    });
    return [];
  }
  if (process.env.WECOM_WEBHOOK_URL) {
    channels.push("wecom");
    let result;
    try {
      result = await postJson(process.env.WECOM_WEBHOOK_URL, {
        msgtype: "markdown",
        markdown: { content: `**${title}**\n\n${text}` }
      });
    } catch (error) {
      result = { ok: false, status: 0, text: String(error.message || error) };
    }
    results.push({ channel: "wecom", ...result });
  }
  if (process.env.DINGTALK_WEBHOOK_URL) {
    channels.push("dingtalk");
    let result;
    try {
      result = await postJson(buildDingTalkWebhookUrl(), {
        msgtype: "markdown",
        markdown: { title, text: `### ${title}\n${text}` }
      });
    } catch (error) {
      result = { ok: false, status: 0, text: String(error.message || error) };
    }
    results.push({ channel: "dingtalk", ...result });
  }

  const ok = results.length > 0 && results.every((result) => result.ok);
  await appendNotificationLog({
    source,
    title,
    text,
    channels,
    ok,
    dryRun: false,
    results: results.map((result) => ({
      channel: result.channel,
      ok: result.ok,
      status: result.status,
      text: String(result.text || "").slice(0, 500)
    }))
  });

  if (!ok) {
    const failed = results.filter((result) => !result.ok).map((result) => `${result.channel}:${result.status}`).join(", ");
    throw new Error(`webhook failed: ${failed || "no channel"}`);
  }
  return results;
}

function dayStamp() {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function parseDueDate(value) {
  const date = new Date(`${value}T23:59:59+08:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function runReminderScan({ force = false } = {}) {
  const hazards = await readHazards();
  const now = new Date();
  const soon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  let changed = false;
  const reminders = [];

  const nextHazards = hazards.map((hazard) => {
    if (hazard.status === "已闭环" || hazard.status === "待分派") return hazard;
    const dueDate = parseDueDate(hazard.due);
    if (!dueDate) return hazard;
    const overdue = dueDate.getTime() < now.getTime();
    const dueSoon = dueDate.getTime() <= soon.getTime();
    if (!force && !overdue && !dueSoon) return hazard;
    const lastReminderAt = hazard.lastReminderAt ? new Date(hazard.lastReminderAt) : null;
    if (!force && lastReminderAt && now.getTime() - lastReminderAt.getTime() < 24 * 60 * 60 * 1000) return hazard;

    const nextStatus = overdue ? "已逾期" : hazard.status;
    const nextReminderCount = Number(hazard.reminderCount || 0) + 1;
    const escalationLevel = nextReminderCount >= 3 ? "三级升级" : nextReminderCount >= 2 ? "二级升级" : "一级催办";
    const message = `自动催办:${dayStamp()} ${hazard.code} ${overdue ? "已逾期" : "即将到期"}，${escalationLevel}，已提醒 ${hazard.owner}，复核人 ${hazard.reviewer}`;
    reminders.push({
      id: hazard.id,
      code: hazard.code,
      owner: hazard.owner,
      reviewer: hazard.reviewer,
      due: hazard.due,
      overdue,
      status: nextStatus,
      reminderCount: nextReminderCount,
      escalationLevel
    });
    changed = true;
    return {
      ...hazard,
      status: nextStatus,
      lastReminderAt: now.toISOString(),
      reminderCount: nextReminderCount,
      escalationLevel,
      updated: "自动催办",
      logs: [message, ...hazard.logs]
    };
  });

  if (changed) {
    await writeHazards(nextHazards);
    await sendWebhook({
      title: "自动催办提醒",
      source: "reminder",
      text: reminders.map((item) => `- ${item.code} ${item.overdue ? "已逾期" : "即将到期"}，${item.escalationLevel}，责任人：${item.owner}，期限：${item.due}`).join("\n")
    });
  }

  return { ok: true, count: reminders.length, reminders };
}

const app = express();
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS origin not allowed: ${origin}`));
    }
  })
);
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(uploadDir));

async function getNotificationSummary() {
  const notifications = await readNotifications();
  const recent = notifications[0] || null;
  const failures = notifications.filter((item) => !item.ok).slice(0, 5);
  return {
    recent,
    recentFailures: failures,
    total: notifications.length,
    failed: notifications.filter((item) => !item.ok).length
  };
}

app.get("/api/health", async (_req, res) => {
  const notificationSummary = await getNotificationSummary();
  res.json({
    ok: true,
    host,
    port,
    publicBaseUrl,
    dataFile,
    notificationFile,
    projectConfigFile,
    uploadDir,
    maxUploadMb,
    allowedOrigins,
    httpsEnabled,
    httpsCertConfigured: Boolean(httpsCertFile),
    httpsKeyConfigured: Boolean(httpsKeyFile),
    reminderJobEnabled,
    reminderIntervalMinutes,
    wecomConfigured: Boolean(process.env.WECOM_WEBHOOK_URL),
    dingtalkConfigured: Boolean(process.env.DINGTALK_WEBHOOK_URL),
    dingtalkSignConfigured: Boolean(process.env.DINGTALK_SECRET),
    notificationSummary
  });
});

app.get("/api/notifications", async (_req, res) => {
  res.json(await readNotifications());
});

app.get("/api/project-config", async (_req, res) => {
  res.json(await readProjectConfig());
});

app.get("/api/project-templates", (_req, res) => {
  res.json(projectTemplates.map((template) => ({
    ...template,
    config: normalizeProjectConfig(template.config)
  })));
});

app.put("/api/project-config", async (req, res) => {
  if (!isValidProjectConfig(req.body)) {
    res.status(400).json({ ok: false, error: "invalid project config" });
    return;
  }
  const config = await writeProjectConfig(req.body);
  res.json({ ok: true, config });
});

app.get("/api/project-config/export", async (_req, res) => {
  const config = await readProjectConfig();
  res.json({
    kind: "strong-workflow.project-config",
    version: 2,
    exportedAt: new Date().toISOString(),
    config
  });
});

app.post("/api/project-config/import", async (req, res) => {
  const config = req.body?.config || req.body?.projectConfig || req.body;
  if (!isValidProjectConfig(config)) {
    res.status(400).json({ ok: false, error: "invalid project config package" });
    return;
  }
  const saved = await writeProjectConfig(config);
  res.json({ ok: true, config: saved });
});

app.get("/api/hazards", async (_req, res) => {
  res.json(await readHazards());
});

app.get("/api/hazards/:id", async (req, res) => {
  const hazards = await readHazards();
  const hazard = hazards.find((item) => item.id === req.params.id);
  if (!hazard) {
    res.status(404).json({ ok: false, error: "hazard not found" });
    return;
  }
  res.json(hazard);
});

app.put("/api/hazards", async (req, res) => {
  if (!Array.isArray(req.body)) {
    res.status(400).json({ error: "hazards must be an array" });
    return;
  }
  if (!req.body.every(isValidHazard)) {
    res.status(400).json({ error: "hazards contain invalid records" });
    return;
  }
  await writeHazards(req.body);
  res.json({ ok: true, count: req.body.length });
});

app.patch("/api/hazards/:id", async (req, res) => {
  if (!isValidHazardPatch(req.body)) {
    res.status(400).json({ ok: false, error: "invalid hazard patch" });
    return;
  }
  const result = await replaceHazard(req.params.id, (hazard) => ({
    hazard: {
      ...hazard,
      ...req.body,
      updated: "刚刚"
    }
  }));
  if (!result.ok) {
    res.status(result.status).json({ ok: false, error: result.error });
    return;
  }
  res.json({ ok: true, hazard: result.hazard });
});

app.post("/api/hazards/:id/actions", async (req, res) => {
  const action = String(req.body?.action || "");
  const result = await replaceHazard(req.params.id, (hazard) => applyHazardAction(hazard, action, req.body));
  if (!result.ok) {
    res.status(result.status).json({ ok: false, error: result.error });
    return;
  }
  res.json({ ok: true, hazard: result.hazard });
});

app.post("/api/reset", async (_req, res) => {
  await writeHazards(initialHazards);
  res.json({ ok: true, hazards: initialHazards });
});

app.post("/api/seed-pilot", async (_req, res) => {
  const hazards = createPilotHazards();
  await writeHazards(hazards);
  res.json({ ok: true, count: hazards.length, hazards });
});

app.post("/api/seed-real-template", async (_req, res) => {
  const hazards = createRealTemplateHazards();
  await writeHazards(hazards);
  res.json({ ok: true, count: hazards.length, hazards });
});

app.post("/api/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "missing file" });
    return;
  }
  res.json({
    originalName: req.file.originalname,
    storedName: req.file.filename,
    url: `/uploads/${req.file.filename}`,
    publicUrl: `${publicBaseUrl}/uploads/${encodeURIComponent(req.file.filename)}`
  });
});

app.post("/api/notify", async (req, res) => {
  const { title = "消防整改闭环助手", text = "", source = "manual" } = req.body ?? {};
  try {
    const results = await sendWebhook({ title, text, source });
    res.json({ ok: true, dryRun: results.length === 0, results });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) });
  }
});

app.post("/api/reminders/run", async (req, res) => {
  try {
    res.json(await runReminderScan({ force: Boolean(req.body?.force) }));
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || error) });
  }
});

app.use("/api", (_req, res) => {
  res.status(404).json({ ok: false, error: "api route not found" });
});

app.use(express.static(distDir));
app.get("*", (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    res.status(400).json({ ok: false, error: error.message });
    return;
  }
  res.status(500).json({ ok: false, error: String(error.message || error) });
});

const server = httpsEnabled
  ? https
      .createServer(
        {
          cert: fsSync.readFileSync(httpsCertFile),
          key: fsSync.readFileSync(httpsKeyFile)
        },
        app
      )
      .listen(port, host, onServerReady)
  : app.listen(port, host, onServerReady);

function onServerReady() {
  console.log(`消防整改闭环助手已启动：${publicBaseUrl}`);
  console.log(`HTTPS：${httpsEnabled ? "enabled" : "disabled"}`);
  console.log(`数据文件：${dataFile}`);
  console.log(`上传目录：${uploadDir}`);
  if (reminderJobEnabled) {
    console.log(`自动催办任务：每 ${reminderIntervalMinutes} 分钟扫描一次`);
  }
}

if (reminderJobEnabled) {
  setInterval(() => {
    runReminderScan().catch((error) => console.error(`自动催办任务失败：${String(error.message || error)}`));
  }, Math.max(1, reminderIntervalMinutes) * 60 * 1000);
}

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`端口已被占用：${host}:${port}。请修改 .env.local 里的 PORT，或关闭占用该端口的进程。`);
    process.exit(1);
  }
  console.error(error);
  process.exit(1);
});
