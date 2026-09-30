/**
 * SSE 订阅封装：GET /api/review/{task_id}/stream
 * 协议（SSD §4.3）：
 *   data: {"type": "progress", "step": "战略性", "status": "running", "score": null}
 *   data: {"type": "chunk",    "step": "战略性", "text": "……"}
 *   data: {"type": "complete", "task_id": "...", "word_files": [...]}
 * 后端未就绪 / 断开时回调 onError，调用方负责友好提示。
 */

import { BASE_URL } from './client';
import type { SSEvent } from '../types';

export interface SSEHandlers {
  onEvent: (evt: SSEvent) => void;
  onError?: (err: Error) => void;
  onComplete?: () => void;
}

export interface SSESubscription {
  close: () => void;
}

export function subscribeSSE(path: string, handlers: SSEHandlers): SSESubscription {
  const controller = new AbortController();
  const { onEvent, onError, onComplete } = handlers;
  let closed = false;

  (async () => {
    let resp: Response;
    try {
      resp = await fetch(`${BASE_URL}${path}`, {
        headers: { Accept: 'text/event-stream' },
        signal: controller.signal,
      });
    } catch (e) {
      if (closed) return;
      onError?.(e instanceof Error ? e : new Error('SSE 连接失败（后端未就绪？）'));
      return;
    }

    if (!resp.ok || !resp.body) {
      if (!closed) onError?.(new Error(`SSE 连接失败（HTTP ${resp.status}）`));
      return;
    }

    const reader = resp.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += value;
        // 事件以空行分隔；逐行找 data: 前缀
        let idx: number;
        while ((idx = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (!line.startsWith('data:')) continue;
          const json = line.slice(5).trim();
          if (!json || json === '[DONE]') continue;
          try {
            const evt = JSON.parse(json) as SSEvent;
            if (evt.type === 'complete') {
              onEvent(evt);
              onComplete?.();
              closed = true;
              controller.abort();
              return;
            }
            onEvent(evt);
          } catch {
            // 单行解析失败忽略，继续后续事件
          }
        }
      }
      if (!closed) onError?.(new Error('SSE 流意外结束'));
    } catch (e) {
      if (!closed && !(e instanceof DOMException && e.name === 'AbortError')) {
        onError?.(e instanceof Error ? e : new Error('SSE 读取失败'));
      }
    }
  })();

  return {
    close: () => {
      closed = true;
      controller.abort();
    },
  };
}
