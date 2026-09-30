/**
 * 工作台编排页：根据 step 渲染四步流水线
 * 断点恢复：/workbench/:taskId 进入时拉取任务详情推导步骤
 */

import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { App, Alert, Button, Spin } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { api, ApiError } from '../../api';
import { useTaskStore, statusToStep } from '../../stores/taskStore';
import { StepBar } from './StepBar';
import { NewTask } from './NewTask';
import { ConfirmInfo } from './ConfirmInfo';
import { Processing } from './Processing';
import { ExpertReview } from '../ExpertReview';

export function Workbench() {
  const { message } = App.useApp();
  const { taskId } = useParams<{ taskId: string }>();
  const [searchParams] = useSearchParams();

  const step = useTaskStore((s) => s.step);
  const currentTaskId = useTaskStore((s) => s.taskId);
  const applyDetail = useTaskStore((s) => s.applyDetail);
  const setStep = useTaskStore((s) => s.setStep);
  const reset = useTaskStore((s) => s.reset);

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadedRef = useRef<string | null>(null);

  useEffect(() => {
    // 无 taskId：回到新建任务（保留已有进行中的工作台状态则不清空，仅在显式不带 id 且 store 为空时保持 step1）
    if (!taskId) {
      if (loadedRef.current) {
        loadedRef.current = null;
        reset();
      }
      return;
    }
    if (loadedRef.current === taskId && currentTaskId === taskId) return;

    setLoading(true);
    setLoadError(null);
    api
      .getTaskDetail(taskId)
      .then((d) => {
        const derived = applyDetail(d);
        loadedRef.current = taskId;
        const qStep = Number(searchParams.get('step'));
        if (qStep >= 1 && qStep <= 4) setStep(qStep as 1 | 2 | 3 | 4);
        else setStep(derived);
      })
      .catch((e) => {
        const msgText =
          e instanceof ApiError
            ? e.isNetwork
              ? '后端服务未就绪，无法恢复任务断点'
              : e.isNotFound
                ? '任务不存在或已被清理（404）'
                : e.message
            : '任务加载失败';
        setLoadError(msgText);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  if (taskId && loading) {
    return (
      <div className="ra-page" style={{ textAlign: 'center', paddingTop: 120 }}>
        <Spin />
        <div className="ra-muted" style={{ marginTop: 12 }}>
          正在恢复任务断点…
        </div>
      </div>
    );
  }

  if (taskId && loadError) {
    return (
      <div className="ra-page" style={{ maxWidth: 720 }}>
        <Alert
          type="warning"
          showIcon
          message="任务断点恢复失败"
          description={loadError}
          action={
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={() => {
                loadedRef.current = null;
                setLoadError(null);
                setLoading(true);
                api
                  .getTaskDetail(taskId)
                  .then((d) => {
                    const derived = applyDetail(d);
                    loadedRef.current = taskId;
                    setStep(derived);
                    message.success('任务已恢复');
                  })
                  .catch(() => setLoadError('后端服务仍未就绪'))
                  .finally(() => setLoading(false));
              }}
            >
              重试
            </Button>
          }
        />
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Button
            onClick={() => {
              reset();
              window.history.replaceState(null, '', '/workbench');
            }}
          >
            返回新建任务
          </Button>
        </div>
      </div>
    );
  }

  // 从 URL 推断状态映射（防止刷新丢失）
  void statusToStep;

  return (
    <div className={step === 4 ? 'ra-page ra-page-wide' : 'ra-page'}>
      {step !== 1 && <StepBar />}
      {step === 1 && <NewTask />}
      {step === 2 && <ConfirmInfo />}
      {step === 3 && <Processing />}
      {step === 4 && <ExpertReview />}
    </div>
  );
}
