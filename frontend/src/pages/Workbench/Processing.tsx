/**
 * 步骤③ AI 处理中：
 * - subscribeSSE 订阅 GET /api/review/{id}/stream
 * - 逐维度 proc-line（wait/run/done）+ 终端化预览窗实时滚动 chunk
 * - complete -> 自动进入步骤④；error/断网 -> 友好提示可重试
 */

import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Alert, Button } from 'antd';
import {
  CheckCircleFilled,
  ClockCircleOutlined,
  LoadingOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { subscribeSSE, type SSESubscription } from '../../api/sse';
import { useTaskStore } from '../../stores/taskStore';

export function Processing() {
  const { message } = App.useApp();
  const navigate = useNavigate();

  const taskId = useTaskStore((s) => s.taskId);
  const templates = useTaskStore((s) => s.templates);
  const selectedTemplateIds = useTaskStore((s) => s.selectedTemplateIds);
  const dimProgress = useTaskStore((s) => s.dimProgress);
  const streamText = useTaskStore((s) => s.streamText);
  const streamDone = useTaskStore((s) => s.streamDone);
  const streamError = useTaskStore((s) => s.streamError);
  const applySSEvent = useTaskStore((s) => s.applySSEvent);
  const setStreamError = useTaskStore((s) => s.setStreamError);
  const setStep = useTaskStore((s) => s.setStep);

  const subRef = useRef<SSESubscription | null>(null);
  const termRef = useRef<HTMLDivElement>(null);

  // 维度名列表：优先模板维度，兜底已出现的事件 step
  const dimNames = useMemo(() => {
    const fromTemplates = templates
      .filter((t) => selectedTemplateIds.includes(t.template_id))
      .flatMap((t) => (t.dimensions ?? []).map((d) => d.name));
    const fromEvents = Object.keys(dimProgress);
    const merged = [...fromTemplates];
    fromEvents.forEach((n) => {
      if (!merged.includes(n)) merged.push(n);
    });
    return merged;
  }, [templates, selectedTemplateIds, dimProgress]);

  useEffect(() => {
    if (!taskId) return;
    if (streamDone) return; // 已完成则不重复订阅

    subRef.current?.close();
    const sub = subscribeSSE(`/review/${taskId}/stream`, {
      onEvent: (evt) => applySSEvent(evt),
      onError: (err) => setStreamError(err.message || 'SSE 连接失败'),
      onComplete: () => {
        message.success('AI 评审初稿生成完毕，进入专家评审');
      },
    });
    subRef.current = sub;
    return () => sub.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  // 终端自动滚动到底
  useEffect(() => {
    const el = termRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [streamText]);

  // 完成即跳步骤④
  useEffect(() => {
    if (streamDone) {
      const t = setTimeout(() => setStep(4), 600);
      return () => clearTimeout(t);
    }
  }, [streamDone, setStep]);

  if (!taskId) {
    return (
      <Alert
        type="info"
        showIcon
        message="当前没有进行中的评审任务"
        action={<Button size="small" onClick={() => navigate('/workbench')}>返回新建</Button>}
      />
    );
  }

  const retry = () => {
    setStreamError(null);
    // 触发重新订阅：通过重置 key 的方式
    subRef.current?.close();
    const sub = subscribeSSE(`/review/${taskId}/stream`, {
      onEvent: (evt) => applySSEvent(evt),
      onError: (err) => setStreamError(err.message || 'SSE 连接失败'),
    });
    subRef.current = sub;
  };

  const stateOf = (name: string) => {
    const p = dimProgress[name];
    if (!p) return 'wait';
    if (p.status === 'done' || p.status === 'completed') return 'done';
    return 'run';
  };

  return (
    <div>
      <div className="ra-panel ra-panel-pad ra-scan-card" style={{ marginBottom: 16 }}>
        <div className="ra-section-title">AI 正在逐维度评审</div>
        <div className="ra-muted" style={{ margin: '6px 0 14px' }}>
          评审过程实时输出，完成后自动进入专家评审环节
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
          {(dimNames.length > 0 ? dimNames : ['等待评审维度事件…']).map((name) => {
            const st = stateOf(name);
            return (
              <div key={name} className={`ra-proc-line ${st}`}>
                {st === 'wait' && <ClockCircleOutlined style={{ color: 'var(--ra-text-3)' }} />}
                {st === 'run' && <LoadingOutlined style={{ color: 'var(--ra-brand)' }} />}
                {st === 'done' && <CheckCircleFilled style={{ color: '#00b42a' }} />}
                <span className="ra-proc-name">{name}</span>
                <span className="ra-muted">
                  {st === 'wait' ? '等待中' : st === 'run' ? '评审中' : '已完成'}
                </span>
              </div>
            );
          })}
        </div>

        {!streamDone && !streamError && <div className="ra-flow-bar" style={{ marginTop: 14 }} />}

        {streamError && (
          <Alert
            style={{ marginTop: 14 }}
            type="warning"
            showIcon
            message="评审流中断"
            description={`${streamError}（后端可能未就绪，可在修复后重试；已收到的进度不会丢失）`}
            action={
              <Button size="small" icon={<ReloadOutlined />} onClick={retry}>
                重试连接
              </Button>
            }
          />
        )}
      </div>

      {/* 终端化预览窗 */}
      <div className="ra-terminal">
        <div className="ra-terminal-bar">
          <span className="ra-terminal-dot" style={{ background: '#ff5f56' }} />
          <span className="ra-terminal-dot" style={{ background: '#ffbd2e' }} />
          <span className="ra-terminal-dot" style={{ background: '#27c93f' }} />
          <span className="ra-terminal-title ra-mono">
            review-agent · stream · task={taskId.slice(0, 8)}
          </span>
        </div>
        <div className="ra-terminal-body" ref={termRef}>
          {streamText || '$ 等待评审输出…'}
          {!streamDone && !streamError && <span className="ra-cursor" />}
          {streamDone && '\n\n$ 评审流已完成 ✓'}
        </div>
      </div>
    </div>
  );
}
