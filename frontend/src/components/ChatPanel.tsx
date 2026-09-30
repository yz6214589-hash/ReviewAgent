/**
 * AI 对话面板（Ant Design X：Bubble.List + Prompts + Sender）
 * 阶段一：后端无对话接口，本地回话并提示；接入后替换 sendMessage 即可
 */

import { useRef, useState } from 'react';
import { Bubble, Prompts, Sender } from '@ant-design/x';
import { Drawer } from 'antd';
import {
  CommentOutlined,
  FileSearchOutlined,
  HighlightOutlined,
  RobotOutlined,
  UserOutlined,
} from '@ant-design/icons';

interface Msg {
  key: string;
  role: 'user' | 'ai';
  content: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  contextHint?: string;
}

const SUGGESTIONS = [
  { key: 's1', icon: <FileSearchOutlined />, label: '该维度评分依据是什么？', description: '追问证据与推理链' },
  { key: 's2', icon: <HighlightOutlined />, label: '帮我润色这段综述', description: '面向评审口径优化措辞' },
];

export function ChatPanel({ open, onClose, contextHint }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const seqRef = useRef(0);

  const send = (text: string) => {
    const content = text.trim();
    if (!content) return;
    const userMsg: Msg = { key: `u${seqRef.current++}`, role: 'user', content };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    // 阶段一：本地应答占位；阶段二接入 /api/review/{id}/chat
    setTimeout(() => {
      const aiMsg: Msg = {
        key: `a${seqRef.current++}`,
        role: 'ai',
        content:
          '对话接口将在阶段二开放（后端暂未提供 /chat）。当前问题已记录，接入后将基于任务上下文与证据锚点回答。',
      };
      setMessages((prev) => [...prev, aiMsg]);
      setLoading(false);
    }, 400);
  };

  return (
    <Drawer
      title={
        <span>
          <CommentOutlined style={{ marginRight: 6, color: 'var(--ra-brand)' }} />
          AI 对话{contextHint ? ` · ${contextHint}` : ''}
        </span>
      }
      width={420}
      open={open}
      onClose={onClose}
      styles={{ body: { display: 'flex', flexDirection: 'column', padding: 12 } }}
    >
      <div style={{ flex: 1, overflowY: 'auto', marginBottom: 12 }}>
        {messages.length === 0 ? (
          <div style={{ paddingTop: 40 }}>
            <Prompts
              vertical
              items={SUGGESTIONS}
              onItemClick={({ data }) => send(String(data.label ?? ''))}
            />
          </div>
        ) : (
          <Bubble.List
            autoScroll
            items={messages.map((m) => ({
              key: m.key,
              role: m.role,
              content: m.content,
              avatar:
                m.role === 'ai' ? (
                  <span style={{ color: 'var(--ra-brand)' }}>
                    <RobotOutlined />
                  </span>
                ) : (
                  <UserOutlined />
                ),
            }))}
            roles={{
              ai: { placement: 'start', variant: 'borderless' },
              user: { placement: 'end', variant: 'filled' },
            }}
          />
        )}
      </div>

      <Sender
        value={input}
        onChange={setInput}
        onSubmit={send}
        loading={loading}
        placeholder="向 AI 提问评审细节…"
        onCancel={() => setLoading(false)}
      />
    </Drawer>
  );
}
