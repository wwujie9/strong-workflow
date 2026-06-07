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
  uploadDir: string;
  maxUploadMb: number;
  allowedOrigins: string[];
  httpsEnabled: boolean;
  reminderJobEnabled: boolean;
  reminderIntervalMinutes: number;
  wecomConfigured: boolean;
  dingtalkConfigured: boolean;
  dingtalkSignConfigured: boolean;
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

const ownerOptions = ["待分派", "物业工程-陈工", "物业客服-沈主管", "外包维修-赵师傅", "租户负责人-王店长", "仓储主管-刘主管", "维保项目-李工"];
const reviewerOptions = ["安全负责人-周经理", "维保项目-李工", "园区安全-林主管", "物业经理-黄经理"];

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
    if (!apiLoaded.current) return;
    fetch(`${API_BASE}/hazards`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(hazards)
    }).catch(() => undefined);
  }, [hazards]);

  return [hazards, setHazards] as const;
}

function App() {
  const [hazards, setHazards] = useStoredHazards();
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
  const [batchOwner, setBatchOwner] = useState(ownerOptions[1]);
  const [batchReviewer, setBatchReviewer] = useState(reviewerOptions[0]);
  const [batchDue, setBatchDue] = useState("2026-06-15");
  const [route, setRoute] = useState<RouteState>(() => parseRoute());

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
    return { overdue, reviewing, open, closedRate };
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

  function notifyRobot(title: string, text: string) {
    fetch(`${API_BASE}/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, text })
    }).catch(() => undefined);
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

  function applyBatchAssign() {
    if (batchIds.length === 0) {
      setNotice("请先选择需要批量分派的隐患。");
      return;
    }
    const assignedCodes: string[] = [];
    setHazards((current) =>
      current.map((hazard) => {
        if (!batchIds.includes(hazard.id) || hazard.status === "已闭环") return hazard;
        assignedCodes.push(hazard.code);
        return {
          ...hazard,
          owner: batchOwner,
          reviewer: batchReviewer,
          due: batchDue,
          status: "待整改",
          updated: "刚刚",
          logs: [`批量分派给 ${batchOwner}，复核人 ${batchReviewer}，期限 ${batchDue}`, ...hazard.logs]
        };
      })
    );
    setNotice(`已批量分派 ${assignedCodes.length} 条隐患。`);
    appendRobotMessage(`已批量分派 ${assignedCodes.length} 条隐患给 ${batchOwner}，复核人 ${batchReviewer}。`);
    notifyRobot("批量分派完成", `${assignedCodes.join("、")}\n责任人：${batchOwner}\n复核人：${batchReviewer}\n期限：${batchDue}`);
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

  function patchSelected(partial: Partial<Hazard>, log: string) {
    setNotice("");
    setHazards((current) =>
      current.map((hazard) =>
        hazard.id === selected.id
          ? {
              ...hazard,
              ...partial,
              updated: "刚刚",
              logs: [log, ...hazard.logs]
            }
          : hazard
      )
    );
  }

  function updateSelected<K extends keyof Hazard>(key: K, value: Hazard[K]) {
    setNotice("");
    setHazards((current) =>
      current.map((hazard) =>
        hazard.id === selected.id
          ? {
              ...hazard,
              [key]: value,
              updated: "刚刚"
            }
          : hazard
      )
    );
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
      return {
        id: `hz-${String(next).padStart(3, "0")}`,
        code: `XF-2026-${String(next).padStart(3, "0")}`,
        project: "试点项目",
        location: line.split("，")[0] || "待确认点位",
        category,
        title: `${category}隐患整改`,
        description: line,
        suggestion: line.includes("建议") ? line.slice(line.indexOf("建议")) : "请按维保建议完成整改，并提交整改后照片/视频。",
        status: "待分派",
        severity,
        owner: "待分派",
        reviewer: "安全负责人",
        due: "2026-06-12",
        beforeEvidence: [`报告原文：${line}`],
        afterEvidence: [],
        updated: "刚刚",
        logs: ["从报告文本快拆生成，等待分派责任人"]
      };
    });
    setHazards((current) => [...created, ...current]);
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
      patchSelected({ owner: "物业工程-默认责任人", status: "待整改" }, "系统补齐默认责任人并生成整改链接");
      appendRobotMessage(`${selected.code} 已分派给物业工程-默认责任人，请在 ${selected.due} 前提交整改证据。`);
      notifyRobot("隐患已分派", `${selected.code} 已分派给物业工程-默认责任人，请在 ${selected.due} 前提交整改证据。`);
      return;
    }
    patchSelected({ status: "待整改" }, `已分派给 ${selected.owner}，生成 H5 整改链接`);
    appendRobotMessage(`${selected.code} 已分派给 ${selected.owner}，整改链接已发送。`);
    notifyRobot("整改链接已生成", `${selected.code} 已分派给 ${selected.owner}。\n整改链接：${buildAppLink("rectify", selected.id)}`);
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
    patchSelected(
      {
        status: "待复核",
        afterEvidence: Array.from(new Set([...selected.afterEvidence, value]))
      },
      `${selected.owner} 提交整改证据：${value}`
    );
    setEvidenceDraft("");
    appendRobotMessage(`${selected.code} 已提交整改证据，等待 ${selected.reviewer} 复核。`);
    notifyRobot("整改证据已提交", `${selected.code} 已提交整改证据，等待 ${selected.reviewer} 复核。\n复核链接：${buildAppLink("review", selected.id)}`);
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
      patchSelected(
        {
          status: "待复核",
          afterEvidence: Array.from(new Set([...selected.afterEvidence, `${uploaded.originalName} (${uploaded.publicUrl || uploaded.url})`]))
        },
        `${selected.owner} 上传整改文件：${uploaded.originalName}`
      );
      appendRobotMessage(`${selected.code} 已上传整改文件，等待 ${selected.reviewer} 复核。`);
      notifyRobot("整改文件已上传", `${selected.code} 已上传整改文件：${uploaded.originalName}`);
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
    patchSelected(
      {
        status: "已闭环",
        closedAt: todayText(),
        rejectReason: undefined
      },
      `${selected.reviewer} 复核通过，隐患闭环`
    );
    appendRobotMessage(`${selected.code} 已闭环，已自动进入本月消防整改归档包。`);
    notifyRobot("隐患已闭环", `${selected.code} 已由 ${selected.reviewer} 复核通过，进入本月消防整改归档包。`);
  }

  function rejectReview() {
    if (selected.status !== "待复核") {
      setNotice("只有待复核的隐患可以驳回补证据。");
      return;
    }
    patchSelected(
      {
        status: "已驳回",
        rejectReason: "证据不足，请补充整改后近景照片或短视频。"
      },
      `${selected.reviewer} 驳回整改：证据不足`
    );
    appendRobotMessage(`${selected.code} 复核驳回，已通知 ${selected.owner} 补充证据。`, "warning");
    notifyRobot("复核驳回", `${selected.code} 复核驳回，已通知 ${selected.owner} 补充证据。`);
  }

  function sendReminder() {
    if (selected.status === "已闭环") {
      setNotice("该隐患已闭环，不需要催办。");
      return;
    }
    patchSelected({ status: "已逾期" }, `催办 ${selected.owner}，并记录逾期升级`);
    appendRobotMessage(`${selected.code} 已催办 ${selected.owner}；若 24 小时内未处理，将升级给上级负责人。`, "warning");
    notifyRobot("整改催办/升级", `${selected.code} 已催办 ${selected.owner}；若 24 小时内未处理，将升级给上级负责人。`);
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
      overdue: hazards.filter((hazard) => hazard.status === "已逾期" || hazard.status === "已驳回").length
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
            <ul>${hazard.beforeEvidence.map((item) => `<li>${item}</li>`).join("")}</ul>
            <h3>整改后证据</h3>
            <ul>${hazard.afterEvidence.map((item) => `<li>${item}</li>`).join("") || "<li>未提交</li>"}</ul>
            <h3>流程日志</h3>
            <ul>${hazard.logs.map((item) => `<li>${item}</li>`).join("")}</ul>
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
      .item{break-inside:avoid;border:1px solid #d9e3e7;border-radius:8px;padding:12px;margin:12px 0}
      .grid{display:grid;grid-template-columns:90px 1fr 90px 1fr;gap:6px 10px;font-size:12px}
      li{font-size:12px;margin:4px 0;word-break:break-all}
      .toolbar{position:sticky;top:0;padding:10px 0 14px;background:#fff}
      button{height:36px;border:0;border-radius:6px;background:#14746f;color:#fff;font-weight:700;padding:0 14px}
      @media print{.toolbar{display:none}.item{page-break-inside:avoid}}
    </style></head><body>
      <div class="toolbar"><button onclick="window.print()">打印/另存为 PDF</button></div>
      <h1>消防隐患整改闭环包</h1>
      <p class="muted">生成时间：${todayText()} · 系统地址：${PUBLIC_BASE}</p>
      <section class="summary">
        <div><span>隐患总数</span><strong>${summary.total}</strong></div>
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
        <Metric icon={UserRoundCheck} label="待复核" value={`${stats.reviewing} 条`} note="复核人通过后才算闭环" />
        <Metric icon={AlertTriangle} label="逾期/驳回" value={`${stats.overdue} 条`} note="自动催办并升级" />
        <Metric icon={ShieldCheck} label="闭环率" value={`${stats.closedRate}%`} note="本月消防整改结果" />
      </section>

      <ConfigPanel health={health} onRefresh={refreshHealth} onRunReminder={runAutoReminder} />

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

function ConfigPanel({ health, onRefresh, onRunReminder }: { health: HealthState | null; onRefresh: () => void; onRunReminder: () => void }) {
  const apiOk = Boolean(health?.ok);
  const robotOk = Boolean(health?.wecomConfigured || health?.dingtalkConfigured);
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
        <ConfigItem icon={Upload} label="上传限制" value={health ? `${health.maxUploadMb}MB · ${health.uploadDir}` : "待检查"} ok={Boolean(health?.uploadDir)} />
        <ConfigItem icon={MessageSquareText} label="机器人" value={robotOk ? `已配置${health?.dingtalkSignConfigured ? " · 钉钉加签" : ""}` : "dry-run"} ok={robotOk} />
        <ConfigItem icon={Link2} label="公开链接" value={health?.publicBaseUrl || PUBLIC_BASE} ok={Boolean(health?.publicBaseUrl)} />
        <ConfigItem icon={BellRing} label="自动催办" value={health?.reminderJobEnabled ? `${health.reminderIntervalMinutes} 分钟` : "未启用"} ok={Boolean(health?.reminderJobEnabled)} />
      </div>
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
