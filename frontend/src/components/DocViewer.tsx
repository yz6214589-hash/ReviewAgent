/**
 * 材料阅读器（专家评审页左侧，3:2 布局的 3）
 * - 纸张式段落展示；阶段一后端未必返回正文，此时展示材料清单 + 占位段落
 * - 证据锚点定位：父组件通过 locateKey 触发段落闪烁高亮并滚动
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Empty, Segmented } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import type { FileInfo } from '../types';

export interface LocateRequest {
  /** 段落锚点标识（文件名/段落序号/关键词） */
  key: string;
  /** 递增序号触发重复定位 */
  seq: number;
}

interface Props {
  files: FileInfo[];
  locate?: LocateRequest | null;
}

export function DocViewer({ files, locate }: Props) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeFile = files[activeIdx];

  // 段落：优先文件自带 content；否则占位段落
  const paragraphs = useMemo(() => {
    const content = (activeFile as FileInfo & { content?: string })?.content;
    if (content) {
      return content.split(/\n{2,}|\r?\n/).filter((p) => p.trim().length > 0);
    }
    return [
      `《${activeFile?.name ?? '申报材料'}》正文将在后端解析服务就绪后展示。`,
      '阶段一提示：当前仅展示材料清单与结构占位；证据锚点定位能力已具备，正文接入后即可闪烁定位到对应段落。',
      '评审依据包括：项目申报书、可行性研究报告、附件证明材料等。AI 评审会逐段引用关键句作为打分证据（📍 锚点）。',
    ];
  }, [activeFile]);

  useEffect(() => {
    if (!locate) return;
    setFlashKey(locate.key);
    // 尝试滚动到命中段落（按关键词匹配）
    const container = containerRef.current;
    if (container) {
      const paras = container.querySelectorAll<HTMLElement>('[data-para]');
      for (const p of Array.from(paras)) {
        if (locate.key && p.textContent?.includes(locate.key.slice(0, 12))) {
          p.scrollIntoView({ behavior: 'smooth', block: 'center' });
          break;
        }
      }
    }
    const t = setTimeout(() => setFlashKey(null), 1700);
    return () => clearTimeout(t);
  }, [locate]);

  if (files.length === 0) {
    return (
      <div className="ra-paper">
        <Empty description="暂无材料（断点恢复后后端返回文件清单即可展示）" />
      </div>
    );
  }

  return (
    <div className="ra-paper" ref={containerRef}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <FileTextOutlined style={{ color: 'var(--ra-brand)' }} />
        <Segmented
          size="small"
          value={activeIdx}
          onChange={(v) => setActiveIdx(v as number)}
          options={files.map((f, i) => ({
            value: i,
            label: f.name.length > 12 ? `${f.name.slice(0, 12)}…` : f.name,
          }))}
        />
      </div>

      {paragraphs.map((p, i) => {
        const hit = flashKey && p.includes(flashKey.slice(0, 12));
        return (
          <div
            key={i}
            data-para
            className={`ra-para ${hit ? 'flash marked' : ''}`}
          >
            {p}
            {hit && <span className="ra-anchor-tag">📍 引用</span>}
          </div>
        );
      })}
    </div>
  );
}
