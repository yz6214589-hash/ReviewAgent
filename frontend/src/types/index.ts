/**
 * 全局类型定义：与 SSD-v1.0 §3.3 API 约定、§3.4 数据模型对齐。
 * 后端字段以 snake_case 传输，前端原样保留。
 */

/** 任务状态：draft 草稿 / classified 已识别待确认 / generating 生成中 / reviewing 待定稿 / done 已完成 */
export type TaskStatus = 'draft' | 'classified' | 'generating' | 'reviewing' | 'done';

/** 评审阶段：summary 总结 / proposal 立项 / combined 组合评审 */
export type ReviewStage = 'summary' | 'proposal' | 'combined';

/** 工作台四步 */
export type StepNo = 1 | 2 | 3 | 4;

/** 上传文件信息 */
export interface FileInfo {
  id?: string;
  name: string;
  type?: string;
  size?: number;
  /** 解析后的纯文本（可能截断） */
  text?: string;
}

/** POST /api/upload 响应 */
export interface UploadResp {
  task_id: string;
  project_name: string;
  files: FileInfo[];
  parsed_text?: string;
}

/** 申报类别识别结果（对应 classifications 表） */
export interface Classification {
  project_name?: string;
  project_type: string;
  stage: ReviewStage;
  sub_domain: string;
  year: number;
  is_applied_basic: boolean;
  is_combined: boolean;
  /** 各字段置信度 0~1，如 { project_type: 0.92 } */
  confidence: Record<string, number>;
  /** 命中关键词及次数，如 ["北斗 ×9"] */
  hit_keywords?: string[];
}

/** POST /api/review/{id}/classify 响应 */
export interface ClassifyResp extends Classification {
  task_id?: string;
}

/** 评分维度 */
export interface Dimension {
  name: string;
  weight: number;
  description?: string;
}

/** 评分模板（BR-1 四套） */
export interface ScoringTemplate {
  id: string;
  name: string;
  /** applied_basic / non_applied_basic */
  category?: string;
  stage: 'summary' | 'proposal';
  dimensions: Dimension[];
}

/** POST /api/review/{id}/confirm 请求体（resume interrupt①，允许人工修改留痕） */
export interface ConfirmReq {
  classification: Classification;
  template_ids: string[];
  /** 任务级模板覆盖（维度/权重被人工修改时携带） */
  templates?: ScoringTemplate[];
  operator?: string;
}

/** SSE 事件协议（SSD §4.3） */
export interface SSEvent {
  type: 'progress' | 'chunk' | 'complete' | 'error';
  /** 维度名（progress/chunk） */
  step?: string;
  status?: 'running' | 'done';
  /** 维度完成时的建议评分区间，如 "17~19" */
  score?: string;
  /** 流式文本片段 */
  text?: string;
  task_id?: string;
  word_files?: string[];
  message?: string;
}

/** 原文依据锚点 */
export interface EvidenceAnchor {
  /** 段落锚点 id（DocViewer 内定位用） */
  anchor: string;
  /** 展示文案，如 "一、项目概述" */
  label: string;
}

/** 单维度评审结果 */
export interface DimResult {
  name: string;
  weight: number;
  /** AI 建议评分区间，如 "17~19" */
  ai_range?: string;
  /** 维度结论（可编辑） */
  conclusion?: string;
  evidence?: EvidenceAnchor[];
  /** 评审过程（思维链摘要） */
  thinking?: string[];
}

/** 评审结果（对应 review_results 表） */
export interface ReviewResult {
  id?: string;
  stage: 'summary' | 'proposal';
  template_id?: string;
  template_name?: string;
  /** 意见全文（草稿） */
  content?: string;
  total_score_range?: string;
  dimensions?: DimResult[];
  fewshot_count?: number;
  fewshot_projects?: number;
  created_at?: string;
}

/** 产物版本（对应 artifact_versions 表） */
export interface ArtifactVersion {
  id: string;
  version: number;
  /** ai_draft / manual_edit / regenerate */
  source?: string;
  created_at?: string;
}

/** 产物文件（文件级版本线） */
export interface ArtifactFile {
  file_id: string;
  /** word_summary / word_proposal / md */
  file_type: string;
  name: string;
  current_version: number;
  updated_at?: string;
  meta?: string;
  versions: ArtifactVersion[];
}

/** GET /api/review/{id}/artifacts 响应（容忍数组或 {files} 两种形态） */
export type ArtifactsResp = ArtifactFile[] | { files: ArtifactFile[] };

/** 任务列表项（对应 review_tasks 表 + 冗余展示字段） */
export interface TaskItem {
  id: string;
  project_name: string;
  status: TaskStatus;
  current_step: StepNo;
  project_type?: string;
  stage?: ReviewStage;
  artifact_count?: number;
  artifact_version?: string;
  updated_at?: string;
  created_at?: string;
}

/** GET /api/tasks 响应 */
export interface TaskListResp {
  total: number;
  items: TaskItem[];
}

/** GET /api/tasks/{id} 响应（断点恢复） */
export interface TaskDetail {
  task: TaskItem;
  files?: FileInfo[];
  parsed_text?: string;
  classification?: Classification;
  templates?: ScoringTemplate[];
  results?: ReviewResult[];
}

/* ---------- 展示辅助常量 ---------- */

export const STEP_NAMES = ['新建任务', '信息确认', 'AI 处理中', '专家评审'] as const;

export const STAGE_LABEL: Record<ReviewStage, string> = {
  summary: '总结',
  proposal: '立项',
  combined: '组合',
};

export interface StatusMeta {
  label: string;
  /** AntD Tag/Badge 色 */
  color: 'warning' | 'processing' | 'default' | 'success';
  /** 状态圆点样式类（ra-dot-*） */
  dot: 'warn' | 'run' | 'draft' | 'done';
}

export const TASK_STATUS_META: Record<TaskStatus, StatusMeta> = {
  draft: { label: '草稿', color: 'default', dot: 'draft' },
  classified: { label: '待确认', color: 'warning', dot: 'warn' },
  generating: { label: '生成中', color: 'processing', dot: 'run' },
  reviewing: { label: '待定稿', color: 'warning', dot: 'warn' },
  done: { label: '已完成', color: 'success', dot: 'done' },
};

export const PROJECT_TYPE_OPTIONS = [
  '核心技术攻关',
  '应用技术研究',
  '应用基础研究',
  '研发与示范',
  '平台研发',
  '其他',
];

export const SUB_DOMAIN_OPTIONS = [
  '5G/6G通信',
  '北斗/定位',
  'AI/大模型',
  '算力网络',
  '网络安全',
  '工业互联网',
  '物联网',
  '大数据',
  '其他',
];
