/**
 * 产物列表：文件级版本线，单个版本可下载 + 一键下载当前版本
 * 后端未就绪时显示友好占位
 */

import { useEffect, useState } from 'react';
import { App, Button, Empty, Spin, Timeline } from 'antd';
import { DownloadOutlined, FileWordOutlined } from '@ant-design/icons';
import { api, apiClient, ApiError } from '../api';
import { useTaskStore } from '../stores/taskStore';
import type { ArtifactFile } from '../types';

export function ArtifactList() {
  const { message } = App.useApp();
  const taskId = useTaskStore((s) => s.taskId);
  const artifacts = useTaskStore((s) => s.artifacts);
  const setArtifacts = useTaskStore((s) => s.setArtifacts);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!taskId) return;
    setLoading(true);
    setError(null);
    api
      .getArtifacts(taskId)
      .then((resp) => {
        const files = Array.isArray(resp) ? resp : (resp.files ?? []);
        setArtifacts(files);
      })
      .catch((e) => {
        setError(
          e instanceof ApiError && e.isNetwork
            ? '后端服务未就绪（连接失败）'
            : e instanceof Error
              ? e.message
              : '产物列表获取失败',
        );
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  const download = (fileId: string, version?: number) => {
    apiClient.download(api.artifactDownloadPath(fileId, version));
    message.success('开始下载');
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <Spin size="small" />
      </div>
    );
  }

  if (error) {
    return <Empty description={`产物暂不可用：${error}`} image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }

  if (artifacts.length === 0) {
    return <Empty description="暂无产物文件（定稿后生成 Word）" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }

  return (
    <div>
      {artifacts.map((f: ArtifactFile) => (
        <div key={f.file_id} className="ra-panel ra-panel-pad" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileWordOutlined style={{ fontSize: 20, color: 'var(--ra-brand)' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{f.name}</div>
              <div className="ra-muted">
                {f.file_type} · 当前版本 v{f.current_version ?? (f.versions?.length || 1)}
              </div>
            </div>
            <Button
              type="primary"
              ghost
              size="small"
              icon={<DownloadOutlined />}
              onClick={() => download(f.file_id)}
            >
              下载当前版本
            </Button>
          </div>

          {f.versions && f.versions.length > 0 && (
            <Timeline
              style={{ marginTop: 14, marginBottom: 0 }}
              items={[...f.versions]
                .sort((a, b) => b.version - a.version)
                .map((v) => ({
                  key: v.version,
                  color: v.version === f.current_version ? 'blue' : 'gray',
                  children: (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                      <span style={{ fontWeight: 600 }}>v{v.version}</span>
                      <span className="ra-muted">{v.created_at ?? ''}</span>
                      <span className="ra-muted">{v.note ?? ''}</span>
                      <Button
                        type="link"
                        size="small"
                        icon={<DownloadOutlined />}
                        onClick={() => download(f.file_id, v.version)}
                      >
                        下载
                      </Button>
                    </div>
                  ),
                }))}
            />
          )}
        </div>
      ))}
    </div>
  );
}
