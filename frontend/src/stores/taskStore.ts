/**
 * 工作台全局状态（Zustand）
 * 覆盖四步流水线：新建任务 → 信息确认 → AI 处理中 → 专家评审
 * 断点恢复：applyDetail 根据后端任务详情推导应回到的步骤
 */

import { create } from 'zustand';
import type {
  ArtifactFile,
  Classification,
  FileInfo,
  ReviewResult,
  ScoringTemplate,
  SSEvent,
  StepNo,
  TaskDetail,
  TaskItem,
  TaskStatus,
} from '../types';

export type DraftStage = 'summary' | 'proposal';

interface WorkbenchState {
  taskId: string | null;
  projectName: string;
  status: TaskStatus;
  step: StepNo;
  files: FileInfo[];

  classification: Classification | null;
  templates: ScoringTemplate[];
  selectedTemplateIds: string[];

  /** 各维度 SSE 进度：维度名 -> 状态/建议区间 */
  dimProgress: Record<string, { status: 'running' | 'done'; score?: string | null }>;
  /** 终端预览窗累积文本 */
  streamText: string;
  streamDone: boolean;
  streamError: string | null;
  wordFiles: string[];

  /** 专家评审数据（summary / proposal 各一条） */
  results: ReviewResult[];
  artifacts: ArtifactFile[];
  expertScores: Record<string, number>;
  expertComments: Record<string, string>;
  editedDrafts: Partial<Record<DraftStage, string>>;
  parsedText: string | null;

  // actions
  reset: () => void;
  setStep: (step: StepNo) => void;
  applyUpload: (taskId: string, projectName: string, files: FileInfo[]) => void;
  applyClassification: (c: Classification, templates: ScoringTemplate[]) => void;
  setTemplates: (t: ScoringTemplate[]) => void;
  setClassification: (c: Classification) => void;
  setSelectedTemplateIds: (ids: string[]) => void;
  beginStream: () => void;
  applySSEvent: (evt: SSEvent) => void;
  setStreamError: (msg: string | null) => void;
  applyDetail: (d: TaskDetail) => StepNo;
  setResults: (r: ReviewResult[]) => void;
  setArtifacts: (a: ArtifactFile[]) => void;
  setExpertScore: (dim: string, score: number) => void;
  setExpertComment: (dim: string, comment: string) => void;
  setEditedDraft: (stage: DraftStage, content: string) => void;
}

const initialState = {
  taskId: null as string | null,
  projectName: '',
  status: 'draft' as TaskStatus,
  step: 1 as StepNo,
  files: [] as FileInfo[],
  classification: null as Classification | null,
  templates: [] as ScoringTemplate[],
  selectedTemplateIds: [] as string[],
  dimProgress: {} as Record<string, { status: 'running' | 'done'; score?: string | null }>,
  streamText: '',
  streamDone: false,
  streamError: null as string | null,
  wordFiles: [] as string[],
  results: [] as ReviewResult[],
  artifacts: [] as ArtifactFile[],
  expertScores: {} as Record<string, number>,
  expertComments: {} as Record<string, string>,
  editedDrafts: {} as Partial<Record<DraftStage, string>>,
  parsedText: null as string | null,
};

/** 任务状态 → 工作台步骤（后端 TaskItem.current_step 优先，此处为兜底推导） */
export function statusToStep(status: TaskStatus): StepNo {
  switch (status) {
    case 'classified':
      return 2;
    case 'generating':
      return 3;
    case 'reviewing':
    case 'done':
      return 4;
    default:
      return 1;
  }
}

/** 模板是否与分类结果匹配（阶段一前端推导：类别 + 评审阶段双条件） */
export function isTemplateMatched(t: ScoringTemplate, c: Classification | null): boolean {
  if (!c) return false;
  const catOk = t.category
    ? t.category === (c.is_applied_basic ? 'applied_basic' : 'non_applied_basic')
    : true;
  return catOk && t.stage === c.stage;
}

export const useTaskStore = create<WorkbenchState>()((set, get) => ({
  ...initialState,

  reset: () => set({ ...initialState }),
  setStep: (step) => set({ step }),

  applyUpload: (taskId, projectName, files) =>
    set({ taskId, projectName, files, status: 'draft', step: 2 }),

  applyClassification: (classification, templates) =>
    set((s) => ({
      classification,
      templates,
      status: 'classified',
      step: 2,
      projectName: s.projectName || classification.project_name || s.projectName,
      // 默认勾选匹配模板
      selectedTemplateIds: templates
        .filter((t) => isTemplateMatched(t, classification))
        .map((t) => t.id),
    })),

  setTemplates: (templates) =>
    set((s) => ({
      templates,
      selectedTemplateIds:
        s.selectedTemplateIds.length > 0
          ? s.selectedTemplateIds
          : templates.filter((t) => isTemplateMatched(t, s.classification)).map((t) => t.id),
    })),

  setClassification: (classification) => set({ classification }),
  setSelectedTemplateIds: (selectedTemplateIds) => set({ selectedTemplateIds }),

  beginStream: () =>
    set({
      step: 3,
      status: 'generating',
      dimProgress: {},
      streamText: '',
      streamDone: false,
      streamError: null,
      wordFiles: [],
    }),

  applySSEvent: (evt) =>
    set((s) => {
      if (evt.type === 'progress' && evt.step) {
        return {
          dimProgress: {
            ...s.dimProgress,
            [evt.step]: { status: evt.status ?? 'running', score: evt.score ?? null },
          },
        };
      }
      if (evt.type === 'chunk' && evt.text) {
        const prefix = evt.step ? `[${evt.step}] ` : '';
        return { streamText: s.streamText + prefix + evt.text };
      }
      if (evt.type === 'complete') {
        return { streamDone: true, wordFiles: evt.word_files ?? [], status: 'reviewing' };
      }
      if (evt.type === 'error') {
        return { streamError: evt.message ?? '评审流发生错误' };
      }
      return {};
    }),

  setStreamError: (streamError) => set({ streamError }),

  applyDetail: (d) => {
    const task: TaskItem | undefined = d.task;
    const step: StepNo = task?.current_step ?? statusToStep(task?.status ?? 'draft');
    const templates = d.templates ?? [];
    const classification = d.classification ?? null;
    set({
      taskId: task?.id ?? null,
      projectName: task?.project_name ?? '',
      status: task?.status ?? 'draft',
      step,
      files: d.files ?? [],
      parsedText: d.parsed_text ?? null,
      classification,
      templates,
      selectedTemplateIds: templates
        .filter((t) => isTemplateMatched(t, classification))
        .map((t) => t.id),
      results: d.results ?? [],
      editedDrafts: {},
    });
    return get().step;
  },

  setResults: (results) => set({ results }),
  setArtifacts: (artifacts) => set({ artifacts }),
  setExpertScore: (dim, score) =>
    set((s) => ({ expertScores: { ...s.expertScores, [dim]: score } })),
  setExpertComment: (dim, comment) =>
    set((s) => ({ expertComments: { ...s.expertComments, [dim]: comment } })),
  setEditedDraft: (stage, content) =>
    set((s) => ({ editedDrafts: { ...s.editedDrafts, [stage]: content } })),
}));
