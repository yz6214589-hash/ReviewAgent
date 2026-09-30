/**
 * 步骤① 新建任务：左侧上传区（3）+ 右侧最近任务（2）
 * 上传成功 -> applyUpload -> 进入步骤②（信息确认）
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Button, Empty, Spin, Upload } from 'antd';
import {
  CloudUploadOutlined,
  FileTextOutlined,
  LockOutlined,
  RightOutlined,
} from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import { api, ApiError } from '../../api';
import { useTaskStore, statusToStep } from '../../stores/taskStore';
import { TASK_STATUS_META, type TaskItem } from '../../types';

const ACCEPT = '.docx,.pdf,.xlsx,.pptx,.txt';
const MAX_SIZE_MB = 20;
const MAX_COUNT = 10;

export function NewTask() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const applyUpload = useTaskStore((s) => s.applyUpload);

  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [uploading, setUploading] = useState(false);

  const [recent, setRecent] = useState<TaskItem[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentError, setRecentError] = useState(false);

  useEffect(() => {
    api
      .getTasks({ page: 1, page_size: 5 })
      .then((resp) => setRecent(resp.items ?? []))
      .catch(() => setRecentError(true))
      .finally(() => setRecentLoading(false));
  }, []);

  const beforeUpload = (file: File) => {
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      message.error(`「${file.name}」超过 ${MAX_SIZE_MB}MB 限制`);
      return Upload.LIST_IGNORE;
    }
    if (fileList.length >= MAX_COUNT) {
      message.error(`最多上传 ${MAX_COUNT} 个文件`);
      return Upload.LIST_IGNORE;
    }
    return false; // 阻止自动上传，手动收集
  };

  const doUpload = async () => {
    const files = fileList
      .map((f) => f.originFileObj)
      .filter((f): f is File => Boolean(f));
    if (files.length === 0) {
      message.warning('请先选择要上传的申报材料');
      return;
    }
    setUploading(true);
    try {
      const resp = await api.uploadMaterials(files);
      applyUpload(resp.task_id, resp.project_name ?? files[0].name.replace(/\.[^.]+$/, ''), resp.files ?? []);
      message.success('材料上传成功，正在识别分类信息…');
    } catch (e) {
      if (e instanceof ApiError && e.isNetwork) {
        message.error('后端服务未就绪（连接失败），请确认 backend 已启动在 8000 端口');
      } else {
        message.error(e instanceof Error ? e.message : '上传失败');
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16, marginTop: 8 }}>
      {/* 左：上传区 */}
      <div className="ra-panel ra-panel-pad">
        <div className="ra-section-title">新建评审任务</div>
        <div className="ra-muted" style={{ margin: '6px 0 16px' }}>
          上传项目申报材料，AI 将自动识别项目类别并生成评审初稿
        </div>

        <div className="ra-upload-zone">
          <Upload.Dragger
            multiple
            accept={ACCEPT}
            fileList={fileList}
            beforeUpload={beforeUpload}
            onChange={({ fileList: fl }) => setFileList(fl.slice(0, MAX_COUNT))}
            onRemove={(f) => setFileList((prev) => prev.filter((x) => x.uid !== f.uid))}
          >
            <p className="ra-upload-icon">
              <CloudUploadOutlined />
            </p>
            <p style={{ fontSize: 14, color: 'var(--ra-text)', margin: '4px 0' }}>
              点击或拖拽文件到此区域上传
            </p>
            <p className="ra-muted">
              支持 docx / pdf / xlsx / pptx / txt，单个文件 ≤ {MAX_SIZE_MB}MB，最多 {MAX_COUNT} 个
            </p>
          </Upload.Dragger>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 16,
          }}
        >
          <span className="ra-muted">
            <LockOutlined style={{ marginRight: 4 }} />
            数据不出内网 · 全部材料仅存储于本地服务器
          </span>
          <Button
            type="primary"
            size="large"
            loading={uploading}
            disabled={fileList.length === 0}
            onClick={doUpload}
            icon={<RightOutlined />}
            iconPosition="end"
          >
            上传并开始识别
          </Button>
        </div>
      </div>

      {/* 右：最近任务 */}
      <div className="ra-panel ra-panel-pad">
        <div className="ra-section-title">最近任务</div>
        <div className="ra-muted" style={{ margin: '6px 0 14px' }}>
          点击可回到对应任务的工作台断点
        </div>

        {recentLoading ? (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <Spin size="small" />
          </div>
        ) : recentError ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="后端服务未就绪，最近任务暂不可用"
          />
        ) : recent.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无历史任务" />
        ) : (
          recent.map((t) => {
            const m = TASK_STATUS_META[t.status];
            return (
              <div
                key={t.id}
                className="ra-recent-card"
                onClick={() =>
                  navigate(`/workbench/${t.id}?step=${t.current_step ?? statusToStep(t.status)}`)
                }
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FileTextOutlined style={{ color: 'var(--ra-brand)' }} />
                  <span
                    style={{
                      flex: 1,
                      fontSize: 13,
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {t.project_name || t.id}
                  </span>
                  <span className={`ra-pill ${m?.dot ?? ''}`}>{m?.label ?? t.status}</span>
                </div>
                <div className="ra-muted" style={{ marginTop: 6 }}>
                  {t.project_type ?? '未分类'} · {t.updated_at ?? t.created_at ?? ''}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
