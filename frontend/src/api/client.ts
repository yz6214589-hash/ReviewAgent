/**
 * 统一 HTTP 客户端（阶段一：后端可能未就绪，需容错）。
 * - baseURL 集中管理：开发走 vite proxy（/api -> http://localhost:8000）
 * - 断网 / 404 时抛出带语义的错误，页面捕获后友好提示，不白屏
 */

export const BASE_URL = '/api';

export class ApiError extends Error {
  status: number;
  payload: unknown;
  constructor(message: string, status = 0, payload?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
  /** 网络层失败（后端未启动 / 断网） */
  get isNetwork() {
    return this.status === 0;
  }
  get isNotFound() {
    return this.status === 404;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  /** 不拼接 BASE_URL（用于流式等自带完整路径的场景） */
  raw?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, raw } = options;
  const url = raw ? path : `${BASE_URL}${path}`;

  let resp: Response;
  try {
    resp = await fetch(url, {
      method,
      signal,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError('后端服务未就绪（连接失败）', 0, e);
  }

  if (!resp.ok) {
    let payload: unknown;
    try {
      payload = await resp.json();
    } catch {
      payload = await resp.text().catch(() => '');
    }
    const msg =
      (typeof payload === 'object' && payload !== null && 'detail' in payload
        ? String((payload as { detail: unknown }).detail)
        : '') || `请求失败（HTTP ${resp.status}）`;
    throw new ApiError(msg, resp.status, payload);
  }

  const contentType = resp.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return (await resp.json()) as T;
  }
  return (await resp.text()) as unknown as T;
}

export const apiClient = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    request<T>(path, { method: 'POST', body, signal }),
  put: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    request<T>(path, { method: 'PUT', body, signal }),
  del: <T>(path: string, signal?: AbortSignal) => request<T>(path, { method: 'DELETE', signal }),

  /** 文件上传（multipart/form-data） */
  async upload<T>(path: string, files: File[], extra?: Record<string, string>): Promise<T> {
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    if (extra) Object.entries(extra).forEach(([k, v]) => form.append(k, v));

    let resp: Response;
    try {
      resp = await fetch(`${BASE_URL}${path}`, { method: 'POST', body: form });
    } catch (e) {
      throw new ApiError('后端服务未就绪（连接失败）', 0, e);
    }
    if (!resp.ok) {
      let payload: unknown;
      try {
        payload = await resp.json();
      } catch {
        payload = '';
      }
      const msg =
        (typeof payload === 'object' && payload !== null && 'detail' in payload
          ? String((payload as { detail: unknown }).detail)
          : '') || `上传失败（HTTP ${resp.status}）`;
      throw new ApiError(msg, resp.status, payload);
    }
    return (await resp.json()) as T;
  },

  /** 触发浏览器下载 */
  download(path: string) {
    const a = document.createElement('a');
    a.href = `${BASE_URL}${path}`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  },
};
