# 技术选型 ADR · 项目评审智能体 v2.0

| 项目 | 内容 |
|------|------|
| 文档状态 | ✅ 已确认（Accepted） |
| 日期 | 2026-09-29 |
| 决策人 | 项目团队 |
| 关联文档 | [PRD-v1.0.md](PRD-v1.0.md) |
| 前置版本 | v1.0（agentscope-project/，Streamlit + AgentScope 2.0.0） |

---

## 0. 决策背景

v1.0 已验证"文件解析 → 规则识别 → LLM 生成 → Word 填表"核心链路可行，但存在 PRD 明确的八大约束问题（C1~C8）：规则硬编码、路径硬编码、范文无差别注入、无结构化存档、无人工干预闭环等。v2.0 需在满足 PRD 全部 P0/P1 需求的前提下重新选型。

**硬性前提**：

- 模型服务固定为中国移动内网 LLM Gateway（OpenAI 兼容协议，zhanlu/qwen3.7-max），不可变更
- 部署环境为内网，数据不出内网（NFR-4/7）
- Python 全栈，单一 Web 入口（C4），部署可交接（C7）

## 1. 目标架构

```mermaid
graph TB
    subgraph 浏览器（单一 React 应用）
        UI[业务页面：上传/识别确认/历史/配置<br/>Ant Design 5]
        CHAT[AI 对话区：流式生成/思维链/会话管理<br/>Ant Design X]
    end

    subgraph Nginx 单一入口
        R1["/ → React 静态资源"]
        R2["/api/ → FastAPI（REST + SSE）"]
    end

    subgraph 后端 FastAPI 进程
        API[REST + SSE 接口层]
        LG[LangGraph 评审状态图<br/>interrupt + SqliteSaver checkpoint]
        RAG[范文检索<br/>bge-m3 + sqlite-vec]
    end

    DB[(SQLite<br/>业务表 + checkpoint 表)]
    LLM[内网 LLM Gateway<br/>zhanlu/qwen3.7-max]

    UI & CHAT --> R1
    UI & CHAT --> R2 --> API --> LG
    LG --> LLM & RAG & DB
```

评审主流程映射为 LangGraph 显式状态图：

```
parse_file → classify → ⟨interrupt: 识别确认 FR-3⟩ → match_template
          → retrieve_fewshot → generate（流式）→ ⟨interrupt: 结果确认 C6⟩
          → fill_word → save_archive
```

部署仅需两个进程：**Nginx + FastAPI**（docker-compose 可选）。

---

## 2. ADR-001：Agent 运行时 → LangGraph（内嵌 FastAPI）

**状态**：已接受 ｜ **决策**：采用 LangGraph 1.x Python 库，以库形式内嵌于 FastAPI 进程。

**理由**：

1. 评审流程是**确定性流水线 + 人工确认门**（PRD C6/FR-3），LangGraph 的显式状态图（StateGraph）最贴合该形态；
2. `interrupt()` / `Command(resume=...)` 原生支持人工确认与纠正闭环（FR-3、C6）；
3. `SqliteSaver` checkpointer 满足 FR-6.5（失败重试不丢上下文，断点恢复不重新调 LLM），且天然记录每步状态快照支撑 FR-6.2 过程存档；
4. `stream_mode="messages"` token 级流式输出，经 SSE 直推前端（FR-6.3、NFR-3）；
5. 生态规模最大，文档/人才/交接友好（C7）。

**许可证边界**：❗ 仅使用 LangGraph **Python 库**（MIT，无限制）；**不使用 LangGraph Server / Platform** 生产部署（内网自托管涉及商业许可）。

**已排除的备选**：

| 备选 | 排除理由 |
|------|----------|
| AgentScope 2.0 Harness | v1.0 在用、Harness 工程层（Session/RAG/HITL）完整且中文生态好，但团队决定转向 LangGraph 生态；其 RAG/HITL 能力在 LangGraph 侧以 checkpoint + 自建检索替代 |
| DeepAgents（LangChain） | 面向自主、长程、非确定性任务（深度研究/编码），与 PRD"可控、可确认、可审计"的流水线形态错配；且 v0.x 未稳定 |
| OpenAI Agents SDK | 会话级持久化非构造性；handoff 编排模式不适合固定流水线 |
| OpenCode | 终端编码助手产品，非可嵌入应用框架，品类不符 |
| Dify / FastGPT 低代码 | 无法承载 OOXML 级 Word 填充等深度定制逻辑 |

---

## 3. ADR-002：前端 → React 19 + Ant Design 5 + Ant Design X

**状态**：已接受 ｜ **决策**：单一 React 应用（Vite + TypeScript）；业务组件用 Ant Design 5，AI 对话组件族用 Ant Design X（@ant-design/x ^2.9 + @ant-design/x-markdown + @ant-design/x-sdk）。**Streamlit 不进入 v2.0**。

**理由**：

1. 纯 React 单前端消除了 Streamlit iframe 方案的会话共享与样式接缝，部署少一个进程（C7）；
2. Ant Design X 2.x 原生覆盖 PRD 全部 AI 交互需求：

| PRD 功能 | 对应组件 |
|----------|----------|
| F1 文件上传 | `Sender`（Attachments）/ antd `Upload` |
| F3 识别预览与人工确认 | `ThoughtChain` + 可编辑卡片表单 |
| FR-6.3 流式生成 | `Bubble.List` + `XMarkdown`（流式渲染、尾部光标、淡入动画、DOMPurify XSS 防护） |
| 五步进度展示 | `Think` / `ThoughtChain` |
| F8/F9 报告下载 | `Actions` + `FileCard` |
| F10 历史记录 | `Conversations`（会话管理，天然对应） |
| F2 补充信息输入 | `Sender` + `Suggestion` |

3. `@ant-design/x-sdk` 的 `useXChat` + `XStream` 原生解析 SSE，直接对接 FastAPI 流式端点，会话键（ConversationKey/SessionId）与后端 LangGraph thread_id 一一对应；
4. Ant Design 体系是国内企业级事实标准，视觉统一、交接成本低（C7）。

**已排除的备选**：Streamlit（v1.0 在用；作为全量界面无法支撑 F10/F14 等复杂页面，作为 iframe 嵌入有接缝）、Ant Design X 之外自研聊天组件（重复造轮子）。

---

## 4. ADR-003：后端 API → FastAPI + SSE

**状态**：已接受 ｜ **决策**：FastAPI 承载 REST 接口与 SSE 流式推送；LangGraph 以库内嵌，不引入独立 Agent 服务进程。

**关键接口约定**：

- `POST /api/review/stream`：SSE 流式评审接口。后端 `graph.astream(stream_mode="messages")` 逐 token 转 SSE 事件；`interrupt` 时推送确认事件，前端提交 `resume` 后继续流
- 其余 REST：文件上传、历史记录 CRUD（F10）、配置读写（F14）、报告下载（F9）

**已排除的备选**：AgentScope Agent Service（v1.0 start_service.py，实验性，随框架切换废弃）；WebSocket（SSE 单向推送已够用，更简单）。

---

## 5. ADR-004：数据库 → SQLite + SQLAlchemy + Alembic

**状态**：已接受 ｜ **决策**：SQLite 单文件库同时承载业务表（任务/消息/报告/配置审计/操作日志）与 LangGraph checkpoint 表；Alembic 管理迁移。

**理由**：单租户内网部署（PRD 假设），零外部依赖满足 C7；并发需求低（NFR-2 单条 5 分钟内即可，批量串行）。预留 PostgreSQL 升级路径（SQLAlchemy 方言切换）。

**已排除的备选**：PostgreSQL（当前阶段过度设计）；Redis/Celery（F11 批量队列用 SQLite 任务表 + asyncio worker 实现，不引入中间件）。

---

## 6. ADR-005：范文检索 → bge-m3 + sqlite-vec（规则过滤优先）

**状态**：已接受 ｜ **决策**：范文库迁入 SQLite 结构化存储；关联匹配以**规则过滤**（类型 + 阶段 + 子领域，满足 C2/FR-12.3）为主，本地嵌入模型 bge-m3（sentence-transformers 离线运行）+ sqlite-vec 语义排序为辅，Top-K 注入提示词。

**理由**：内网无公网 embedding 服务可用；bge-m3 中文效果与体积平衡，CPU 可跑；sqlite-vec 零部署成本。

**已排除的备选**：v1.0 固定取前 2 个项目的做法（PRD C2 明令禁止）；AgentScope RAG 模块（随框架切换）；Chroma/Qdrant（额外服务进程，违背 C7）。

---

## 7. ADR-006：配置管理 → YAML + Pydantic Settings + .env

**状态**：已接受 ｜ **决策**：

- 业务规则（评分模板、类型关键词、阶段映射、路径）→ YAML 配置文件，页面可编辑（F14），变更写审计日志（FR-14.3）
- 应用设置 → Pydantic Settings 校验与加载
- 密钥 → 仅环境变量 / .env，**不入库、不明文入代码仓**（C3、FR-14.4）

---

## 8. ADR-007：部署 → Nginx + uvicorn（docker-compose 可选）

**状态**：已接受 ｜ **决策**：Nginx 反代统一端口（`/` React 静态、`/api/` FastAPI）；uvicorn 跑 FastAPI；docker-compose 作为可选打包方式；交付 requirements/pyproject + 部署文档（C7/NFR-1）。

---

## 9. 复用与延续（无争议项，直接确认）

| 项 | 决策 |
|----|------|
| 文件解析 | python-docx / PyPDF2 / openpyxl / python-pptx（v1.0 已验证，原样复用） |
| Word 生成 | python-docx + OOXML 直写（复用 v1.0 template.py 合并单元格方案，模板路径改配置注入） |
| 分类规则 | v1.0 classifier.py 逻辑保留，规则外置 YAML（C1） |
| 模型接入 | langchain-openai `ChatOpenAI(base_url=内网Gateway)`，OpenAI 兼容协议不变 |
| 认证 | 本地账号 + JWT（P0/P1），SSO 顺延 P2（NFR-8） |
| 测试验收 | pytest + 20 个项目识别准确率评估脚本（验收标准第 5 条 ≥90%） |

## 10. v1.0 资产处置清单

| v1.0 资产 | v2.0 处置 |
|-----------|-----------|
| reviewer/classifier.py 关键词规则 | 逻辑保留，规则外置 YAML |
| reviewer/template.py XML 填表 | 原样复用，路径配置化 |
| 六种格式解析代码 | 原样复用 |
| `_call_minimax()` 手工事件循环 | 废弃（LangGraph 原生流式） |
| few_shot_data.json 固定取前 2 项 | 废弃，迁入结构化范文库 + 关联检索 |
| review_tools.py / review_agent.py CLI | 废弃（硬编码路径违反 C3；C4 单入口） |
| web_app.py Streamlit 全量界面 | 废弃，功能迁移至 React + Ant Design X |
| start_service.py Agent Service | 废弃 |

## 11. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| LangGraph 版本演进（1.x 仍活跃） | 升级破坏 | 锁定版本基线；checkpoint 表结构变更经 Alembic 迁移 |
| 内网 Gateway 的 OpenAI 兼容细节差异 | 流式异常 | 封装模型适配层，验收用真实 Gateway 联调 |
| bge-m3 CPU 推理速度 | 检索耗时 | 范文库规模小（百级），预计算向量入库，查询时仅单条编码 |
| SQLite 并发上限 | 批量队列阻塞 | F11 为 P2；任务串行执行即可满足当前规模 |
| 团队 React 经验 | 开发效率 | Ant Design X 样板间模板起步；AI 对话区组件开箱即用 |

## 12. 版本基线（2026-09 锁定）

| 组件 | 版本 |
|------|------|
| Python | 3.11+ |
| langgraph / langchain-openai | ^1.x（锁 minor） |
| fastapi / uvicorn | ^0.136 / ^0.48 |
| sqlalchemy / alembic | ^2.x |
| sentence-transformers（bge-m3）/ sqlite-vec | 最新稳定 |
| Node | ^20 LTS |
| react / vite / typescript | ^19 / ^6 / ^5 |
| antd / @ant-design/x / x-markdown / x-sdk | ^5 / ^2.9 / ^2.9 / ^2.9 |
