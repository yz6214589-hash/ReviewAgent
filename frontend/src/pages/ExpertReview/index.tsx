/**
 * 步骤④ 专家评审：
 * 左 3 - 材料阅读器（DocViewer，证据锚点定位）
 * 右 2 - 四页签：综述草稿 / 申报建议 / 打分维度 / 产物
 * 底部 - 人工确认门②：↻ 重新 AI 评审 + ✓ 定稿并生成产物（POST finalize 后下载 Word）
 */

import { useEffect, useMemo, useState } from 'react';
import { App, Alert, Button, Input, Modal, Tabs } from 'antd';
import {
  CheckOutlined,
  CommentOutlined,
  DownloadOutlined,
  EditOutlined,
  RedoOutlined,
} from '@ant-design/icons';
import { api, apiClient, ApiError } from '../../api';
import { useTaskStore } from '../../stores/taskStore';
import { DocViewer, type LocateRequest } from '../../components/DocViewer';
import { DimCard } from '../../components/DimCard';
import { ArtifactList } from '../../components/ArtifactList';
import { ChatPanel } from '../../components/ChatPanel';
import { STAGE_LABEL, type DimResult, type ReviewStage } from '../../types';

export function ExpertReview() {
  const { message } = App.useApp();

  const taskId = useTaskStore((s) => s.taskId);
  const files = useTaskStore((s) => s.files);
  const results = useTaskStore((s) => s.results);
  const editedDrafts = useTaskStore((s) => s.editedDrafts);
  const expertScores = useTaskStore((s) => s.expertScores);
  const expertComments = useTaskStore((s) => s.expertComments);
  const wordFiles = useTaskStore((s) => s.wordFiles);
  const setResults = useTaskStore((s) => s.setResults);
  const setEditedDraft = useTaskStore((s) => s.setEditedDraft);
  const beginStream = useTaskStore((s) => s.beginStream);
  const artifacts = useTaskStore((s) => s.artifacts);

  const [locate, setLocate] = useState<LocateRequest | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [redoOpen, setRedoOpen] = useState(false);
  const [redoText, setRedoText] = useState('');
  const [finalizing, setFinalizing] = useState(false);
  const [backendNote, setBackendNote] = useState<string | null>(null);

  // 断点恢复时若本地无结果，拉一次详情
  useEffect(() => {
    if (!taskId) return;
    if (Object.keys(results).length > 0) return;
    api
      .getTaskDetail(taskId)
      .then((d) => {
        if (d.results) setResults(d.results);
      })
      .catch((e) => {
        if (e instanceof ApiError) {
          setBackendNote(e.isNetwork ? '后端服务未就绪，评审结果暂不可拉取' : e.message);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  const dimensions: DimResult[] = useMemo(() => {
    const combined = results.combined?.dimensions;
    if (combined && combined.length > 0) return combined;
    return results.summary?.dimensions ?? [];
  }, [results]);

  const locateEvidence = (key: string) => {
    if (!key) return;
    setLocate((prev) => ({ key, seq: (prev?.seq ?? 0) + 1 }));
  };

  const doFinalize = async () => {
    if (!taskId) return;
    setFinalizing(true);
    try {
      await api.finalize(taskId, {
        final_draft: editedDrafts.combined ?? editedDrafts.summary ?? '',
        operator: '专家秘书',
      });
      message.success('已定稿，产物生成中…开始下载 Word');
      // 下载：优先 SSE 返回的 word_files，其次产物列表
      if (wordFiles.length > 0) {
        wordFiles.forEach((w) => {
          const hit = artifacts.find((a) => a.name === w);
          if (hit) apiClient.download(api.artifactDownloadPath(hit.file_id));
        });
      } else if (artifacts.length > 0) {
        artifacts.forEach((a) => apiClient.download(api.artifactDownloadPath(a.file_id)));
      }
    } catch (e) {
      if (e instanceof ApiError && e.isNetwork) {
        message.error('后端服务未就绪（连接失败），无法定稿');
      } else {
        message.error(e instanceof Error ? e.message : '定稿失败');
      }
    } finally {
      setFinalizing(false);
    }
  };

  const draftTab = (stage: ReviewStage) => {
    const r = results[stage];
    const content = editedDrafts[stage] ?? r?.content ?? '';
    return (
      <div>
        {r && (
          <div className="ra-muted" style={{ marginBottom: 8 }}>
            总分建议区间：{r.total_score_range ? `${r.total_score_range[0]} ~ ${r.total_score_range[1]}` : '—'}
            {typeof r.fewshot_count === 'number' && ` · 参考历史样例 ${r.fewshot_count} 篇`}
          </div>
        )}
        {content ? (
          <Input.TextArea
            value={content}
            onChange={(e) => setEditedDraft(stage, e.target.value)}
            autoSize={{ minRows: 14, maxRows: 26 }}
            style={{ fontSize: 13, lineHeight: 1.9 }}
          />
        ) : (
          <Alert
            type="info"
            showIcon
            message={`暂无${STAGE_LABEL[stage]}内容`}
            description="后端返回结果后在此展示并可直接编辑；断点恢复时自动回填。"
          />
        )}
      </div>
    );
  };

  return (
    <div>
      {backendNote && (
        <Alert type="info" showIcon message={backendNote} style={{ marginBottom: 12 }} closable />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16 }}>
        {/* 左：材料阅读器 */}
        <DocViewer files={files} locate={locate} />

        {/* 右：四页签 */}
        <div className="ra-panel" style={{ padding: '4px 16px 16px' }}>
          <Tabs
            defaultActiveKey="summary"
            items={[
              {
                key: 'summary',
                label: (
                  <span>
                    <EditOutlined /> 综述草稿
                  </span>
                ),
                children: draftTab('summary'),
              },
              {
                key: 'proposal',
                label: (
                  <span>
                    <EditOutlined /> 申报建议
                  </span>
                ),
                children: draftTab('proposal'),
              },
              {
                key: 'dims',
                label: '打分维度',
                children: (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                      <Button
                        size="small"
                        icon={<CommentOutlined />}
                        onClick={() => setChatOpen(true)}
                      >
                        AI 对话
                      </Button>
                    </div>
                    {dimensions.length === 0 ? (
                      <Alert
                        type="info"
                        showIcon
                        message="暂无维度评分结果"
                        description="AI 评审完成后展示各维度卡片；后端未就绪时本页签为空属正常现象。"
                      />
                    ) : (
                      dimensions.map((d) => (
                        <DimCard key={d.name} dim={d} onLocateEvidence={locateEvidence} />
                      ))
                    )}
                  </div>
                ),
              },
              {
                key: 'artifacts',
                label: '产物',
                children: <ArtifactList />,
              },
            ]}
          />
        </div>
      </div>

      {/* 底部人工确认门② */}
      <div
        className="ra-panel"
        style={{
          marginTop: 16,
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span className="ra-muted">
          已打分维度 {Object.keys(expertScores).length} / {dimensions.length}
          {Object.keys(expertComments).length > 0 && ` · ${Object.keys(expertComments).length} 条修改意见`}
        </span>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button icon={<RedoOutlined />} onClick={() => setRedoOpen(true)}>
            重新 AI 评审
          </Button>
          <Button
            type="primary"
            icon={<CheckOutlined />}
            loading={finalizing}
            onClick={() =>
              Modal.confirm({
                title: '确认定稿',
                content: '定稿后将生成最终 Word 产物并锁定本次评审，是否继续？',
                okText: '定稿并生成',
                cancelText: '再想想',
                onOk: doFinalize,
              })
            }
          >
            定稿并生成产物
          </Button>
        </div>
      </div>

      {/* 重新评审弹窗 */}
      <Modal
        title="重新 AI 评审"
        open={redoOpen}
        onCancel={() => setRedoOpen(false)}
        okText="重新评审"
        cancelText="取消"
        onOk={() => {
          setRedoOpen(false);
          beginStream();
        }}
      >
        <div className="ra-muted" style={{ marginBottom: 8 }}>
          可填写修改建议（可选），将返回「AI 处理中」重新执行评审流。
        </div>
        <Input.TextArea
          rows={4}
          value={redoText}
          onChange={(e) => setRedoText(e.target.value)}
          placeholder="例如：创新性维度证据不足，请重新检索申报书第 2 章…"
        />
      </Modal>

      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} contextHint="打分维度" />

      {/* 隐式：SSE 完成后 wordFiles 直接可下载的快捷入口 */}
      {wordFiles.length > 0 && (
        <div style={{ marginTop: 10, textAlign: 'right' }}>
          <Button
            type="link"
            size="small"
            icon={<DownloadOutlined />}
            onClick={() =>
              artifacts.forEach((a) => apiClient.download(api.artifactDownloadPath(a.file_id)))
            }
          >
            下载全部产物
          </Button>
        </div>
      )}
    </div>
  );
}
