/**
 * 后端 API 封装（SSD §3.3 的 13 个接口）。
 * 阶段一：后端可能未实现，调用方统一捕获 ApiError 友好提示。
 */

import { apiClient } from './client';
import type {
  ArtifactsResp,
  ClassifyResp,
  ConfirmReq,
  ScoringTemplate,
  TaskDetail,
  TaskListResp,
  UploadResp,
} from '../types';

export const api = {
  // ① 上传材料
  uploadMaterials: (files: File[]) => apiClient.upload<UploadResp>('/upload', files),

  // ② 触发分类识别
  classify: (taskId: string) => apiClient.post<ClassifyResp>(`/review/${taskId}/classify`),

  // ④ 信息确认（interrupt ① 恢复）
  confirm: (taskId: string, body: ConfirmReq) =>
    apiClient.post<{ status: string }>(`/review/${taskId}/confirm`, body),

  // ⑦ 人工终稿确认（interrupt ② 恢复）
  finalize: (taskId: string, body: { final_draft?: string; operator?: string }) =>
    apiClient.post<{ status: string }>(`/review/${taskId}/finalize`, body),

  // ⑧ 产物文件列表
  getArtifacts: (taskId: string) => apiClient.get<ArtifactsResp>(`/review/${taskId}/artifacts`),

  // ⑨ 产物下载地址
  artifactDownloadPath: (fileId: string, version?: number) =>
    `/review/artifacts/${fileId}/download${version ? `?version=${version}` : ''}`,

  // ⑩ 任务列表
  getTasks: (params: {
    status?: string;
    project_type?: string;
    stage?: string;
    keyword?: string;
    page?: number;
    page_size?: number;
  }) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') qs.set(k, String(v));
    });
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return apiClient.get<TaskListResp>(`/tasks${suffix}`);
  },

  // ⑪ 任务详情（断点恢复）
  getTaskDetail: (taskId: string) => apiClient.get<TaskDetail>(`/tasks/${taskId}`),

  // ⑫ 配置：模板 / 规则 / few-shot / 历史（阶段一仅占位路由，封装备用）
  getTemplates: () =>
    apiClient.get<{ templates: ScoringTemplate[] } | ScoringTemplate[]>('/config/templates'),
  getRules: () => apiClient.get<Record<string, unknown>>('/config/rules'),
  getFewshot: () => apiClient.get<Record<string, unknown>>('/config/fewshot'),
  getConfigHistory: () => apiClient.get<Record<string, unknown>>('/config/history'),
};

export { ApiError } from './client';
export { subscribeSSE } from './sse';
