/**
 * 步骤② 信息确认：
 * 左卡 - 分类识别结果（置信度进度条 + 命中关键词 + 可编辑）
 * 右卡 - 打分模板选择（权重合计=100 校验）+ 评审规则提示
 * 底部 - "✓ 确认，开始 AI 评审" -> POST /confirm -> 步骤③
 */

import { useEffect, useMemo, useState } from 'react';
import { App, Alert, Button, Input, Select, Spin, Tag } from 'antd';
import { CheckOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { api, ApiError } from '../../api';
import { useTaskStore } from '../../stores/taskStore';
import {
  PROJECT_TYPE_OPTIONS,
  SUB_DOMAIN_OPTIONS,
  type Classification,
} from '../../types';

interface ConfFieldProps {
  label: string;
  value: number; // 0~1
  children: React.ReactNode;
  keywords?: string[];
}

function ConfField({ label, value, children, keywords }: ConfFieldProps) {
  const pct = Math.round((value || 0) * 100);
  const low = pct < 60;
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ width: 88, flex: 'none', fontSize: 12, color: 'var(--ra-text-2)' }}>
          {label}
        </span>
        <div className="ra-conf" style={{ flex: 1 }}>
          <div className="ra-conf-track">
            <div className={`ra-conf-fill ${low ? 'low' : ''}`} style={{ width: `${pct}%` }} />
          </div>
          <span className="ra-conf-num">{pct}%</span>
        </div>
      </div>
      <div style={{ paddingLeft: 88 }}>
        {children}
        {keywords && keywords.length > 0 && (
          <div style={{ marginTop: 6 }}>
            {keywords.map((k) => (
              <Tag key={k} style={{ fontSize: 11, marginBottom: 4 }}>
                {k}
              </Tag>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function ConfirmInfo() {
  const { message } = App.useApp();
  const taskId = useTaskStore((s) => s.taskId);
  const classification = useTaskStore((s) => s.classification);
  const templates = useTaskStore((s) => s.templates);
  const selectedTemplateIds = useTaskStore((s) => s.selectedTemplateIds);
  const applyClassification = useTaskStore((s) => s.applyClassification);
  const setClassification = useTaskStore((s) => s.setClassification);
  const setSelectedTemplateIds = useTaskStore((s) => s.setSelectedTemplateIds);
  const beginStream = useTaskStore((s) => s.beginStream);

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // 进入本步若无分类结果则触发 classify
  useEffect(() => {
    if (!taskId || classification) return;
    setLoading(true);
    setLoadError(null);
    api
      .classify(taskId)
      .then((resp) => applyClassification(resp.classification, resp.templates ?? []))
      .catch((e) => {
        setLoadError(
          e instanceof ApiError && e.isNetwork
            ? '后端服务未就绪（连接失败）'
            : e instanceof Error
              ? e.message
              : '分类识别失败',
        );
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  const conf = classification?.confidence ?? {};

  const update = (patch: Partial<Classification>) => {
    if (!classification) return;
    setClassification({ ...classification, ...patch });
  };

  const toggleTemplate = (id: string) => {
    if (selectedTemplateIds.includes(id)) {
      setSelectedTemplateIds(selectedTemplateIds.filter((x) => x !== id));
    } else {
      setSelectedTemplateIds([...selectedTemplateIds, id]);
    }
  };

  const weightSum = useMemo(
    () =>
      templates
        .filter((t) => selectedTemplateIds.includes(t.template_id))
        .reduce(
          (sum, t) => sum + (t.dimensions ?? []).reduce((s2, d) => s2 + (d.weight ?? 0), 0),
          0,
        ),
    [templates, selectedTemplateIds],
  );

  const doConfirm = async () => {
    if (!taskId || !classification) return;
    if (selectedTemplateIds.length === 0) {
      message.warning('请至少选择一个打分模板');
      return;
    }
    if (Math.round(weightSum) !== 100) {
      message.error(`所选模板维度权重合计为 ${weightSum}，须等于 100 才能开始评审`);
      return;
    }
    setConfirming(true);
    try {
      await api.confirm(taskId, {
        classification,
        template_ids: selectedTemplateIds,
        operator: '专家秘书',
      });
      message.success('已确认，开始 AI 评审');
      beginStream();
    } catch (e) {
      if (e instanceof ApiError && e.isNetwork) {
        message.error('后端服务未就绪（连接失败）');
      } else {
        message.error(e instanceof Error ? e.message : '确认失败');
      }
    } finally {
      setConfirming(false);
    }
  };

  if (loading) {
    return (
      <div className="ra-panel ra-panel-pad" style={{ textAlign: 'center', padding: 64 }}>
        <Spin />
        <div className="ra-muted" style={{ marginTop: 12 }}>
          AI 正在识别项目类别与关键信息…
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <Alert
        type="warning"
        showIcon
        message="分类识别未完成"
        description={loadError}
        action={
          <Button size="small" onClick={() => window.location.reload()}>
            重试
          </Button>
        }
      />
    );
  }

  if (!classification) return null;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* 左：识别结果 */}
        <div className="ra-panel ra-panel-pad">
          <div className="ra-section-title">识别结果（可编辑修正）</div>
          <div className="ra-muted" style={{ margin: '6px 0 18px' }}>
            置信度较低的字段请重点核对
          </div>

          <ConfField label="项目名称" value={conf.project_name ?? 1}>
            <Input
              value={classification.project_name ?? ''}
              onChange={(e) => update({ project_name: e.target.value })}
            />
          </ConfField>

          <ConfField
            label="项目类别"
            value={conf.project_type ?? 0}
            keywords={classification.hit_keywords}
          >
            <Select
              style={{ width: '100%' }}
              value={classification.project_type}
              options={PROJECT_TYPE_OPTIONS.map((v) => ({ value: v, label: v }))}
              onChange={(v) => update({ project_type: v })}
            />
          </ConfField>

          <ConfField label="细分领域" value={conf.sub_domain ?? 0}>
            <Select
              style={{ width: '100%' }}
              value={classification.sub_domain}
              options={SUB_DOMAIN_OPTIONS.map((v) => ({ value: v, label: v }))}
              onChange={(v) => update({ sub_domain: v })}
              showSearch
            />
          </ConfField>

          <ConfField label="申报单位" value={conf.org ?? 1}>
            <Input
              value={classification.org ?? ''}
              onChange={(e) => update({ org: e.target.value })}
            />
          </ConfField>

          <ConfField label="负责人" value={conf.leader ?? 1}>
            <Input
              value={classification.leader ?? ''}
              onChange={(e) => update({ leader: e.target.value })}
            />
          </ConfField>

          <ConfField label="研究周期" value={conf.period ?? 1}>
            <Input
              value={classification.period ?? ''}
              placeholder="例如：2026.01 - 2028.12"
              onChange={(e) => update({ period: e.target.value })}
            />
          </ConfField>
        </div>

        {/* 右：模板与规则 */}
        <div>
          <div className="ra-panel ra-panel-pad" style={{ marginBottom: 16 }}>
            <div className="ra-section-title">打分模板</div>
            <div className="ra-muted" style={{ margin: '6px 0 14px' }}>
              系统已按项目类别自动匹配，可调整勾选
            </div>

            {templates.length === 0 ? (
              <Alert type="info" showIcon message="后端未返回模板列表（阶段一可先忽略）" />
            ) : (
              templates.map((t) => {
                const selected = selectedTemplateIds.includes(t.template_id);
                return (
                  <div
                    key={t.template_id}
                    className={`ra-tpl-card ${selected ? 'selected' : ''}`}
                    style={{ marginBottom: 10 }}
                    onClick={() => toggleTemplate(t.template_id)}
                  >
                    {t.matched && <span className="ra-tpl-match-badge">✓ 已匹配</span>}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</span>
                      <span className="ra-muted">{t.category}</span>
                    </div>
                    <div className="ra-muted" style={{ marginTop: 6 }}>
                      {(t.dimensions ?? []).map((d) => `${d.name} ${d.weight}`).join(' · ')}
                    </div>
                  </div>
                );
              })
            )}

            {templates.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 12 }}>
                权重合计：
                <span
                  style={{
                    color: Math.round(weightSum) === 100 ? '#00b42a' : '#ff7d00',
                    fontWeight: 600,
                  }}
                >
                  {weightSum}
                </span>
                {' / 100'}
                {Math.round(weightSum) !== 100 && (
                  <span className="ra-muted">（须等于 100）</span>
                )}
              </div>
            )}
          </div>

          <div className="ra-panel ra-panel-pad">
            <div className="ra-section-title">评审规则</div>
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--ra-text-2)', lineHeight: 2 }}>
              <div>
                <SafetyCertificateOutlined style={{ color: 'var(--ra-brand)', marginRight: 6 }} />
                各维度按 0 ~ 权重分区间评分，AI 给出建议区间，专家终评
              </div>
              <div>
                <SafetyCertificateOutlined style={{ color: 'var(--ra-brand)', marginRight: 6 }} />
                评审过程需人工确认两道门：信息确认（本步）与终稿确认
              </div>
              <div>
                <SafetyCertificateOutlined style={{ color: 'var(--ra-brand)', marginRight: 6 }} />
                全部推理材料仅在内网环境处理与留存
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 底部确认条 */}
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
          确认后将锁定分类与模板，进入 AI 评审流程（仍可于终稿前回退）
        </span>
        <Button
          type="primary"
          size="large"
          icon={<CheckOutlined />}
          loading={confirming}
          onClick={doConfirm}
        >
          确认，开始 AI 评审
        </Button>
      </div>
    </div>
  );
}
