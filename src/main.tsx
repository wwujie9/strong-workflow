import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Copy,
  FileArchive,
  FileDown,
  Flame,
  Image,
  Link2,
  MessageSquareText,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Upload,
  UserRoundCheck,
  XCircle
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import "./styles.css";

type Status = "待分派" | "待整改" | "待复核" | "已驳回" | "已闭环" | "已逾期";
type Severity = "重大" | "紧急" | "普通";

type Hazard = {
  id: string;
  code: string;
  project: string;
  location: string;
  category: string;
  title: string;
  description: string;
  suggestion: string;
  status: Status;
  severity: Severity;
  owner: string;
  reviewer: string;
  due: string;
  beforeEvidence: string[];
  afterEvidence: string[];
  rejectReason?: string;
  closedAt?: string;
  lastReminderAt?: string;
  reminderCount?: number;
  escalationLevel?: string;
  updated: string;
  logs: string[];
};

type ChatMessage = {
  from: string;
  body: string;
  time: string;
  kind: "normal" | "robot" | "warning";
};

type RouteState = {
  mode: "workspace" | "rectify" | "review";
  id?: string;
};

type HealthState = {
  ok: boolean;
  host: string;
  port: number;
  publicBaseUrl: string;
  dataFile: string;
  projectConfigFile?: string;
  uploadDir: string;
  maxUploadMb: number;
  allowedOrigins: string[];
  httpsEnabled: boolean;
  reminderJobEnabled: boolean;
  reminderIntervalMinutes: number;
  wecomConfigured: boolean;
  dingtalkConfigured: boolean;
  dingtalkSignConfigured: boolean;
  notificationSummary?: NotificationSummary;
};

type NotificationLog = {
  id: string;
  at: string;
  source: string;
  title: string;
  text: string;
  channels: string[];
  ok: boolean;
  dryRun?: boolean;
  results?: { channel: string; ok: boolean; status: number; text: string }[];
};

type NotificationSummary = {
  recent: NotificationLog | null;
  recentFailures: NotificationLog[];
  total: number;
  failed: number;
};

type ProjectConfig = {
  schemaVersion?: number;
  templateId?: string;
  industry?: string;
  customerName: string;
  projectName: string;
  maintainerName: string;
  defaultDue: string;
  owners: string[];
  reviewers: string[];
  assignmentRules?: {
    fallbackOwner: string;
    fallbackReviewer: string;
    dueDays: number;
    keywordRules?: AssignmentRule[];
  };
};

type AssignmentRule = {
  id: string;
  label: string;
  keywords: string[];
  owner: string;
  reviewer?: string;
  dueDays?: number;
};

type CsvImportState = {
  fileName: string;
  headers: string[];
  mapping: CsvFieldMapping;
  hazards: Hazard[];
  issues: CsvValidationIssue[];
  invalidRows: string[];
  unknownOwners: string[];
  unknownReviewers: string[];
};

type CsvFieldKey = "code" | "project" | "location" | "category" | "title" | "description" | "suggestion" | "severity" | "owner" | "reviewer" | "due" | "beforeEvidence";

type CsvFieldMapping = Record<CsvFieldKey, string>;

type CsvValidationIssue = {
  row: number;
  field: string;
  message: string;
  level: "error" | "warning";
};

type ProjectTemplate = {
  id: string;
  name: string;
  description: string;
  config: ProjectConfig;
};

type AssignmentSuggestion = {
  ids: string[];
  owner: string;
  reviewer: string;
  due: string;
  reason: string;
  matchedCount: number;
  items: AssignmentSuggestionItem[];
};

type AssignmentSuggestionItem = {
  id: string;
  code: string;
  title: string;
  owner: string;
  reviewer: string;
  due: string;
  ruleLabel: string;
};

type DrillRecord = {
  id: string;
  at: string;
  customerName: string;
  projectName: string;
  templateName: string;
  fileName: string;
  importedCount: number;
  blockingCount: number;
  warningCount: number;
  matchedRuleCount: number;
  suggestedOwner: string;
  suggestedReviewer: string;
  suggestedDue: string;
};

const API_BASE = (import.meta.env.VITE_API_BASE || (window.location.port === "5173" ? "http://127.0.0.1:5174/api" : "/api")).replace(/\/$/, "");
const PUBLIC_BASE = API_BASE.startsWith("http") ? API_BASE.replace(/\/api$/, "") : window.location.origin;

const statusFlow: Status[] = ["待分派", "待整改", "待复核", "已闭环"];

const statusTone: Record<Status, string> = {
  待分派: "muted",
  待整改: "action",
  待复核: "info",
  已驳回: "warn",
  已闭环: "good",
  已逾期: "danger"
};

const defaultProjectConfig: ProjectConfig = {
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
  }
};

const projectTemplates: ProjectTemplate[] = [
  {
    id: "industrial-park-fire",
    name: "园区/物业消防维保",
    description: "园区、商业综合体、物业项目，按物业工程、客服、租户、外包维修拆分。",
    config: defaultProjectConfig
  },
  {
    id: "factory-maintenance",
    name: "制造工厂 EHS 隐患整改",
    description: "工厂 EHS、设备维保、安环检查，按车间、设备、仓储和安环复核拆分。",
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
    description: "商场、餐饮街区、写字楼，按物业、商户、外包维修和物业经理复核拆分。",
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

const csvFieldLabels: Record<CsvFieldKey, string> = {
  code: "编号",
  project: "项目",
  location: "点位",
  category: "隐患类型",
  title: "标题",
  description: "问题描述",
  suggestion: "整改建议",
  severity: "风险等级",
  owner: "责任人",
  reviewer: "复核人",
  due: "期限",
  beforeEvidence: "整改前证据"
};

const csvFieldAliases: Record<CsvFieldKey, string[]> = {
  code: ["编号", "单号", "隐患编号", "code", "id"],
  project: ["项目", "项目名称", "客户项目", "project"],
  location: ["点位", "位置", "区域", "楼层位置", "location", "area"],
  category: ["隐患类型", "类型", "类别", "category", "type"],
  title: ["标题", "隐患标题", "问题标题", "title"],
  description: ["问题描述", "描述", "隐患描述", "检查问题", "description", "desc"],
  suggestion: ["整改建议", "建议", "整改要求", "处理建议", "suggestion"],
  severity: ["风险等级", "等级", "风险级别", "severity", "risk"],
  owner: ["责任人", "整改责任人", "负责人", "owner", "assignee"],
  reviewer: ["复核人", "验收人", "检查人", "reviewer", "checker"],
  due: ["整改期限", "期限", "截止日期", "due", "deadline"],
  beforeEvidence: ["整改前证据", "证据", "现场证据", "照片", "beforeEvidence", "evidence"]
};

const csvFields = Object.keys(csvFieldLabels) as CsvFieldKey[];

const initialHazards: Hazard[] = [
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
  },
  {
    id: "hz-003",
    code: "XF-2026-003",
    project: "星河产业园",
    location: "2 号楼 6F 东侧防火门",
    category: "防火门",
    title: "防火门闭门器失效",
    description: "防火门无法自动闭合，存在防火分隔失效风险。",
    suggestion: "维修或更换闭门器，复核时需现场视频或前后对比照片。",
    status: "已驳回",
    severity: "重大",
    owner: "外包维修-赵师傅",
    reviewer: "园区安全-林主管",
    due: "2026-06-07",
    beforeEvidence: ["维保报告第 8 项", "整改前视频"],
    afterEvidence: ["维修完成照片"],
    rejectReason: "照片无法证明防火门可自动闭合，请补充短视频。",
    updated: "昨天 18:30",
    logs: ["外包维修提交整改", "园区安全-林主管驳回：证据不足", "逾期升级给物业经理"]
  },
  {
    id: "hz-004",
    code: "XF-2026-004",
    project: "云帆物流仓",
    location: "一层西侧货架区",
    category: "喷淋遮挡",
    title: "货物堆放高度遮挡喷淋",
    description: "货物堆放高度过高，影响喷淋覆盖范围。",
    suggestion: "调整堆放高度并保留喷淋下方安全距离。",
    status: "已闭环",
    severity: "普通",
    owner: "仓储主管-刘主管",
    reviewer: "维保项目-许工",
    due: "2026-06-06",
    beforeEvidence: ["整改前照片 3 张"],
    afterEvidence: ["整改后照片 3 张", "复核照片 1 张"],
    closedAt: "2026-06-06 16:18",
    updated: "2026-06-06",
    logs: ["责任人提交整改", "维保项目-许工复核通过", "已进入月度闭环包"]
  }
];

const initialChat: ChatMessage[] = [
  { from: "消防维保-李工", body: "已上传本月维保报告，发现 4 条需要甲方整改的问题。", time: "09:05", kind: "normal" },
  { from: "整改闭环助手", body: "已从报告拆出 4 条隐患单，其中 1 条重大、1 条紧急，已生成责任人整改链接。", time: "09:06", kind: "robot" },
  { from: "物业工程-陈工", body: "B1 通道杂物我今天处理，处理后直接在链接里传照片。", time: "09:14", kind: "normal" },
  { from: "整改闭环助手", body: "提醒：2 号楼 6F 防火门闭门器整改已驳回，需补充自动闭合视频。", time: "18:30", kind: "warning" }
];

function parseRoute(): RouteState {
  const [mode, id] = window.location.hash.replace("#", "").split("/");
  if (mode === "rectify" || mode === "review") return { mode, id };
  return { mode: "workspace" };
}

function inferCategory(text: string) {
  if (text.includes("通道") || text.includes("疏散")) return "消防通道";
  if (text.includes("灭火器")) return "灭火器";
  if (text.includes("防火门")) return "防火门";
  if (text.includes("喷淋")) return "喷淋遮挡";
  if (text.includes("应急照明")) return "应急照明";
  if (text.includes("报警")) return "报警系统";
  return "待分类";
}

function inferSeverity(text: string): Severity {
  if (text.includes("重大") || text.includes("失效") || text.includes("堵塞")) return "重大";
  if (text.includes("遮挡") || text.includes("占用") || text.includes("不足")) return "紧急";
  return "普通";
}

function todayText() {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date());
}

function buildAppLink(mode: "rectify" | "review", id: string) {
  return `${PUBLIC_BASE}${window.location.pathname}#${mode}/${id}`;
}

function extractEvidenceUrl(item: string) {
  const match = item.match(/\((https?:\/\/[^)]+|\/uploads\/[^)]+)\)/) ?? item.match(/(https?:\/\/\S+|\/uploads\/\S+)/);
  if (!match) return "";
  const rawUrl = match[1];
  return rawUrl.startsWith("/uploads") ? `${PUBLIC_BASE}${rawUrl}` : rawUrl;
}

function isImageUrl(url: string) {
  return /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] || char));
}

function renderEvidenceForPrint(items: string[], empty = "未提交") {
  const source = items.length ? items : [empty];
  return source
    .map((item) => {
      const url = extractEvidenceUrl(item);
      const image = url && isImageUrl(url);
      return `<li>${escapeHtml(item)}${image ? `<br><img class="evidence-thumb" src="${escapeHtml(url)}" alt="证据图片">` : ""}</li>`;
    })
    .join("");
}

function buildGroupMessage(kind: "rectify" | "review" | "reminder", hazard: Hazard) {
  if (kind === "rectify") {
    return `【消防隐患整改】\n${hazard.code} ${hazard.title}\n项目：${hazard.project}\n点位：${hazard.location}\n责任人：${hazard.owner}\n整改期限：${hazard.due}\n整改要求：${hazard.suggestion}\n整改链接：${buildAppLink("rectify", hazard.id)}`;
  }
  if (kind === "review") {
    return `【消防隐患复核】\n${hazard.code} ${hazard.title}\n项目：${hazard.project}\n点位：${hazard.location}\n复核人：${hazard.reviewer}\n当前状态：${hazard.status}\n整改后证据：${hazard.afterEvidence.length} 项\n复核链接：${buildAppLink("review", hazard.id)}`;
  }
  return `【消防整改催办】\n${hazard.code} ${hazard.title}\n点位：${hazard.location}\n责任人：${hazard.owner}\n期限：${hazard.due}\n当前状态：${hazard.status}\n催办级别：${hazard.escalationLevel || "一级催办"}\n累计催办：${hazard.reminderCount || 0} 次\n整改链接：${buildAppLink("rectify", hazard.id)}`;
}

function canSubmitEvidence(status: Status) {
  return status === "待整改" || status === "已驳回" || status === "已逾期";
}

function useStoredHazards() {
  const [hazards, setHazards] = useState<Hazard[]>(() => {
    const cached = window.localStorage.getItem("fire-closure-hazards");
    if (!cached) return initialHazards;
    try {
      return JSON.parse(cached) as Hazard[];
    } catch {
      return initialHazards;
    }
  });
  const apiLoaded = useRef(false);

  useEffect(() => {
    fetch(`${API_BASE}/hazards`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("api unavailable"))))
      .then((remoteHazards: Hazard[]) => {
        if (Array.isArray(remoteHazards) && remoteHazards.length > 0) {
          setHazards(remoteHazards);
        }
        apiLoaded.current = true;
      })
      .catch(() => {
        apiLoaded.current = true;
      });
  }, []);

  useEffect(() => {
    window.localStorage.setItem("fire-closure-hazards", JSON.stringify(hazards));
  }, [hazards]);

  return [hazards, setHazards] as const;
}

function useStoredProjectConfig() {
  const [config, setConfig] = useState<ProjectConfig>(() => {
    const cached = window.localStorage.getItem("fire-closure-project-config");
    if (!cached) return defaultProjectConfig;
    try {
      const parsed = JSON.parse(cached) as Partial<ProjectConfig>;
      return normalizeProjectConfig(parsed);
    } catch {
      return defaultProjectConfig;
    }
  });
  const apiLoaded = useRef(false);

  useEffect(() => {
    fetch(`${API_BASE}/project-config`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("config unavailable"))))
      .then((remoteConfig: ProjectConfig) => {
        setConfig(normalizeProjectConfig(remoteConfig));
        apiLoaded.current = true;
      })
      .catch(() => {
        apiLoaded.current = true;
      });
  }, []);

  useEffect(() => {
    window.localStorage.setItem("fire-closure-project-config", JSON.stringify(config));
    if (!apiLoaded.current) return;
    fetch(`${API_BASE}/project-config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config)
    }).catch(() => undefined);
  }, [config]);

  return [config, setConfig] as const;
}

function normalizeNameList(values: string[] | string, includePending = false) {
  const source = Array.isArray(values) ? values : values.split(/[\n,，;；]+/);
  const cleaned = source.map((value) => value.trim()).filter(Boolean);
  const list = includePending ? ["待分派", ...cleaned] : cleaned;
  return Array.from(new Set(list));
}

function normalizeDueDays(value: unknown, fallback = 7) {
  const days = Number(value);
  return Number.isFinite(days) && days > 0 && days <= 365 ? Math.round(days) : fallback;
}

function normalizeProjectConfig(config: Partial<ProjectConfig>): ProjectConfig {
  const rules = config.assignmentRules || defaultProjectConfig.assignmentRules!;
  const keywordRules = Array.isArray(rules.keywordRules) ? rules.keywordRules : defaultProjectConfig.assignmentRules!.keywordRules || [];
  const normalizedRules = keywordRules.map((rule, index) => ({
    id: rule.id || `rule-${index + 1}`,
    label: rule.label || `规则 ${index + 1}`,
    keywords: Array.isArray(rule.keywords) ? rule.keywords.map((keyword) => String(keyword).trim()).filter(Boolean) : [],
        owner: rule.owner || rules.fallbackOwner || defaultProjectConfig.assignmentRules!.fallbackOwner,
        reviewer: rule.reviewer || rules.fallbackReviewer || defaultProjectConfig.assignmentRules!.fallbackReviewer,
        dueDays: normalizeDueDays(rule.dueDays || rules.dueDays, defaultProjectConfig.assignmentRules!.dueDays)
      })).filter((rule) => rule.keywords.length > 0 && rule.owner);
  const owners = normalizeNameList([
    ...(Array.isArray(config.owners) ? config.owners : defaultProjectConfig.owners),
    rules.fallbackOwner || defaultProjectConfig.assignmentRules!.fallbackOwner,
    ...normalizedRules.map((rule) => rule.owner)
  ], true);
  const reviewers = normalizeNameList([
    ...(Array.isArray(config.reviewers) ? config.reviewers : defaultProjectConfig.reviewers),
    rules.fallbackReviewer || defaultProjectConfig.assignmentRules!.fallbackReviewer,
    ...normalizedRules.map((rule) => rule.reviewer || "")
  ]);
  return {
    ...defaultProjectConfig,
    ...config,
    schemaVersion: 2,
    templateId: config.templateId || defaultProjectConfig.templateId,
    industry: config.industry || defaultProjectConfig.industry,
    owners,
    reviewers,
    assignmentRules: {
      fallbackOwner: rules.fallbackOwner || defaultProjectConfig.assignmentRules!.fallbackOwner,
      fallbackReviewer: rules.fallbackReviewer || defaultProjectConfig.assignmentRules!.fallbackReviewer,
      dueDays: normalizeDueDays(rules.dueDays, defaultProjectConfig.assignmentRules!.dueDays),
      keywordRules: normalizedRules
    }
  };
}

function addDays(dateText: string, days: number) {
  const base = isValidDateText(dateText) ? new Date(`${dateText}T00:00:00+08:00`) : new Date();
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}

function mostCommon(values: string[], fallback: string) {
  const counts = values.filter(Boolean).reduce<Record<string, number>>((acc, value) => ({ ...acc, [value]: (acc[value] || 0) + 1 }), {});
  const [winner] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || [];
  return winner || fallback;
}

function matchAssignmentRule(hazard: Pick<Hazard, "category" | "title" | "description" | "location">, config: ProjectConfig) {
  const rules = config.assignmentRules?.keywordRules || [];
  const text = `${hazard.category}${hazard.title}${hazard.description}${hazard.location}`.toLowerCase();
  return rules.find((rule) => rule.keywords.some((keyword) => text.includes(keyword.toLowerCase())));
}

function splitCsvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function emptyCsvMapping(): CsvFieldMapping {
  return csvFields.reduce((acc, field) => ({ ...acc, [field]: "" }), {} as CsvFieldMapping);
}

function detectCsvMapping(headers: string[]): CsvFieldMapping {
  const normalizedHeaders = headers.map((header) => ({ raw: header, normalized: header.trim().toLowerCase() }));
  return csvFields.reduce((mapping, field) => {
    const aliases = csvFieldAliases[field].map((alias) => alias.toLowerCase());
    const exact = normalizedHeaders.find((header) => aliases.includes(header.normalized));
    const fuzzy = exact || normalizedHeaders.find((header) => aliases.some((alias) => header.normalized.includes(alias) || alias.includes(header.normalized)));
    return { ...mapping, [field]: fuzzy?.raw || "" };
  }, emptyCsvMapping());
}

function isValidDateText(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00+08:00`);
  return !Number.isNaN(date.getTime());
}

function getMappedCsvValue(row: Record<string, string>, mapping: CsvFieldMapping, field: CsvFieldKey) {
  const header = mapping[field];
  return header ? (row[header] || "").trim() : "";
}

function normalizeSeverity(value: string, fallbackText: string): Severity {
  if (value.includes("重大")) return "重大";
  if (value.includes("紧急") || value.includes("高")) return "紧急";
  if (value.includes("普通") || value.includes("一般") || value.includes("低")) return "普通";
  return inferSeverity(fallbackText);
}

function createHazardFromCsvRow(
  row: Record<string, string>,
  index: number,
  config: ProjectConfig,
  existingCount: number,
  mapping: CsvFieldMapping
): Hazard {
  const description = getMappedCsvValue(row, mapping, "description");
  const title = getMappedCsvValue(row, mapping, "title");
  const location = getMappedCsvValue(row, mapping, "location");
  const sourceText = `${title}${location}${description}`;

  const next = existingCount + index + 1;
  const category = getMappedCsvValue(row, mapping, "category") || inferCategory(sourceText);
  const severity = normalizeSeverity(getMappedCsvValue(row, mapping, "severity"), sourceText);
  const code = getMappedCsvValue(row, mapping, "code") || `XF-IMP-${String(next).padStart(3, "0")}`;
  const owner = getMappedCsvValue(row, mapping, "owner") || config.owners.find((item) => item !== "待分派") || "待分派";
  const reviewer = getMappedCsvValue(row, mapping, "reviewer") || config.reviewers[0] || config.maintainerName;
  const due = getMappedCsvValue(row, mapping, "due") || config.defaultDue;
  const beforeEvidence = getMappedCsvValue(row, mapping, "beforeEvidence");

  return {
    id: `csv-${Date.now()}-${index}`,
    code,
    project: getMappedCsvValue(row, mapping, "project") || config.projectName,
    location: location || "待确认点位",
    category,
    title: title || `${category}隐患整改`,
    description: description || sourceText || "历史台账导入隐患，请补充问题描述。",
    suggestion: getMappedCsvValue(row, mapping, "suggestion") || "请按维保建议完成整改，并提交整改后照片/视频。",
    status: "待分派",
    severity,
    owner,
    reviewer,
    due,
    beforeEvidence: beforeEvidence ? [beforeEvidence] : ["CSV 台账导入，待补充现场证据"],
    afterEvidence: [],
    updated: "刚刚",
    logs: ["CSV 台账导入预览确认后生成，等待分派或整改"]
  };
}

function buildCsvImportState({
  fileName,
  headers,
  rows,
  mapping,
  config,
  existingHazards
}: {
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
  mapping: CsvFieldMapping;
  config: ProjectConfig;
  existingHazards: Hazard[];
}): CsvImportState {
  const issues: CsvValidationIssue[] = [];
  const hazards: Hazard[] = [];
  const seenCodes = new Set(existingHazards.map((hazard) => hazard.code));
  const ownerSet = new Set(normalizeNameList(config.owners, true));
  const reviewerSet = new Set(normalizeNameList(config.reviewers));
  const unknownOwners = new Set<string>();
  const unknownReviewers = new Set<string>();

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const values = csvFields.reduce((acc, field) => ({ ...acc, [field]: getMappedCsvValue(row, mapping, field) }), {} as Record<CsvFieldKey, string>);
    if (!Object.values(values).some(Boolean)) return;

    if (!values.location) issues.push({ row: rowNumber, field: "点位", message: "点位不能为空", level: "error" });
    if (!values.title && !values.description) issues.push({ row: rowNumber, field: "标题/描述", message: "标题和问题描述至少填一项", level: "error" });
    if (values.due && !isValidDateText(values.due)) issues.push({ row: rowNumber, field: "期限", message: "期限必须是 YYYY-MM-DD", level: "error" });
    if (values.code && seenCodes.has(values.code)) issues.push({ row: rowNumber, field: "编号", message: `编号重复：${values.code}`, level: "error" });
    if (values.owner && !ownerSet.has(values.owner)) {
      unknownOwners.add(values.owner);
      issues.push({ row: rowNumber, field: "责任人", message: `责任人不在项目名单：${values.owner}`, level: "warning" });
    }
    if (values.reviewer && !reviewerSet.has(values.reviewer)) {
      unknownReviewers.add(values.reviewer);
      issues.push({ row: rowNumber, field: "复核人", message: `复核人不在项目名单：${values.reviewer}`, level: "warning" });
    }

    const rowErrors = issues.some((issue) => issue.row === rowNumber && issue.level === "error");
    if (rowErrors) return;
    const baseHazard = createHazardFromCsvRow(row, index, config, existingHazards.length, mapping);
    const rule = !values.owner ? matchAssignmentRule(baseHazard, config) : undefined;
    if (!values.owner && rule) {
      issues.push({ row: rowNumber, field: "模板规则", message: `命中 ${rule.label}，建议责任人 ${rule.owner}`, level: "warning" });
    }
    if (!values.owner && !rule) {
      issues.push({ row: rowNumber, field: "模板规则", message: "未命中关键词规则，将使用默认责任人", level: "warning" });
    }
    const hazard = rule
      ? {
          ...baseHazard,
          owner: rule.owner,
          reviewer: rule.reviewer || baseHazard.reviewer,
          due: addDays(new Date().toISOString().slice(0, 10), rule.dueDays || config.assignmentRules?.dueDays || 7),
          logs: [`按模板规则建议分派：${rule.label} -> ${rule.owner}`, ...baseHazard.logs]
        }
      : baseHazard;
    seenCodes.add(hazard.code);
    hazards.push(hazard);
  });

  return {
    fileName,
    headers,
    mapping,
    hazards,
    issues,
    invalidRows: issues.filter((issue) => issue.level === "error").map((issue) => `第 ${issue.row} 行 ${issue.field}：${issue.message}`),
    unknownOwners: Array.from(unknownOwners),
    unknownReviewers: Array.from(unknownReviewers)
  };
}

function App() {
  const [hazards, setHazards] = useStoredHazards();
  const [projectConfig, setProjectConfig] = useStoredProjectConfig();
  const [messages, setMessages] = useState<ChatMessage[]>(initialChat);
  const [selectedId, setSelectedId] = useState(hazards[0]?.id ?? initialHazards[0].id);
  const [query, setQuery] = useState("");
  const [evidenceDraft, setEvidenceDraft] = useState("");
  const [reportText, setReportText] = useState(
    "B1 疏散通道堆放纸箱，建议清理并上传整改后照片。\n3F 商户灭火器压力不足，建议更换或重新充装。\n2号楼6F 防火门闭门器失效，建议维修并提交自动闭合视频。"
  );
  const [notice, setNotice] = useState("");
  const [health, setHealth] = useState<HealthState | null>(null);
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [batchOwner, setBatchOwner] = useState(defaultProjectConfig.owners[1]);
  const [batchReviewer, setBatchReviewer] = useState(defaultProjectConfig.reviewers[0]);
  const [batchDue, setBatchDue] = useState(defaultProjectConfig.defaultDue);
  const [csvImport, setCsvImport] = useState<CsvImportState | null>(null);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [assignmentSuggestion, setAssignmentSuggestion] = useState<AssignmentSuggestion | null>(null);
  const [drillRecord, setDrillRecord] = useState<DrillRecord | null>(null);
  const [route, setRoute] = useState<RouteState>(() => parseRoute());

  const ownerOptions = useMemo(() => normalizeNameList(projectConfig.owners, true), [projectConfig.owners]);
  const reviewerOptions = useMemo(() => normalizeNameList(projectConfig.reviewers), [projectConfig.reviewers]);

  useEffect(() => {
    const syncRoute = () => setRoute(parseRoute());
    window.addEventListener("hashchange", syncRoute);
    return () => window.removeEventListener("hashchange", syncRoute);
  }, []);

  useEffect(() => {
    if (route.id) setSelectedId(route.id);
  }, [route.id]);

  const selected = hazards.find((hazard) => hazard.id === route.id) ?? hazards.find((hazard) => hazard.id === selectedId) ?? hazards[0];
  const filtered = useMemo(() => {
    return hazards.filter((hazard) =>
      `${hazard.code}${hazard.project}${hazard.location}${hazard.title}${hazard.owner}`.toLowerCase().includes(query.toLowerCase())
    );
  }, [hazards, query]);

  const stats = useMemo(() => {
    const overdue = hazards.filter((hazard) => hazard.status === "已逾期" || hazard.status === "已驳回").length;
    const reviewing = hazards.filter((hazard) => hazard.status === "待复核").length;
    const open = hazards.filter((hazard) => !["已闭环"].includes(hazard.status)).length;
    const closedRate = hazards.length ? Math.round((hazards.filter((hazard) => hazard.status === "已闭环").length / hazards.length) * 100) : 0;
    const assigned = hazards.filter((hazard) => hazard.owner && hazard.owner !== "待分派").length;
    const submitted = hazards.filter((hazard) => hazard.afterEvidence.length > 0).length;
    return { overdue, reviewing, open, closedRate, assigned, submitted };
  }, [hazards]);

  function refreshHealth() {
    fetch(`${API_BASE}/health`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("health unavailable"))))
      .then((payload: HealthState) => setHealth(payload))
      .catch(() => setHealth(null));
  }

  useEffect(() => {
    refreshHealth();
  }, []);

  useEffect(() => {
    if (!ownerOptions.includes(batchOwner)) setBatchOwner(ownerOptions.find((owner) => owner !== "待分派") || "待分派");
    if (!reviewerOptions.includes(batchReviewer)) setBatchReviewer(reviewerOptions[0] || projectConfig.maintainerName);
    if (projectConfig.defaultDue && batchDue !== projectConfig.defaultDue) setBatchDue(projectConfig.defaultDue);
  }, [ownerOptions, reviewerOptions, projectConfig.defaultDue, projectConfig.maintainerName]);

  function currentTemplateName(config = projectConfig) {
    return projectTemplates.find((template) => template.id === config.templateId)?.name || config.industry || "自定义客户模板";
  }

  function applyProjectTemplate(templateId: string) {
    const template = projectTemplates.find((item) => item.id === templateId);
    if (!template) return;
    const nextConfig = normalizeProjectConfig(template.config);
    setProjectConfig(nextConfig);
    setBatchOwner(nextConfig.assignmentRules?.fallbackOwner || nextConfig.owners.find((owner) => owner !== "待分派") || "待分派");
    setBatchReviewer(nextConfig.assignmentRules?.fallbackReviewer || nextConfig.reviewers[0] || nextConfig.maintainerName);
    setBatchDue(nextConfig.defaultDue);
    setNotice(`已套用客户模板：${template.name}。请按真实客户修改项目名称和人员名单。`);
  }

  function buildAssignmentSuggestion(importedHazards: Hazard[]): AssignmentSuggestion {
    const fallbackOwner = projectConfig.assignmentRules?.fallbackOwner || ownerOptions.find((owner) => owner !== "待分派") || projectConfig.maintainerName;
    const fallbackReviewer = projectConfig.assignmentRules?.fallbackReviewer || reviewerOptions[0] || projectConfig.maintainerName;
    const items = importedHazards.map((hazard) => {
      const rule = matchAssignmentRule(hazard, projectConfig);
      return {
        id: hazard.id,
        code: hazard.code,
        title: hazard.title,
        owner: hazard.owner === "待分派" ? rule?.owner || fallbackOwner : hazard.owner,
        reviewer: rule?.reviewer || hazard.reviewer || fallbackReviewer,
        due: hazard.due || addDays(new Date().toISOString().slice(0, 10), rule?.dueDays || projectConfig.assignmentRules?.dueDays || 7),
        ruleLabel: rule?.label || "默认规则"
      };
    });
    const suggestedOwner = mostCommon(items.map((item) => item.owner), fallbackOwner);
    const suggestedReviewer = mostCommon(items.map((item) => item.reviewer), fallbackReviewer);
    const suggestedDue = mostCommon(items.map((item) => item.due), projectConfig.defaultDue || addDays(new Date().toISOString().slice(0, 10), projectConfig.assignmentRules?.dueDays || 7));
    const matchedCount = items.filter((item) => item.ruleLabel !== "默认规则").length;
    return {
      ids: importedHazards.map((hazard) => hazard.id),
      owner: suggestedOwner,
      reviewer: suggestedReviewer,
      due: suggestedDue,
      reason: `基于 ${matchedCount} 条规则命中和 ${importedHazards.length - matchedCount} 条默认规则生成`,
      matchedCount,
      items
    };
  }

  async function applyAssignmentSuggestion() {
    if (!assignmentSuggestion) {
      setNotice("暂无可应用的批量分派建议。");
      return;
    }
    setBatchIds(assignmentSuggestion.ids);
    setBatchOwner(assignmentSuggestion.owner);
    setBatchReviewer(assignmentSuggestion.reviewer);
    setBatchDue(assignmentSuggestion.due);
    for (const item of assignmentSuggestion.items) {
      await runHazardAction(
        item.id,
        {
          action: "assign",
          owner: item.owner,
          reviewer: item.reviewer,
          due: item.due,
          log: `按模板规则批量分派：${item.ruleLabel} -> ${item.owner}`
        },
        (hazard) => ({
          ...hazard,
          owner: item.owner,
          reviewer: item.reviewer,
          due: item.due,
          status: "待整改",
          updated: "刚刚",
          logs: [`按模板规则批量分派：${item.ruleLabel} -> ${item.owner}`, ...hazard.logs]
        })
      );
    }
    setNotice(`已按模板规则分派 ${assignmentSuggestion.items.length} 条隐患，其中 ${assignmentSuggestion.matchedCount} 条命中关键词规则。`);
  }

  async function previewCsvImport(file: File) {
    try {
      const text = await file.text();
      const rows = splitCsvRows(text.replace(/^\uFEFF/, ""));
      if (rows.length < 2) {
        setNotice("CSV 至少需要表头和 1 行隐患数据。");
        setCsvImport(null);
        return;
      }
      const headers = rows[0].map((header) => header.trim());
      const parsedRows = rows.slice(1).map((values) =>
        headers.reduce<Record<string, string>>((acc, header, headerIndex) => {
          acc[header] = values[headerIndex] || "";
          return acc;
        }, {})
      );
      const nextImport = buildCsvImportState({
        fileName: file.name,
        headers,
        rows: parsedRows,
        mapping: detectCsvMapping(headers),
        config: projectConfig,
        existingHazards: hazards
      });
      setCsvRows(parsedRows);
      setCsvImport(nextImport);
      setNotice(`已解析 ${nextImport.hazards.length} 条可导入隐患，发现 ${nextImport.issues.length} 个校验提示。确认后才会写入工作流。`);
    } catch {
      setNotice("CSV 解析失败，请确认文件为 UTF-8 编码且使用英文逗号分隔。");
      setCsvImport(null);
    }
  }

  function updateCsvMapping(field: CsvFieldKey, header: string) {
    if (!csvImport) return;
    const nextImport = buildCsvImportState({
      fileName: csvImport.fileName,
      headers: csvImport.headers,
      rows: csvRows,
      mapping: { ...csvImport.mapping, [field]: header },
      config: projectConfig,
      existingHazards: hazards
    });
    setCsvImport(nextImport);
    setNotice(`字段映射已更新：${nextImport.hazards.length} 条可导入，${nextImport.invalidRows.length} 个阻断问题。`);
  }

  function addCsvPeopleToConfig() {
    if (!csvImport) return;
    setProjectConfig({
      ...projectConfig,
      owners: normalizeNameList([...projectConfig.owners, ...csvImport.unknownOwners], true),
      reviewers: normalizeNameList([...projectConfig.reviewers, ...csvImport.unknownReviewers])
    });
    const nextImport = buildCsvImportState({
      fileName: csvImport.fileName,
      headers: csvImport.headers,
      rows: csvRows,
      mapping: csvImport.mapping,
      config: {
        ...projectConfig,
        owners: normalizeNameList([...projectConfig.owners, ...csvImport.unknownOwners], true),
        reviewers: normalizeNameList([...projectConfig.reviewers, ...csvImport.unknownReviewers])
      },
      existingHazards: hazards
    });
    setCsvImport(nextImport);
    setNotice("已把 CSV 中的新责任人/复核人加入项目名单。");
  }

  function confirmCsvImport(mode: "append" | "replace") {
    if (!csvImport || csvImport.hazards.length === 0) {
      setNotice("没有可导入的隐患数据。");
      return;
    }
    if (csvImport.invalidRows.length > 0) {
      setNotice(`CSV 仍有 ${csvImport.invalidRows.length} 个阻断问题，请先修正字段映射或源文件。`);
      return;
    }
    const importedHazards = csvImport.hazards;
    const suggestion = buildAssignmentSuggestion(importedHazards);
    const nextHazards = mode === "replace" ? csvImport.hazards : [...csvImport.hazards, ...hazards];
    void saveHazardsBulk(nextHazards, "CSV 导入保存失败");
    setSelectedId(importedHazards[0].id);
    setBatchIds(suggestion.ids);
    setBatchOwner(suggestion.owner);
    setBatchReviewer(suggestion.reviewer);
    setBatchDue(suggestion.due);
    setAssignmentSuggestion(suggestion);
    setDrillRecord({
      id: `drill-${Date.now()}`,
      at: todayText(),
      customerName: projectConfig.customerName,
      projectName: projectConfig.projectName,
      templateName: currentTemplateName(),
      fileName: csvImport.fileName,
      importedCount: importedHazards.length,
      blockingCount: csvImport.issues.filter((issue) => issue.level === "error").length,
      warningCount: csvImport.issues.filter((issue) => issue.level === "warning").length,
      matchedRuleCount: suggestion.matchedCount,
      suggestedOwner: suggestion.owner,
      suggestedReviewer: suggestion.reviewer,
      suggestedDue: suggestion.due
    });
    appendRobotMessage(
      `已${mode === "replace" ? "替换为" : "追加"} ${importedHazards.length} 条 CSV 隐患，已生成批量分派建议和导入演练记录。`
    );
    setNotice(`CSV 导入完成：${importedHazards.length} 条隐患已进入工作流，并已选中用于批量分派。`);
    setCsvImport(null);
    setCsvRows([]);
  }

  function downloadCsvTemplate() {
    const rows = [
      ["编号", "项目", "点位", "隐患类型", "标题", "问题描述", "整改建议", "风险等级", "责任人", "复核人", "期限", "整改前证据"],
      [
        "XF-IMP-001",
        projectConfig.projectName,
        "1F 东侧疏散通道",
        "消防通道",
        "疏散通道堆放杂物",
        "现场发现纸箱占用疏散通道，影响人员疏散。",
        "清理杂物并上传整改后照片。",
        "紧急",
        ownerOptions.find((owner) => owner !== "待分派") || "",
        reviewerOptions[0] || "",
        projectConfig.defaultDue,
        "巡检照片 1 张"
      ]
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "消防隐患导入模板.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 300);
  }

  async function exportProjectConfig() {
    try {
      const response = await fetch(`${API_BASE}/project-config/export`);
      const payload = response.ok
        ? await response.json()
        : { kind: "strong-workflow.project-config", version: 2, exportedAt: new Date().toISOString(), config: normalizeProjectConfig(projectConfig) };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${projectConfig.customerName || "客户"}-工作流项目配置.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 300);
      setNotice("项目配置已导出，下一家客户可直接导入复用。");
    } catch {
      setNotice("配置导出失败，请确认 API 服务已启动。");
    }
  }

  async function importProjectConfig(file: File) {
    try {
      const payload = JSON.parse(await file.text()) as { config?: ProjectConfig } & Partial<ProjectConfig>;
      const nextConfig = payload.config || (payload as ProjectConfig);
      const response = await fetch(`${API_BASE}/project-config/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextConfig)
      });
      const result = (await response.json()) as { config?: ProjectConfig; error?: string };
      if (!response.ok || !result.config) throw new Error(result.error || "config import failed");
      setProjectConfig(normalizeProjectConfig(result.config));
      setNotice(`已导入项目配置：${result.config.projectName}`);
    } catch {
      setNotice("配置导入失败，请确认 JSON 包格式正确，且默认期限为 YYYY-MM-DD。");
    }
  }

  function exportDrillRecord() {
    if (!drillRecord) {
      setNotice("暂无导入演练记录，请先完成一次 CSV 导入。");
      return;
    }
    const markdown = [
      "# 导入演练记录",
      "",
      `- 演练编号：${drillRecord.id}`,
      `- 生成时间：${drillRecord.at}`,
      `- 客户名称：${drillRecord.customerName}`,
      `- 项目名称：${drillRecord.projectName}`,
      `- 客户模板：${drillRecord.templateName}`,
      `- CSV 文件：${drillRecord.fileName}`,
      `- 成功导入：${drillRecord.importedCount} 条`,
      `- 阻断问题：${drillRecord.blockingCount} 个`,
      `- 提醒问题：${drillRecord.warningCount} 个`,
      `- 规则命中：${drillRecord.matchedRuleCount} 条`,
      `- 建议责任人：${drillRecord.suggestedOwner}`,
      `- 建议复核人：${drillRecord.suggestedReviewer}`,
      `- 建议期限：${drillRecord.suggestedDue}`,
      "",
      "## 现场复核项",
      "",
      "- [ ] 客户配置已确认",
      "- [ ] CSV 字段映射已确认",
      "- [ ] 阻断问题已清零",
      "- [ ] 批量分派建议已确认",
      "- [ ] 整改链接可复制并发送",
      "- [ ] 复核链接可复制并发送",
      "- [ ] PDF 闭环包可导出"
    ].join("\n");
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${drillRecord.customerName}-导入演练记录.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 300);
    setNotice("导入演练记录已生成，可作为客户试点交付附件。");
  }

  if (!selected) {
    return (
      <main className="app">
        <section className="panel empty-state">
          <h1>暂无隐患数据</h1>
          <p>请先生成 30 条试点隐患，或检查本地 API 服务是否已启动。</p>
          <button onClick={seedPilot30}>
            <ClipboardCheck size={17} />
            生成30条试点
          </button>
        </section>
      </main>
    );
  }

  function appendRobotMessage(body: string, kind: ChatMessage["kind"] = "robot") {
    setMessages((current) => [{ from: "整改闭环助手", body, time: "刚刚", kind }, ...current]);
  }

  function notifyRobot(title: string, text: string, source = "manual") {
    fetch(`${API_BASE}/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, text, source })
    })
      .then(() => refreshHealth())
      .catch(() => undefined);
  }

  async function saveHazardsBulk(nextHazards: Hazard[], reason: string) {
    setHazards(nextHazards);
    try {
      const response = await fetch(`${API_BASE}/hazards`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextHazards)
      });
      if (!response.ok) throw new Error(reason);
    } catch {
      setNotice(`${reason}：本地已更新，但服务端保存失败，请检查 API 服务。`);
    }
  }

  function replaceLocalHazard(nextHazard: Hazard) {
    setHazards((current) => current.map((hazard) => (hazard.id === nextHazard.id ? nextHazard : hazard)));
  }

  async function runHazardAction(id: string, payload: Record<string, unknown>, fallback: (hazard: Hazard) => Hazard) {
    const currentHazard = hazards.find((hazard) => hazard.id === id);
    if (!currentHazard) return null;
    const fallbackHazard = fallback(currentHazard);
    replaceLocalHazard(fallbackHazard);
    try {
      const response = await fetch(`${API_BASE}/hazards/${id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = (await response.json()) as { ok?: boolean; hazard?: Hazard; error?: string };
      if (!response.ok || !result.hazard) throw new Error(result.error || "action failed");
      replaceLocalHazard(result.hazard);
      return result.hazard;
    } catch (error) {
      replaceLocalHazard(currentHazard);
      setNotice(`服务端状态机拒绝或保存失败：${String(error instanceof Error ? error.message : error)}`);
      return currentHazard;
    }
  }

  function toggleBatchId(id: string) {
    setBatchIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function selectFilteredBatch() {
    setBatchIds(filtered.filter((hazard) => hazard.status !== "已闭环").map((hazard) => hazard.id));
  }

  function clearBatch() {
    setBatchIds([]);
  }

  async function applyBatchAssign() {
    if (batchIds.length === 0) {
      setNotice("请先选择需要批量分派的隐患。");
      return;
    }
    const assignedCodes: string[] = [];
    const targets = hazards.filter((hazard) => batchIds.includes(hazard.id) && hazard.status !== "已闭环");
    for (const hazard of targets) {
      assignedCodes.push(hazard.code);
      await runHazardAction(
        hazard.id,
        {
          action: "assign",
          owner: batchOwner,
          reviewer: batchReviewer,
          due: batchDue,
          log: `批量分派给 ${batchOwner}，复核人 ${batchReviewer}，期限 ${batchDue}`
        },
        (currentHazard) => ({
          ...currentHazard,
          owner: batchOwner,
          reviewer: batchReviewer,
          due: batchDue,
          status: "待整改",
          updated: "刚刚",
          logs: [`批量分派给 ${batchOwner}，复核人 ${batchReviewer}，期限 ${batchDue}`, ...currentHazard.logs]
        })
      );
    }
    setNotice(`已批量分派 ${assignedCodes.length} 条隐患。`);
    appendRobotMessage(`已批量分派 ${assignedCodes.length} 条隐患给 ${batchOwner}，复核人 ${batchReviewer}。`);
    notifyRobot("批量分派完成", `${assignedCodes.join("、")}\n责任人：${batchOwner}\n复核人：${batchReviewer}\n期限：${batchDue}`, "assign");
  }

  async function runAutoReminder() {
    try {
      const response = await fetch(`${API_BASE}/reminders/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true })
      });
      if (!response.ok) throw new Error("reminder failed");
      const payload = (await response.json()) as { count: number };
      const remote = await fetch(`${API_BASE}/hazards`);
      if (remote.ok) setHazards((await remote.json()) as Hazard[]);
      refreshHealth();
      setNotice(`已执行自动催办扫描，触发 ${payload.count} 条提醒。`);
      appendRobotMessage(`自动催办扫描完成，触发 ${payload.count} 条提醒。`, payload.count > 0 ? "warning" : "robot");
    } catch {
      setNotice("自动催办扫描失败，请确认本地 API 服务已启动。");
    }
  }

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(`${label}已复制，可直接粘贴到企业微信或钉钉群。`);
    } catch {
      setNotice(`${label}：${text}`);
    }
  }

  async function updateSelected<K extends keyof Hazard>(key: K, value: Hazard[K]) {
    setNotice("");
    const nextHazard = { ...selected, [key]: value, updated: "刚刚" };
    replaceLocalHazard(nextHazard);
    try {
      const response = await fetch(`${API_BASE}/hazards/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value })
      });
      const result = (await response.json()) as { hazard?: Hazard; error?: string };
      if (!response.ok || !result.hazard) throw new Error(result.error || "patch failed");
      replaceLocalHazard(result.hazard);
    } catch {
      setNotice("字段保存失败，本地已暂存，请检查 API 服务。");
    }
  }

  function createFromReport() {
    const lines = reportText
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    const source = lines.length ? lines : ["维保报告新发现隐患，请补充责任人和期限。"];
    const created: Hazard[] = source.map((line, index) => {
      const next = hazards.length + index + 1;
      const category = inferCategory(line);
      const severity = inferSeverity(line);
      const baseHazard: Hazard = {
        id: `hz-${String(next).padStart(3, "0")}`,
        code: `XF-2026-${String(next).padStart(3, "0")}`,
        project: projectConfig.projectName,
        location: line.split("，")[0] || "待确认点位",
        category,
        title: `${category}隐患整改`,
        description: line,
        suggestion: line.includes("建议") ? line.slice(line.indexOf("建议")) : "请按维保建议完成整改，并提交整改后照片/视频。",
        status: "待分派",
        severity,
        owner: "待分派",
        reviewer: reviewerOptions[0] || projectConfig.maintainerName,
        due: projectConfig.defaultDue,
        beforeEvidence: [`报告原文：${line}`],
        afterEvidence: [],
        updated: "刚刚",
        logs: ["从报告文本快拆生成，等待分派责任人"]
      };
      const rule = matchAssignmentRule(baseHazard, projectConfig);
      if (!rule) return baseHazard;
      return {
        ...baseHazard,
        owner: rule.owner,
        reviewer: rule.reviewer || baseHazard.reviewer,
        due: addDays(new Date().toISOString().slice(0, 10), rule.dueDays || projectConfig.assignmentRules?.dueDays || 7),
        logs: [`按模板规则建议分派：${rule.label} -> ${rule.owner}`, ...baseHazard.logs]
      };
    });
    void saveHazardsBulk([...created, ...hazards], "报告快拆保存失败");
    setSelectedId(created[0].id);
    appendRobotMessage(`已从报告文本拆出 ${created.length} 条隐患单，等待分派责任人。`);
  }

  async function seedPilot30() {
    const templates = [
      ["消防通道", "B1 停车场疏散通道堆放杂物", "清理杂物并上传整改后照片"],
      ["灭火器", "商户灭火器压力不足", "更换或重新充装灭火器并上传凭证"],
      ["防火门", "防火门闭门器失效", "维修闭门器并提交自动闭合视频"],
      ["喷淋遮挡", "货物堆放高度遮挡喷淋", "调整堆放高度并上传前后对比照片"],
      ["应急照明", "应急照明灯不亮", "更换灯具或电池并上传测试照片"],
      ["报警系统", "手动报警按钮标识脱落", "补齐标识并上传现场照片"]
    ];
    const createLocalPilot = (): Hazard[] => Array.from({ length: 30 }, (_, index) => {
      const [category, title, suggestion] = templates[index % templates.length];
      const number = hazards.length + index + 1;
      const severity: Severity = category === "防火门" || category === "消防通道" ? "紧急" : "普通";
      return {
        id: `hz-${String(number).padStart(3, "0")}`,
        code: `XF-2026-${String(number).padStart(3, "0")}`,
        project: projectConfig.projectName || "南城商业综合体试点",
        location: `${Math.floor(index / 6) + 1}F ${String.fromCharCode(65 + (index % 6))} 区`,
        category,
        title,
        description: `第 ${index + 1} 条试点隐患：${title}。`,
        suggestion,
        status: "待分派",
        severity,
        owner: "待分派",
        reviewer: reviewerOptions[0] || "安全负责人-周经理",
        due: projectConfig.defaultDue,
        beforeEvidence: [`试点报告第 ${index + 1} 项`],
        afterEvidence: [],
        updated: "刚刚",
        logs: ["30 条试点隐患批量生成，等待分派责任人"]
      };
    });
    let created: Hazard[] = createLocalPilot();
    try {
      const response = await fetch(`${API_BASE}/seed-pilot`, { method: "POST" });
      if (response.ok) {
        const payload = (await response.json()) as { hazards?: Hazard[] };
        if (Array.isArray(payload.hazards) && payload.hazards.length === 30) {
          created = payload.hazards;
        }
      }
    } catch {
      // 后端不可用时保留本地试点生成能力，方便客户现场演示。
    }
    setHazards(created);
    setSelectedId(created[0].id);
    appendRobotMessage("已为南城商业综合体试点生成 30 条隐患单，可直接验证批量分派、整改、复核和闭环包。");
  }

  async function seedRealTemplate() {
    let created: Hazard[] = [];
    try {
      const response = await fetch(`${API_BASE}/seed-real-template`, { method: "POST" });
      if (response.ok) {
        const payload = (await response.json()) as { hazards?: Hazard[] };
        if (Array.isArray(payload.hazards)) created = payload.hazards;
      }
    } catch {
      created = [];
    }
    if (created.length === 0) {
      setNotice("真实试点模板初始化失败，请确认本地 API 服务已启动。");
      return;
    }
    setHazards(created);
    setSelectedId(created[0].id);
    appendRobotMessage("已载入青浦智造产业园 30 条真实试点模板，包含预分派、待分派和不同风险等级。");
  }

  function assignOwner() {
    if (selected.status === "已闭环") {
      setNotice("该隐患已闭环，不能重新生成整改链接。");
      return;
    }
    if (!selected.owner || selected.owner === "待分派") {
      const rule = matchAssignmentRule(selected, projectConfig);
      const fallbackOwner = rule?.owner || ownerOptions.find((owner) => owner !== "待分派") || projectConfig.maintainerName;
      const fallbackReviewer = rule?.reviewer || selected.reviewer;
      const fallbackDue = rule ? addDays(new Date().toISOString().slice(0, 10), rule.dueDays || projectConfig.assignmentRules?.dueDays || 7) : selected.due;
      const log = rule ? `按模板规则分派：${rule.label} -> ${fallbackOwner}` : "系统按项目配置补齐默认责任人并生成整改链接";
      void runHazardAction(
        selected.id,
        {
          action: "assign",
          owner: fallbackOwner,
          reviewer: fallbackReviewer,
          due: fallbackDue,
          log
        },
        (hazard) => ({
          ...hazard,
          owner: fallbackOwner,
          reviewer: fallbackReviewer,
          due: fallbackDue,
          status: "待整改",
          updated: "刚刚",
          logs: [log, ...hazard.logs]
        })
      );
      appendRobotMessage(`${selected.code} 已分派给 ${fallbackOwner}，请在 ${fallbackDue} 前提交整改证据。`);
      notifyRobot("隐患已分派", buildGroupMessage("rectify", { ...selected, owner: fallbackOwner, reviewer: fallbackReviewer, due: fallbackDue }), "assign");
      return;
    }
    void runHazardAction(
      selected.id,
      {
        action: "assign",
        owner: selected.owner,
        reviewer: selected.reviewer,
        due: selected.due,
        log: `已分派给 ${selected.owner}，生成 H5 整改链接`
      },
      (hazard) => ({
        ...hazard,
        status: "待整改",
        updated: "刚刚",
        logs: [`已分派给 ${selected.owner}，生成 H5 整改链接`, ...hazard.logs]
      })
    );
    appendRobotMessage(`${selected.code} 已分派给 ${selected.owner}，整改链接已发送。`);
    notifyRobot("整改链接已生成", buildGroupMessage("rectify", selected), "assign");
  }

  function openRectifyLink() {
    window.location.hash = `rectify/${selected.id}`;
  }

  function openReviewLink() {
    window.location.hash = `review/${selected.id}`;
  }

  function submitEvidence() {
    if (!canSubmitEvidence(selected.status)) {
      setNotice("只有待整改、已驳回或已逾期的隐患可以提交整改证据。");
      return;
    }
    const value = evidenceDraft.trim();
    if (!value) {
      setNotice("请先填写整改后照片、视频或凭证名称。");
      return;
    }
    void runHazardAction(
      selected.id,
      { action: "submitEvidence", evidence: value, log: `${selected.owner} 提交整改证据：${value}` },
      (hazard) => ({
        ...hazard,
        status: "待复核",
        afterEvidence: Array.from(new Set([...hazard.afterEvidence, value])),
        updated: "刚刚",
        logs: [`${hazard.owner} 提交整改证据：${value}`, ...hazard.logs]
      })
    );
    setEvidenceDraft("");
    appendRobotMessage(`${selected.code} 已提交整改证据，等待 ${selected.reviewer} 复核。`);
    notifyRobot("整改证据已提交", buildGroupMessage("review", { ...selected, status: "待复核", afterEvidence: [...selected.afterEvidence, value] }), "evidence");
  }

  async function uploadEvidenceFile(file: File) {
    if (!canSubmitEvidence(selected.status)) {
      setNotice("只有待整改、已驳回或已逾期的隐患可以上传整改证据。");
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    try {
      const response = await fetch(`${API_BASE}/upload`, { method: "POST", body: formData });
      if (!response.ok) throw new Error("upload failed");
      const uploaded = (await response.json()) as { originalName: string; url: string; publicUrl?: string };
      const evidence = `${uploaded.originalName} (${uploaded.publicUrl || uploaded.url})`;
      void runHazardAction(
        selected.id,
        { action: "submitEvidence", evidence, log: `${selected.owner} 上传整改文件：${uploaded.originalName}` },
        (hazard) => ({
          ...hazard,
          status: "待复核",
          afterEvidence: Array.from(new Set([...hazard.afterEvidence, evidence])),
          updated: "刚刚",
          logs: [`${hazard.owner} 上传整改文件：${uploaded.originalName}`, ...hazard.logs]
        })
      );
      appendRobotMessage(`${selected.code} 已上传整改文件，等待 ${selected.reviewer} 复核。`);
      notifyRobot("整改文件已上传", buildGroupMessage("review", { ...selected, status: "待复核", afterEvidence: [...selected.afterEvidence, evidence] }), "evidence");
    } catch {
      setNotice("文件上传失败，请确认本地 API 服务已启动。");
    }
  }

  function approveReview() {
    if (selected.status !== "待复核") {
      setNotice("只有待复核的隐患可以复核通过。");
      return;
    }
    if (selected.afterEvidence.length === 0) {
      setNotice("没有整改后证据，不能复核通过。");
      return;
    }
    void runHazardAction(
      selected.id,
      { action: "approve", log: `${selected.reviewer} 复核通过，隐患闭环` },
      (hazard) => ({
        ...hazard,
        status: "已闭环",
        closedAt: todayText(),
        rejectReason: undefined,
        updated: "刚刚",
        logs: [`${hazard.reviewer} 复核通过，隐患闭环`, ...hazard.logs]
      })
    );
    appendRobotMessage(`${selected.code} 已闭环，已自动进入本月消防整改归档包。`);
    notifyRobot("隐患已闭环", `${selected.code} 已由 ${selected.reviewer} 复核通过，进入本月消防整改归档包。`, "review");
  }

  function rejectReview() {
    if (selected.status !== "待复核") {
      setNotice("只有待复核的隐患可以驳回补证据。");
      return;
    }
    void runHazardAction(
      selected.id,
      { action: "reject", reason: "证据不足，请补充整改后近景照片或短视频。", log: `${selected.reviewer} 驳回整改：证据不足` },
      (hazard) => ({
        ...hazard,
        status: "已驳回",
        rejectReason: "证据不足，请补充整改后近景照片或短视频。",
        updated: "刚刚",
        logs: [`${hazard.reviewer} 驳回整改：证据不足`, ...hazard.logs]
      })
    );
    appendRobotMessage(`${selected.code} 复核驳回，已通知 ${selected.owner} 补充证据。`, "warning");
    notifyRobot("复核驳回", `${selected.code} 复核驳回，已通知 ${selected.owner} 补充证据。\n${buildGroupMessage("rectify", selected)}`, "review");
  }

  function sendReminder() {
    if (selected.status === "已闭环") {
      setNotice("该隐患已闭环，不需要催办。");
      return;
    }
    void runHazardAction(
      selected.id,
      { action: "remind", log: `催办 ${selected.owner}，并记录逾期升级` },
      (hazard) => ({
        ...hazard,
        status: "已逾期",
        lastReminderAt: new Date().toISOString(),
        reminderCount: (hazard.reminderCount || 0) + 1,
        escalationLevel: (hazard.reminderCount || 0) + 1 >= 3 ? "三级升级" : (hazard.reminderCount || 0) + 1 >= 2 ? "二级升级" : "一级催办",
        updated: "刚刚",
        logs: [`催办 ${hazard.owner}，并记录逾期升级`, ...hazard.logs]
      })
    );
    appendRobotMessage(`${selected.code} 已催办 ${selected.owner}；若 24 小时内未处理，将升级给上级负责人。`, "warning");
    notifyRobot("整改催办/升级", buildGroupMessage("reminder", { ...selected, status: "已逾期", reminderCount: (selected.reminderCount || 0) + 1 }), "reminder");
  }

  function exportClosurePack() {
    // 轻量导出闭环包，先解决客户“月底交差”的刚需。
    const html = `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><title>消防整改闭环包</title><style>body{font-family:Microsoft YaHei,Arial,sans-serif;padding:28px;color:#17202a}h1{font-size:24px}.item{border:1px solid #d9e3e7;border-radius:8px;padding:14px;margin:12px 0}.muted{color:#697c84}.grid{display:grid;grid-template-columns:110px 1fr;gap:6px 12px}li{margin:4px 0}</style></head><body><h1>消防隐患整改闭环包</h1><p class="muted">生成时间：${todayText()}</p>${hazards
      .map(
        (hazard) =>
          `<section class="item"><h2>${hazard.code} ${hazard.title}</h2><div class="grid"><div>项目</div><div>${hazard.project}</div><div>点位</div><div>${hazard.location}</div><div>状态</div><div>${hazard.status}</div><div>责任人</div><div>${hazard.owner}</div><div>复核人</div><div>${hazard.reviewer}</div><div>期限</div><div>${hazard.due}</div></div><h3>整改前证据</h3><ul>${hazard.beforeEvidence.map((item) => `<li>${item}</li>`).join("")}</ul><h3>整改后证据</h3><ul>${hazard.afterEvidence.map((item) => `<li>${item}</li>`).join("") || "<li>未提交</li>"}</ul><h3>时间线</h3><ul>${hazard.logs.map((item) => `<li>${item}</li>`).join("")}</ul></section>`
      )
      .join("")}</body></html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "消防整改闭环包.html";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 300);
  }

  function exportPdfClosurePack() {
    const summary = {
      total: hazards.length,
      closed: hazards.filter((hazard) => hazard.status === "已闭环").length,
      reviewing: hazards.filter((hazard) => hazard.status === "待复核").length,
      overdue: hazards.filter((hazard) => hazard.status === "已逾期" || hazard.status === "已驳回").length,
      assigned: hazards.filter((hazard) => hazard.owner && hazard.owner !== "待分派").length,
      remediated: hazards.filter((hazard) => hazard.afterEvidence.length > 0).length
    };
    const rows = hazards
      .map(
        (hazard) => `
          <section class="item">
            <h2>${hazard.code} ${hazard.title}</h2>
            <div class="grid">
              <div>项目</div><div>${hazard.project}</div>
              <div>点位</div><div>${hazard.location}</div>
              <div>状态</div><div>${hazard.status}</div>
              <div>等级</div><div>${hazard.severity}</div>
              <div>责任人</div><div>${hazard.owner}</div>
              <div>复核人</div><div>${hazard.reviewer}</div>
              <div>期限</div><div>${hazard.due}</div>
            </div>
            <h3>整改前证据</h3>
            <ul>${renderEvidenceForPrint(hazard.beforeEvidence)}</ul>
            <h3>整改后证据</h3>
            <ul>${renderEvidenceForPrint(hazard.afterEvidence)}</ul>
            <h3>流程日志</h3>
            <ul>${hazard.logs.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
          </section>`
      )
      .join("");
    const html = `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><title>消防整改闭环包 PDF</title><style>
      @page{size:A4;margin:16mm}
      body{font-family:"Microsoft YaHei",Arial,sans-serif;color:#17202a;margin:0}
      h1{font-size:24px;margin:0 0 8px}
      h2{font-size:16px;margin:0 0 10px}
      h3{font-size:13px;margin:12px 0 6px}
      .muted{color:#697c84;font-size:12px}
      .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:16px 0}
      .summary div{border:1px solid #d9e3e7;border-radius:6px;padding:10px}
      .summary strong{display:block;font-size:20px}
      .cover{min-height:78vh;display:grid;align-content:center;border-bottom:3px solid #14746f;margin-bottom:18px}
      .cover h1{font-size:30px;margin-bottom:12px}
      .cover-grid{display:grid;grid-template-columns:110px 1fr;gap:8px 14px;margin:20px 0 26px;font-size:13px}
      .cover-grid div:nth-child(odd){color:#697c84;font-weight:700}
      .cover-note{border-left:4px solid #14746f;padding:10px 12px;background:#edf9f5;font-size:13px}
      .item{break-inside:avoid;border:1px solid #d9e3e7;border-radius:8px;padding:12px;margin:12px 0}
      .grid{display:grid;grid-template-columns:90px 1fr 90px 1fr;gap:6px 10px;font-size:12px}
      li{font-size:12px;margin:4px 0;word-break:break-all}
      .evidence-thumb{display:block;width:160px;max-height:120px;object-fit:cover;margin-top:6px;border:1px solid #d9e3e7;border-radius:6px}
      .toolbar{position:sticky;top:0;padding:10px 0 14px;background:#fff}
      button{height:36px;border:0;border-radius:6px;background:#14746f;color:#fff;font-weight:700;padding:0 14px}
      @media print{.toolbar{display:none}.cover{page-break-after:always}.item{page-break-inside:avoid}}
    </style></head><body>
      <div class="toolbar"><button onclick="window.print()">打印/另存为 PDF</button></div>
      <section class="cover">
        <p class="muted">消防整改闭环交付物</p>
        <h1>${escapeHtml(projectConfig.projectName)}<br>消防隐患整改闭环包</h1>
        <div class="cover-grid">
          <div>客户名称</div><div>${escapeHtml(projectConfig.customerName)}</div>
          <div>维保负责人</div><div>${escapeHtml(projectConfig.maintainerName)}</div>
          <div>生成时间</div><div>${escapeHtml(todayText())}</div>
          <div>系统地址</div><div>${escapeHtml(PUBLIC_BASE)}</div>
        </div>
        <div class="cover-note">本闭环包汇总隐患分派、整改提交、复核、驳回、催办和闭环记录，适用于试点项目内部汇报与月度归档。</div>
      </section>
      <h1>项目摘要</h1>
      <p class="muted">${escapeHtml(projectConfig.customerName)} · ${escapeHtml(projectConfig.maintainerName)}</p>
      <section class="summary">
        <div><span>隐患总数</span><strong>${summary.total}</strong></div>
        <div><span>已分派</span><strong>${summary.assigned}</strong></div>
        <div><span>已提交整改</span><strong>${summary.remediated}</strong></div>
        <div><span>已闭环</span><strong>${summary.closed}</strong></div>
        <div><span>待复核</span><strong>${summary.reviewing}</strong></div>
        <div><span>逾期/驳回</span><strong>${summary.overdue}</strong></div>
      </section>
      ${rows}
    </body></html>`;
    const win = window.open("", "_blank");
    if (!win) {
      setNotice("无法打开 PDF 打印窗口，请允许浏览器弹窗。");
      return;
    }
    win.document.write(html);
    win.document.close();
  }

  function resetDemo() {
    setHazards(initialHazards);
    setMessages(initialChat);
    setSelectedId(initialHazards[0].id);
    setNotice("");
    window.localStorage.removeItem("fire-closure-hazards");
    fetch(`${API_BASE}/reset`, { method: "POST" }).catch(() => undefined);
  }

  if (route.mode !== "workspace") {
    return (
      <PortalView
        evidenceDraft={evidenceDraft}
        hazard={selected}
        mode={route.mode}
        notice={notice}
        onApprove={approveReview}
        onBack={() => {
          window.location.hash = "";
          setRoute({ mode: "workspace" });
        }}
        onEvidenceChange={setEvidenceDraft}
        onFileUpload={uploadEvidenceFile}
        onReject={rejectReview}
        onSubmitEvidence={submitEvidence}
      />
    );
  }

  return (
    <main className="app">
      <section className="hero-band">
        <div className="brand-line">
          <div className="brand-mark">
            <Flame size={22} />
          </div>
          <div>
            <strong>消防整改闭环助手</strong>
            <span>群内流程机器人 + H5 整改链接 + 月度闭环包</span>
          </div>
        </div>
        <div className="hero-copy">
          <p className="eyebrow">不替换后台，不迁移数据</p>
          <h1>把维保报告里的隐患，直接变成能催办、能复核、能归档的整改闭环。</h1>
        </div>
        <div className="top-actions">
          <button className="ghost" onClick={resetDemo}>
            <RotateCcw size={17} />
            重置演示
          </button>
          <button className="ghost" onClick={exportClosurePack}>
            <FileDown size={17} />
            导出闭环包
          </button>
          <button className="ghost" onClick={exportPdfClosurePack}>
            <FileArchive size={17} />
            PDF闭环包
          </button>
          <button className="ghost" onClick={seedPilot30}>
            <ClipboardCheck size={17} />
            生成30条试点
          </button>
          <button className="ghost" onClick={seedRealTemplate}>
            <ShieldCheck size={17} />
            真实模板
          </button>
          <button className="primary" onClick={createFromReport}>
            <Plus size={17} />
            从报告生成隐患
          </button>
        </div>
      </section>

      <section className="metrics">
        <Metric icon={ClipboardCheck} label="未闭环隐患" value={`${stats.open} 条`} note="待分派/整改/复核/驳回" />
        <Metric icon={UserRoundCheck} label="已分派" value={`${stats.assigned} 条`} note="责任人已明确" />
        <Metric icon={Upload} label="已提交整改" value={`${stats.submitted} 条`} note="责任人已上传证据" />
        <Metric icon={UserRoundCheck} label="待复核" value={`${stats.reviewing} 条`} note="复核人通过后才算闭环" />
        <Metric icon={AlertTriangle} label="逾期/驳回" value={`${stats.overdue} 条`} note="自动催办并升级" />
        <Metric icon={ShieldCheck} label="闭环率" value={`${stats.closedRate}%`} note="本月消防整改结果" />
      </section>

      <ConfigPanel health={health} onRefresh={refreshHealth} onRunReminder={runAutoReminder} />

      <CustomerOnboardingPanel
        assignmentSuggestion={assignmentSuggestion}
        config={projectConfig}
        drillRecord={drillRecord}
        onApplySuggestion={applyAssignmentSuggestion}
        onApplyTemplate={applyProjectTemplate}
        onDownloadCsvTemplate={downloadCsvTemplate}
        onExportDrillRecord={exportDrillRecord}
        templates={projectTemplates}
      />

      <ProjectSetupPanel config={projectConfig} onChange={setProjectConfig} onExport={exportProjectConfig} onImport={importProjectConfig} />
      <CsvImportPanel
        importState={csvImport}
        onAddPeople={addCsvPeopleToConfig}
        onAppend={() => confirmCsvImport("append")}
        onCancel={() => setCsvImport(null)}
        onDownloadTemplate={downloadCsvTemplate}
        onFileSelect={previewCsvImport}
        onMappingChange={updateCsvMapping}
        onReplace={() => confirmCsvImport("replace")}
      />

      <section className="flow-layout">
        <section className="panel chat-panel">
          <div className="panel-head">
            <div>
              <h2>群协作现场</h2>
              <p>客户仍在原来的微信群/企微/钉钉里工作</p>
            </div>
            <MessageSquareText size={20} />
          </div>
          <div className="robot-card">
            <strong>@整改闭环助手</strong>
            <p>上传维保报告、现场照片或一句话指令后，自动生成隐患单和责任人处理链接。</p>
          </div>
          <div className="report-import">
            <strong>报告文本快拆</strong>
            <textarea value={reportText} onChange={(event) => setReportText(event.target.value)} />
            <button onClick={createFromReport}>
              <Plus size={15} />
              拆成隐患单
            </button>
          </div>
          <div className="chat-list">
            {messages.map((message, index) => (
              <div className={`chat-message ${message.kind}`} key={`${message.body}-${index}`}>
                <div>
                  <strong>{message.from}</strong>
                  <span>{message.time}</span>
                </div>
                <p>{message.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="panel list-panel">
          <div className="panel-head">
            <div>
              <h2>隐患整改单</h2>
              <p>每条都是一个正在流转的强工作流</p>
            </div>
            <BellRing size={20} />
          </div>
          <label className="search-box">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索项目、点位、责任人" />
          </label>
          <BatchAssignPanel
            batchDue={batchDue}
            batchIds={batchIds}
            batchOwner={batchOwner}
            batchReviewer={batchReviewer}
            onApply={applyBatchAssign}
            onClear={clearBatch}
            onDueChange={setBatchDue}
            onOwnerChange={setBatchOwner}
            onReviewerChange={setBatchReviewer}
            ownerOptions={ownerOptions}
            reviewerOptions={reviewerOptions}
            onSelectFiltered={selectFilteredBatch}
          />
          <div className="hazard-list">
            {filtered.map((hazard) => (
              <button className={`hazard-row ${hazard.id === selected.id ? "selected" : ""}`} key={hazard.id} onClick={() => setSelectedId(hazard.id)}>
                <div>
                  <label className="batch-check" onClick={(event) => event.stopPropagation()}>
                    <input checked={batchIds.includes(hazard.id)} type="checkbox" onChange={() => toggleBatchId(hazard.id)} />
                    <span>批量</span>
                  </label>
                  <span>{hazard.code}</span>
                  <strong>{hazard.title}</strong>
                  <small>{hazard.location}</small>
                </div>
                <div className="row-side">
                  <StatusPill status={hazard.status} />
                  <small>{hazard.owner}</small>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="detail-column">
          {notice && (
            <div className="notice">
              <AlertTriangle size={17} />
              <span>{notice}</span>
            </div>
          )}
          <section className="panel detail-panel">
            <div className="panel-head">
              <div>
                <h2>{selected.title}</h2>
                <p>
                  {selected.code} · {selected.project} · {selected.location}
                </p>
              </div>
              <StatusPill status={selected.status} />
            </div>
            <Workflow current={selected.status} />
            <div className="detail-grid">
              <Field label="项目">
                <input value={selected.project} onChange={(event) => updateSelected("project", event.target.value)} />
              </Field>
              <Field label="点位">
                <input value={selected.location} onChange={(event) => updateSelected("location", event.target.value)} />
              </Field>
              <Field label="隐患类型">
                <input value={selected.category} onChange={(event) => updateSelected("category", event.target.value)} />
              </Field>
              <Field label="风险等级">
                <select value={selected.severity} onChange={(event) => updateSelected("severity", event.target.value as Severity)}>
                  <option>普通</option>
                  <option>紧急</option>
                  <option>重大</option>
                </select>
              </Field>
              <Field label="责任人">
                <select value={selected.owner} onChange={(event) => updateSelected("owner", event.target.value)}>
                  {Array.from(new Set([selected.owner, ...ownerOptions])).map((owner) => (
                    <option key={owner}>{owner}</option>
                  ))}
                </select>
              </Field>
              <Field label="复核人">
                <select value={selected.reviewer} onChange={(event) => updateSelected("reviewer", event.target.value)}>
                  {Array.from(new Set([selected.reviewer, ...reviewerOptions])).map((reviewer) => (
                    <option key={reviewer}>{reviewer}</option>
                  ))}
                </select>
              </Field>
              <Field label="整改期限">
                <input type="date" value={selected.due} onChange={(event) => updateSelected("due", event.target.value)} />
              </Field>
              <Info label="整改链接" value={buildAppLink("rectify", selected.id)} />
              <Info label="催办状态" value={`${selected.escalationLevel || "未催办"} · ${selected.reminderCount || 0} 次`} />
              <Info label="最近催办" value={selected.lastReminderAt ? new Date(selected.lastReminderAt).toLocaleString("zh-CN") : "暂无"} />
            </div>
            <div className="description-block">
              <strong>问题描述</strong>
              <textarea value={selected.description} onChange={(event) => updateSelected("description", event.target.value)} />
              <strong>整改建议</strong>
              <textarea value={selected.suggestion} onChange={(event) => updateSelected("suggestion", event.target.value)} />
            </div>
            <div className="actions">
              <button onClick={assignOwner}>
                <Link2 size={17} />
                生成整改链接
              </button>
              <button onClick={() => copyText(buildAppLink("rectify", selected.id), "整改链接")}>
                <Copy size={17} />
                复制整改链接
              </button>
              <button onClick={() => copyText(buildAppLink("review", selected.id), "复核链接")}>
                <Copy size={17} />
                复制复核链接
              </button>
              <button onClick={() => copyText(buildGroupMessage("rectify", selected), "整改群消息")}>
                <MessageSquareText size={17} />
                复制整改文案
              </button>
              <button onClick={() => copyText(buildGroupMessage("review", selected), "复核群消息")}>
                <MessageSquareText size={17} />
                复制复核文案
              </button>
              <button onClick={() => copyText(buildGroupMessage("reminder", selected), "催办群消息")}>
                <MessageSquareText size={17} />
                复制催办文案
              </button>
              <button onClick={openRectifyLink}>
                <Upload size={17} />
                打开整改页
              </button>
              <button onClick={openReviewLink}>
                <UserRoundCheck size={17} />
                打开复核页
              </button>
              <button onClick={sendReminder}>
                <BellRing size={17} />
                催办/升级
              </button>
              <button onClick={rejectReview}>
                <XCircle size={17} />
                复核驳回
              </button>
              <button onClick={approveReview}>
                <CheckCircle2 size={17} />
                复核通过
              </button>
            </div>
          </section>

          <section className="split">
            <section className="panel h5-card">
              <div className="panel-head tight">
                <h3>责任人 H5 整改页</h3>
                <Upload size={18} />
              </div>
              <p className="mini-copy">责任人无需登录后台，只点群里的链接，提交整改后照片或视频。</p>
              <div className="evidence-box">
                <input value={evidenceDraft} onChange={(event) => setEvidenceDraft(event.target.value)} placeholder="例如：整改后照片 2 张 / 自动闭合视频" />
                <button onClick={submitEvidence}>
                  <Send size={15} />
                  提交整改
                </button>
              </div>
              <label className="file-upload">
                <Upload size={15} />
                上传整改图片/文件
                <input type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={(event) => event.target.files?.[0] && uploadEvidenceFile(event.target.files[0])} />
              </label>
              <EvidenceBlock title="整改前证据" items={selected.beforeEvidence} />
              <EvidenceBlock title="整改后证据" items={selected.afterEvidence} empty="尚未提交整改证据" />
            </section>

            <section className="panel archive-card">
              <div className="panel-head tight">
                <h3>复核与归档</h3>
                <FileArchive size={18} />
              </div>
              {selected.rejectReason && (
                <div className="reject-box">
                  <strong>驳回原因</strong>
                  <p>{selected.rejectReason}</p>
                </div>
              )}
              {selected.closedAt && (
                <div className="closed-box">
                  <CheckCircle2 size={17} />
                  <span>已于 {selected.closedAt} 闭环，进入月度归档包。</span>
                </div>
              )}
              <div className="timeline">
                {selected.logs.map((log, index) => (
                  <div className="timeline-item" key={`${log}-${index}`}>
                    <span />
                    <p>{log}</p>
                  </div>
                ))}
              </div>
            </section>
          </section>
        </section>
      </section>
    </main>
  );
}

function PortalView({
  evidenceDraft,
  hazard,
  mode,
  notice,
  onApprove,
  onBack,
  onEvidenceChange,
  onFileUpload,
  onReject,
  onSubmitEvidence
}: {
  evidenceDraft: string;
  hazard: Hazard;
  mode: "rectify" | "review";
  notice: string;
  onApprove: () => void;
  onBack: () => void;
  onEvidenceChange: (value: string) => void;
  onFileUpload: (file: File) => void;
  onReject: () => void;
  onSubmitEvidence: () => void;
}) {
  const isRectify = mode === "rectify";
  return (
    <main className="portal-shell">
      <section className="portal-card">
        <div className="portal-head">
          <div className="brand-line">
            <div className="brand-mark">
              <Flame size={21} />
            </div>
            <div>
              <strong>{isRectify ? "责任人整改页" : "复核人确认页"}</strong>
              <span>{hazard.code} · 无需进入后台</span>
            </div>
          </div>
          <button className="ghost" onClick={onBack}>返回工作台</button>
        </div>

        {notice && (
          <div className="notice">
            <AlertTriangle size={17} />
            <span>{notice}</span>
          </div>
        )}

        <div className="portal-title">
          <StatusPill status={hazard.status} />
          <h1>{hazard.title}</h1>
          <p>{hazard.project} · {hazard.location}</p>
        </div>

        <div className="detail-grid">
          <Info label="隐患类型" value={hazard.category} />
          <Info label="风险等级" value={hazard.severity} danger={hazard.severity === "重大"} />
          <Info label="责任人" value={hazard.owner} />
          <Info label="复核人" value={hazard.reviewer} />
          <Info label="整改期限" value={hazard.due} />
          <Info label="处理链接" value={buildAppLink(mode, hazard.id)} />
        </div>

        <div className="description-block">
          <strong>问题描述</strong>
          <p>{hazard.description}</p>
          <strong>整改建议</strong>
          <p>{hazard.suggestion}</p>
        </div>

        <section className="split">
          <div>
            <EvidenceBlock title="整改前证据" items={hazard.beforeEvidence} />
            <EvidenceBlock title="整改后证据" items={hazard.afterEvidence} empty="尚未提交整改证据" />
          </div>
          <div className="portal-action">
            {isRectify ? (
              <>
                <h3>提交整改证据</h3>
                <p className="mini-copy">上传照片/视频后，系统会自动通知复核人。</p>
                <div className="evidence-box">
                  <input value={evidenceDraft} onChange={(event) => onEvidenceChange(event.target.value)} placeholder="例如：整改后照片 2 张" />
                  <button onClick={onSubmitEvidence}>
                    <Send size={15} />
                    提交整改
                  </button>
                </div>
                <label className="file-upload">
                  <Upload size={15} />
                  上传整改图片/文件
                  <input type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={(event) => event.target.files?.[0] && onFileUpload(event.target.files[0])} />
                </label>
              </>
            ) : (
              <>
                <h3>复核处理</h3>
                <p className="mini-copy">没有整改后证据时不能复核通过；驳回会自动通知责任人补充。</p>
                <div className="actions">
                  <button onClick={onReject}>
                    <XCircle size={17} />
                    驳回补证据
                  </button>
                  <button onClick={onApprove}>
                    <CheckCircle2 size={17} />
                    复核通过
                  </button>
                </div>
              </>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

function CustomerOnboardingPanel({
  assignmentSuggestion,
  config,
  drillRecord,
  onApplySuggestion,
  onApplyTemplate,
  onDownloadCsvTemplate,
  onExportDrillRecord,
  templates
}: {
  assignmentSuggestion: AssignmentSuggestion | null;
  config: ProjectConfig;
  drillRecord: DrillRecord | null;
  onApplySuggestion: () => void;
  onApplyTemplate: (templateId: string) => void;
  onDownloadCsvTemplate: () => void;
  onExportDrillRecord: () => void;
  templates: ProjectTemplate[];
}) {
  const activeTemplate = templates.find((template) => template.id === config.templateId) || templates[0];
  const checklist = [
    { label: "客户模板", done: Boolean(config.templateId) },
    { label: "项目配置", done: Boolean(config.customerName && config.projectName && config.owners.length > 1 && config.reviewers.length > 0) },
    { label: "CSV导入", done: Boolean(assignmentSuggestion || drillRecord) },
    { label: "批量分派", done: Boolean(assignmentSuggestion) },
    { label: "演练记录", done: Boolean(drillRecord) }
  ];

  return (
    <section className="panel onboarding-panel">
      <div className="panel-head tight">
        <div>
          <h2>客户初始化向导</h2>
          <p>从客户模板、配置复用、CSV 导入到批量分派建议，按试点交付顺序走</p>
        </div>
        <ShieldCheck size={20} />
      </div>
      <div className="onboarding-grid">
        <div className="template-library">
          <div className="template-head">
            <strong>{activeTemplate.name}</strong>
            <span>{config.schemaVersion ? `配置包 v${config.schemaVersion}` : "兼容旧配置包"}</span>
          </div>
          <p>{activeTemplate.description}</p>
          <div className="rule-list">
            {(config.assignmentRules?.keywordRules || []).slice(0, 4).map((rule) => (
              <span key={rule.id}>{rule.label} 到 {rule.owner}</span>
            ))}
          </div>
          <select value={config.templateId || activeTemplate.id} onChange={(event) => onApplyTemplate(event.target.value)}>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>{template.name}</option>
            ))}
          </select>
          <div className="template-actions">
            <button className="ghost compact" onClick={onDownloadCsvTemplate}>
              <FileDown size={16} />
              CSV模板
            </button>
            <button className="ghost compact" onClick={onExportDrillRecord}>
              <FileArchive size={16} />
              演练记录
            </button>
          </div>
        </div>

        <div className="onboarding-steps">
          {checklist.map((item, index) => (
            <div className={`onboarding-step ${item.done ? "done" : ""}`} key={item.label}>
              <span>{index + 1}</span>
              <strong>{item.label}</strong>
              <small>{item.done ? "已就绪" : "待完成"}</small>
            </div>
          ))}
        </div>

        <div className="suggestion-card">
          <strong>导入后分派建议</strong>
          {assignmentSuggestion ? (
            <>
              <p>{assignmentSuggestion.reason}</p>
              <div className="suggestion-grid">
                <span>隐患</span><strong>{assignmentSuggestion.ids.length} 条</strong>
                <span>命中</span><strong>{assignmentSuggestion.matchedCount} 条</strong>
                <span>责任人</span><strong>{assignmentSuggestion.owner}</strong>
                <span>复核人</span><strong>{assignmentSuggestion.reviewer}</strong>
                <span>期限</span><strong>{assignmentSuggestion.due}</strong>
              </div>
              <div className="rule-hit-list">
                {assignmentSuggestion.items.slice(0, 5).map((item) => (
                  <span key={item.id}>{item.code} · {item.ruleLabel} · {item.owner}</span>
                ))}
              </div>
              <button onClick={onApplySuggestion}>
                <UserRoundCheck size={16} />
                按规则分派
              </button>
            </>
          ) : (
            <p>完成 CSV 导入后，系统会按导入数据和项目默认规则自动生成建议。</p>
          )}
        </div>

        <div className="drill-card">
          <strong>导入演练记录</strong>
          {drillRecord ? (
            <>
              <p>{drillRecord.at} · {drillRecord.fileName}</p>
              <div className="suggestion-grid">
                <span>导入</span><strong>{drillRecord.importedCount} 条</strong>
                <span>命中</span><strong>{drillRecord.matchedRuleCount} 条</strong>
                <span>阻断</span><strong>{drillRecord.blockingCount} 个</strong>
                <span>提醒</span><strong>{drillRecord.warningCount} 个</strong>
              </div>
            </>
          ) : (
            <p>CSV 确认导入后自动生成，可下载给客户作为试点过程附件。</p>
          )}
        </div>
      </div>
    </section>
  );
}

function ProjectSetupPanel({
  config,
  onChange,
  onExport,
  onImport
}: {
  config: ProjectConfig;
  onChange: (config: ProjectConfig) => void;
  onExport: () => void;
  onImport: (file: File) => void;
}) {
  function patchConfig(partial: Partial<ProjectConfig>) {
    onChange({ ...config, ...partial });
  }

  return (
    <section className="panel setup-panel">
      <div className="panel-head tight">
        <div>
          <h2>项目初始化</h2>
          <p>按客户现有组织方式配置项目、维保方、责任人和复核人，后续导入/分派自动沿用</p>
        </div>
        <div className="inline-actions">
          <button className="ghost compact" onClick={onExport}>
            <FileDown size={16} />
            导出配置
          </button>
          <label className="file-upload compact-upload">
            <Upload size={15} />
            导入配置
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onImport(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </div>
        <Settings size={20} />
      </div>
      <div className="setup-grid">
        <Field label="客户名称">
          <input value={config.customerName} onChange={(event) => patchConfig({ customerName: event.target.value })} />
        </Field>
        <Field label="项目名称">
          <input value={config.projectName} onChange={(event) => patchConfig({ projectName: event.target.value })} />
        </Field>
        <Field label="维保项目负责人">
          <input value={config.maintainerName} onChange={(event) => patchConfig({ maintainerName: event.target.value })} />
        </Field>
        <Field label="默认整改期限">
          <input type="date" value={config.defaultDue} onChange={(event) => patchConfig({ defaultDue: event.target.value })} />
        </Field>
        <Field label="责任人名单（每行一个）">
          <textarea
            value={config.owners.filter((owner) => owner !== "待分派").join("\n")}
            onChange={(event) => patchConfig({ owners: normalizeNameList(event.target.value, true) })}
          />
        </Field>
        <Field label="复核人名单（每行一个）">
          <textarea value={config.reviewers.join("\n")} onChange={(event) => patchConfig({ reviewers: normalizeNameList(event.target.value) })} />
        </Field>
      </div>
    </section>
  );
}

function CsvImportPanel({
  importState,
  onAddPeople,
  onAppend,
  onCancel,
  onDownloadTemplate,
  onFileSelect,
  onMappingChange,
  onReplace
}: {
  importState: CsvImportState | null;
  onAddPeople: () => void;
  onAppend: () => void;
  onCancel: () => void;
  onDownloadTemplate: () => void;
  onFileSelect: (file: File) => void;
  onMappingChange: (field: CsvFieldKey, header: string) => void;
  onReplace: () => void;
}) {
  const blockingCount = importState?.issues.filter((issue) => issue.level === "error").length || 0;
  const warningCount = importState?.issues.filter((issue) => issue.level === "warning").length || 0;
  return (
    <section className="panel import-panel">
      <div className="panel-head tight">
        <div>
          <h2>历史台账 CSV 导入</h2>
          <p>把客户已有 Excel 另存为 CSV，先预览再确认进入整改工作流</p>
        </div>
        <div className="inline-actions">
          <button className="ghost compact" onClick={onDownloadTemplate}>
            <FileDown size={16} />
            下载模板
          </button>
          <label className="file-upload compact-upload">
            <Upload size={15} />
            选择CSV
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onFileSelect(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </div>
      </div>

      {importState ? (
        <div className="import-preview">
          <div className="import-summary">
            <strong>{importState.fileName}</strong>
            <span>可导入 {importState.hazards.length} 条 · 阻断 {blockingCount} 个 · 提醒 {warningCount} 个</span>
          </div>
          <div className="mapping-grid">
            {csvFields.map((field) => (
              <label className="field compact-field" key={field}>
                <span>{csvFieldLabels[field]}</span>
                <select value={importState.mapping[field]} onChange={(event) => onMappingChange(field, event.target.value)}>
                  <option value="">未映射</option>
                  {importState.headers.map((header) => (
                    <option key={`${field}-${header}`} value={header}>{header}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="preview-table">
            {importState.hazards.slice(0, 6).map((hazard) => (
              <div className="preview-row" key={hazard.id}>
                <strong>{hazard.code}</strong>
                <span>{hazard.location}</span>
                <span>{hazard.title}</span>
                <StatusPill status={hazard.status} />
              </div>
            ))}
          </div>
          {importState.issues.length > 0 && (
            <div className="invalid-list">
              {importState.issues.slice(0, 8).map((issue) => (
                <span className={issue.level} key={`${issue.row}-${issue.field}-${issue.message}`}>
                  第 {issue.row} 行 {issue.field}：{issue.message}
                </span>
              ))}
            </div>
          )}
          {(importState.unknownOwners.length > 0 || importState.unknownReviewers.length > 0) && (
            <div className="unknown-people">
              <span>发现新人员：{[...importState.unknownOwners, ...importState.unknownReviewers].join("、")}</span>
              <button className="ghost compact" onClick={onAddPeople}>加入名单</button>
            </div>
          )}
          <div className="batch-actions import-actions">
            <button disabled={blockingCount > 0} onClick={onAppend}>确认导入（追加）</button>
            <button disabled={blockingCount > 0} onClick={onReplace}>替换当前隐患</button>
            <button onClick={onCancel}>取消</button>
          </div>
        </div>
      ) : (
        <div className="import-empty">
          <ShieldCheck size={17} />
          <span>支持字段：编号、项目、点位、隐患类型、标题、问题描述、整改建议、风险等级、责任人、复核人、期限、整改前证据。</span>
        </div>
      )}
    </section>
  );
}

function ConfigPanel({ health, onRefresh, onRunReminder }: { health: HealthState | null; onRefresh: () => void; onRunReminder: () => void }) {
  const apiOk = Boolean(health?.ok);
  const robotOk = Boolean(health?.wecomConfigured || health?.dingtalkConfigured);
  const recentNotification = health?.notificationSummary?.recent;
  const notificationOk = recentNotification ? recentNotification.ok : robotOk;
  return (
    <section className="panel config-panel">
      <div className="panel-head tight">
        <div>
          <h2>配置与上线检查</h2>
          <p>上线前先看端口、公开链接、上传目录和机器人是否就绪</p>
        </div>
        <button className="ghost compact" onClick={onRefresh}>
          <RefreshCw size={16} />
          刷新
        </button>
        <button className="ghost compact" onClick={onRunReminder}>
          <BellRing size={16} />
          跑催办
        </button>
      </div>
      <div className="config-grid">
        <ConfigItem icon={Settings} label="API 服务" value={apiOk ? `${health?.host}:${health?.port}` : "未连接"} ok={apiOk} />
        <ConfigItem icon={Link2} label="HTTPS" value={health?.httpsEnabled ? "已启用" : "未启用"} ok={Boolean(health?.httpsEnabled)} />
        <ConfigItem icon={Settings} label="项目配置" value={health?.projectConfigFile || "待检查"} ok={Boolean(health?.projectConfigFile)} />
        <ConfigItem icon={Upload} label="上传限制" value={health ? `${health.maxUploadMb}MB · ${health.uploadDir}` : "待检查"} ok={Boolean(health?.uploadDir)} />
        <ConfigItem icon={MessageSquareText} label="机器人" value={robotOk ? `已配置${health?.dingtalkSignConfigured ? " · 钉钉加签" : ""}` : "dry-run"} ok={robotOk} />
        <ConfigItem
          icon={MessageSquareText}
          label="最近通知"
          value={recentNotification ? `${recentNotification.ok ? "成功" : "失败"} · ${recentNotification.dryRun ? "dry-run" : recentNotification.title}` : "暂无记录"}
          ok={Boolean(notificationOk)}
        />
        <ConfigItem icon={Link2} label="公开链接" value={health?.publicBaseUrl || PUBLIC_BASE} ok={Boolean(health?.publicBaseUrl)} />
        <ConfigItem icon={BellRing} label="自动催办" value={health?.reminderJobEnabled ? `${health.reminderIntervalMinutes} 分钟` : "未启用"} ok={Boolean(health?.reminderJobEnabled)} />
      </div>
      {health?.notificationSummary?.recentFailures?.length ? (
        <div className="notification-failures">
          {health.notificationSummary.recentFailures.slice(0, 3).map((item) => (
            <span key={item.id}>{new Date(item.at).toLocaleString("zh-CN")} · {item.title}</span>
          ))}
        </div>
      ) : null}
      <div className="origin-list">
        {(health?.allowedOrigins || []).map((origin) => (
          <span key={origin}>{origin}</span>
        ))}
      </div>
    </section>
  );
}

function BatchAssignPanel({
  batchDue,
  batchIds,
  batchOwner,
  batchReviewer,
  onApply,
  onClear,
  onDueChange,
  onOwnerChange,
  onReviewerChange,
  ownerOptions,
  reviewerOptions,
  onSelectFiltered
}: {
  batchDue: string;
  batchIds: string[];
  batchOwner: string;
  batchReviewer: string;
  onApply: () => void;
  onClear: () => void;
  onDueChange: (value: string) => void;
  onOwnerChange: (value: string) => void;
  onReviewerChange: (value: string) => void;
  ownerOptions: string[];
  reviewerOptions: string[];
  onSelectFiltered: () => void;
}) {
  return (
    <div className="batch-panel">
      <div className="batch-head">
        <strong>批量分派</strong>
        <span>已选 {batchIds.length} 条</span>
      </div>
      <select value={batchOwner} onChange={(event) => onOwnerChange(event.target.value)}>
        {ownerOptions.filter((owner) => owner !== "待分派").map((owner) => (
          <option key={owner}>{owner}</option>
        ))}
      </select>
      <select value={batchReviewer} onChange={(event) => onReviewerChange(event.target.value)}>
        {reviewerOptions.map((reviewer) => (
          <option key={reviewer}>{reviewer}</option>
        ))}
      </select>
      <input type="date" value={batchDue} onChange={(event) => onDueChange(event.target.value)} />
      <div className="batch-actions">
        <button onClick={onSelectFiltered}>选择当前列表</button>
        <button onClick={onApply}>分派</button>
        <button onClick={onClear}>清空</button>
      </div>
    </div>
  );
}

function ConfigItem({ icon: Icon, label, value, ok }: { icon: LucideIcon; label: string; value: string; ok: boolean }) {
  return (
    <div className={`config-item ${ok ? "ok" : "warn"}`}>
      <Icon size={17} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Metric({ icon: Icon, label, value, note }: { icon: LucideIcon; label: string; value: string; note: string }) {
  return (
    <div className="metric">
      <div className="metric-icon">
        <Icon size={20} />
      </div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function StatusPill({ status }: { status: Status }) {
  return <span className={`status-pill ${statusTone[status]}`}>{status}</span>;
}

function Workflow({ current }: { current: Status }) {
  const currentIndex = statusFlow.indexOf(current);
  return (
    <div className="workflow">
      {statusFlow.map((status, index) => {
        const done = currentIndex >= index && currentIndex !== -1;
        return (
          <div className={`workflow-step ${done ? "done" : ""} ${current === status ? "active" : ""}`} key={status}>
            <span>{index + 1}</span>
            <p>{status}</p>
            {index < statusFlow.length - 1 && <ChevronRight size={14} />}
          </div>
        );
      })}
    </div>
  );
}

function Info({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className={`info ${danger ? "danger-text" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EvidenceBlock({ title, items, empty = "暂无" }: { title: string; items: string[]; empty?: string }) {
  return (
    <div className="evidence-block">
      <strong>{title}</strong>
      {(items.length ? items : [empty]).map((item) => {
        const url = extractEvidenceUrl(item);
        const image = isImageUrl(url);
        return (
          <div className={items.length ? "evidence-item" : "evidence-item empty"} key={item}>
            {image ? <Image size={15} /> : <ShieldCheck size={15} />}
            <span>{item}</span>
            {url && (
              <a href={url} target="_blank" rel="noreferrer">
                打开
              </a>
            )}
            {image && <img src={url} alt="整改证据预览" />}
          </div>
        );
      })}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
