/**
 * 维度卡：AI 建议区间可视化 + 证据 chip（点击定位材料）+ 评审过程折叠 + 专家打分/意见
 */

import { useState } from 'react';
import { Collapse, Input, InputNumber } from 'antd';
import { EnvironmentOutlined } from '@ant-design/icons';
import { useTaskStore } from '../stores/taskStore';
import type { DimResult } from '../types';

interface Props {
  dim: DimResult;
  onLocateEvidence?: (key: string) => void;
}

export function DimCard({ dim, onLocateEvidence }: Props) {
  const expertScores = useTaskStore((s) => s.expertScores);
  const expertComments = useTaskStore((s) => s.expertComments);
  const setExpertScore = useTaskStore((s) => s.setExpertScore);
  const setExpertComment = useTaskStore((s) => s.setExpertComment);

  const [expanded, setExpanded] = useState(false);

  const weight = dim.weight ?? 0;
  const [lo, hi] = dim.ai_range ?? [null, null];
  const loPct = weight > 0 && lo !== null ? Math.max(0, Math.min(100, (lo / weight) * 100)) : 0;
  const hiPct = weight > 0 && hi !== null ? Math.max(0, Math.min(100, (hi / weight) * 100)) : 0;
  const midPct = (loPct + hiPct) / 2;

  const score = expertScores[dim.name];

  return (
    <div className="ra-dim-card">
      <div className="ra-dim-head">
        <span className="ra-dim-name">{dim.name}</span>
        <span className="ra-dim-weight">权重 {weight} 分</span>
        {lo !== null && hi !== null && (
          <span className="ra-dim-ai">
            AI 建议 {lo} ~ {hi}
          </span>
        )}
        {dim.conclusion && <span className="ra-muted">{dim.conclusion}</span>}
      </div>

      {/* 评分区间可视化 */}
      {weight > 0 && lo !== null && hi !== null && (
        <div className="ra-dim-range" title={`0 ~ ${weight}`}>
          <div
            className="ra-dim-range-fill"
            style={{ left: `${loPct}%`, width: `${Math.max(hiPct - loPct, 2)}%` }}
          />
          <div className="ra-dim-range-mid" style={{ left: `${midPct}%` }} />
        </div>
      )}

      {/* 证据锚点 */}
      {dim.evidence && dim.evidence.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {dim.evidence.map((ev, i) => (
            <span
              key={i}
              className="ra-evi-chip"
              onClick={() => onLocateEvidence?.(ev.quote || ev.anchor || '')}
              title={ev.quote}
            >
              <EnvironmentOutlined />
              证据 {i + 1}
              {ev.anchor ? ` · ${ev.anchor}` : ''}
            </span>
          ))}
        </div>
      )}

      {/* 评审过程折叠 */}
      {dim.thinking && (
        <Collapse
          ghost
          activeKey={expanded ? ['t'] : []}
          onChange={() => setExpanded(!expanded)}
          items={[
            {
              key: 't',
              label: <span className="ra-muted">评审过程（AI 推理摘要）</span>,
              children: (
                <div className="ra-muted" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>
                  {dim.thinking}
                </div>
              ),
            },
          ]}
        />
      )}

      {/* 专家终评 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '180px 1fr',
          gap: 10,
          marginTop: 10,
          alignItems: 'start',
        }}
      >
        <InputNumber
          min={0}
          max={weight || undefined}
          value={score}
          placeholder={`0 ~ ${weight}`}
          style={{ width: '100%' }}
          addonBefore="专家打分"
          onChange={(v) => {
            if (v === null) return;
            const clamped = weight > 0 ? Math.min(v, weight) : v;
            setExpertScore(dim.name, clamped);
          }}
        />
        <Input.TextArea
          rows={1}
          autoSize
          placeholder="修改意见（可选）"
          value={expertComments[dim.name] ?? ''}
          onChange={(e) => setExpertComment(dim.name, e.target.value)}
        />
      </div>
    </div>
  );
}
