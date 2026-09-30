/**
 * 任务切换器：顶栏下拉，搜索 + 状态圆点，点击切换到对应任务的工作台断点
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Dropdown, Empty, Input, Spin } from 'antd';
import { DownOutlined, SearchOutlined, SwapOutlined } from '@ant-design/icons';
import { api, ApiError } from '../api';
import { useTaskStore, statusToStep } from '../stores/taskStore';
import { TASK_STATUS_META, type TaskItem } from '../types';

export function TaskSwitcher() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const taskId = useTaskStore((s) => s.taskId);
  const projectName = useTaskStore((s) => s.projectName);
  const status = useTaskStore((s) => s.status);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [backendDown, setBackendDown] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api
      .getTasks({ page: 1, page_size: 50 })
      .then((resp) => {
        setTasks(resp.items ?? []);
        setBackendDown(false);
      })
      .catch((e) => {
        if (e instanceof ApiError) setBackendDown(true);
        setTasks([]);
      })
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return tasks;
    return tasks.filter((t) => (t.project_name ?? '').toLowerCase().includes(kw));
  }, [tasks, keyword]);

  const meta = TASK_STATUS_META[status];

  const overlay = (
    <div
      className="ra-panel"
      style={{ width: 300, padding: 8, maxHeight: 360, display: 'flex', flexDirection: 'column' }}
      onClick={(e) => e.stopPropagation()}
    >
      <Input
        size="small"
        allowClear
        prefix={<SearchOutlined style={{ color: 'var(--ra-text-3)' }} />}
        placeholder="搜索任务名称"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        style={{ marginBottom: 6 }}
      />
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Spin size="small" />
          </div>
        ) : backendDown ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="后端服务未就绪，无法获取任务"
            style={{ padding: '16px 0' }}
          />
        ) : filtered.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无任务" style={{ padding: '16px 0' }} />
        ) : (
          filtered.map((t) => {
            const m = TASK_STATUS_META[t.status];
            return (
              <div
                key={t.id}
                className="ra-recent-card"
                style={{ marginBottom: 4, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8 }}
                onClick={() => {
                  setOpen(false);
                  navigate(`/workbench/${t.id}?step=${t.current_step ?? statusToStep(t.status)}`);
                }}
              >
                <span className={`ra-sd ra-sd-${m?.dot ?? 'draft'}`} />
                <span style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.project_name || t.id}
                </span>
                <span className="ra-muted">{m?.label ?? t.status}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <Dropdown
      open={open}
      onOpenChange={setOpen}
      dropdownRender={() => overlay}
      trigger={['click']}
      placement="bottomLeft"
    >
      <div
        className="ra-task-switch"
        onClick={() => {
          if (backendDown && open) message.info('后端服务未就绪，任务列表暂不可用');
        }}
      >
        <SwapOutlined style={{ color: 'var(--ra-text-3)', fontSize: 12 }} />
        {taskId ? (
          <>
            <span className={`ra-sd ra-sd-${meta?.dot ?? 'draft'}`} />
            <span className="ra-task-switch-name">{projectName || taskId}</span>
          </>
        ) : (
          <span className="ra-task-switch-empty">切换任务</span>
        )}
        <DownOutlined style={{ color: 'var(--ra-text-3)', fontSize: 10 }} />
      </div>
    </Dropdown>
  );
}
