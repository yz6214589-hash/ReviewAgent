/**
 * 步骤条：done 步骤可点击回退（弹确认）；步骤④时步骤③显示"↻ 点击重新评审"
 */

import { App, Modal, Input } from 'antd';
import { useState } from 'react';
import { CheckOutlined, RedoOutlined } from '@ant-design/icons';
import { useTaskStore } from '../../stores/taskStore';
import { STEP_NAMES, type StepNo } from '../../types';

const STEPS: StepNo[] = [1, 2, 3, 4];

export function StepBar() {
  const { modal } = App.useApp();
  const step = useTaskStore((s) => s.step);
  const setStep = useTaskStore((s) => s.setStep);
  const beginStream = useTaskStore((s) => s.beginStream);

  const [redoOpen, setRedoOpen] = useState(false);
  const [suggestion, setSuggestion] = useState('');

  const goBack = (target: StepNo) => {
    modal.confirm({
      title: '回退步骤',
      content: `确定回退到「${STEP_NAMES[target - 1]}」吗？当前步骤的进度将保留在本地。`,
      okText: '回退',
      cancelText: '取消',
      onOk: () => setStep(target),
    });
  };

  const redoReview = () => {
    setRedoOpen(false);
    beginStream(); // 回到步骤③并清空流状态，Processing 会重新订阅 SSE
  };

  return (
    <div className="ra-stepbar">
      {STEPS.map((s, i) => {
        const isDone = s < step;
        const isActive = s === step;
        // 步骤④时，步骤③变为"重新评审"入口
        const isRedo = s === 3 && step === 4;
        return (
          <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
            <div
              className={`ra-step ${isDone ? 'done' : ''} ${isActive ? 'active' : ''}`}
              onClick={() => {
                if (isRedo) setRedoOpen(true);
                else if (isDone) goBack(s);
              }}
            >
              <div className="ra-step-dot">
                {isRedo ? <RedoOutlined /> : isDone ? <CheckOutlined /> : s}
              </div>
              <div className="ra-step-label">
                {isRedo ? '点击重新评审' : STEP_NAMES[s - 1]}
              </div>
            </div>
            {i < STEPS.length - 1 && <div className={`ra-step-line ${isDone ? 'done' : ''}`} />}
          </div>
        );
      })}

      <Modal
        title="重新 AI 评审"
        open={redoOpen}
        onCancel={() => setRedoOpen(false)}
        okText="重新评审"
        cancelText="取消"
        onOk={redoReview}
      >
        <div className="ra-muted" style={{ marginBottom: 8 }}>
          可填写修改建议（可选），将携带上一次结果重新触发 AI 评审流程。
        </div>
        <Input.TextArea
          rows={4}
          placeholder="例如：战略性维度评分偏高，请结合申报书第三章重新评估…"
          value={suggestion}
          onChange={(e) => setSuggestion(e.target.value)}
        />
      </Modal>
    </div>
  );
}
