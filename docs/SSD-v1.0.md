# 智能评审 Agent · 软件设计文档（SSD）

日期：2026-09-30 ｜ 版本：v1.0 ｜ 依据：PRD-v1.1 + 技术选型-ADR + v8 原型

---

## 1. 概述

### 1.1 目标
为中国移动科创部建设重大项目评审辅助工具，定位"评审秘书"：AI 生成评审意见草稿，所有关键环节有人工确认门，AI 不做最终裁决。

### 1.2 技术栈
- **后端**：FastAPI + SSE + SQLAlchemy/Alembic + SQLite + LangGraph（interrupt + SqliteSaver）
- **前端**：React 19 + Vite + TypeScript + Ant Design 5 + Ant Design X（useXChat + XStream）
- **AI**：OpenAI 兼容模式连内网 LLM Gateway；bge-m3 + sqlite-vec（范文检索）
- **文件**：python-docx / PyPDF2 / openpyxl / python-pptx + OOXML 直写
- **部署**：Nginx + uvicorn，内网离线

### 1.3 硬性约束
1. 业务规则零硬编码，全部 YAML 配置化；
2. 无硬编码路径、无明文密钥；
3. 识别结果可人工干预；生成结果须人工确认；
4. 全过程结构化存档可追溯；
5. 范文检索按关联性匹配，禁止固定取前 N 条。

---

## 2. 系统架构

```
┌─────────────────────────────────────────────────────────┐
│  Nginx（反向代理 + 静态资源）                              │
├─────────────────────────────────────────────────────────┤
│  React SPA（Ant Design 5 + X）                           │
│  工作台 / 任务列表 / 配置管理 / 评审标准说明                │
├─────────────────────────────────────────────────────────┤
│  FastAPI                                                │
│  ├── REST API（上传/配置/历史/产物下载）                   │
│  └── SSE 流式推送（评审生成进度）                          │
├─────────────────────────────────────────────────────────┤
│  LangGraph StateGraph                                    │
│  parse → classify → interrupt① → match → retrieve      │
│       → generate（流式）→ interrupt② → fill_word → archive│
├─────────────────────────────────────────────────────────┤
│  SQLite（业务数据）+ sqlite-vec（范文向量）+ 文件存储       │
└─────────────────────────────────────────────────────────┘
```

---

## 3. 后端设计

### 3.1 目录结构

```
backend/
├── pyproject.toml
├── .env.example
├── alembic/ + alembic.ini
├── app/
│   ├── main.py                 # FastAPI 入口
│   ├── settings.py             # Pydantic Settings
│   ├── api/                    # REST + SSE 接口层
│   │   ├── routes_upload.py    # F1 上传解析
│   │   ├── routes_review.py    # SSE 流式评审 + interrupt resume
│   │   ├── routes_history.py   # F10 历史
│   │   └── routes_config.py    # F14 配置读写+留痕
│   ├── graph/                  # LangGraph 状态图
│   │   ├── state.py            # ReviewState
│   │   ├── builder.py          # StateGraph + SqliteSaver
│   │   └── nodes/              # parse/classify/match/retrieve/generate/fill_word/archive
│   ├── services/               # 纯领域逻辑
│   │   ├── parsers/            # docx/pdf/xlsx/pptx/txt 五类解析器
│   │   ├── classifier.py       # BR-2/BR-3
│   │   ├── templates.py        # BR-1 匹配
│   │   ├── retrieval.py        # 规则过滤 + bge-m3/sqlite-vec
│   │   ├── llm.py              # OpenAI 兼容客户端
│   │   └── word_fill.py        # BR-4 python-docx + OOXML
│   ├── models/                 # SQLAlchemy 模型
│   ├── schemas/                # Pydantic API 模型
│   └── core/                   # YAML 加载、审计、异常
└── tests/
```

### 3.2 LangGraph 状态图

```python
# state.py
class ReviewState(TypedDict):
    task_id: str
    files: list[FileInfo]           # 上传文件列表
    parsed_text: str                # 解析后全文
    classification: Classification  # 识别结果（类型/阶段/子领域/年份/组合标志/应用基础标志）
    confirmed: bool                 # 人工确认①
    templates: list[ScoringTemplate]  # 匹配模板（组合评审为两套）
    fewshot: list[FewShot]          # 范文检索结果
    draft_summary: str              # 总结意见草稿
    draft_proposal: str             # 立项意见草稿
    confirmed_final: bool           # 人工确认②
    word_files: list[str]           # 产物路径
    error: str | None
```

```python
# builder.py
graph = StateGraph(ReviewState)
graph.add_node("parse", parse_node)
graph.add_node("classify", classify_node)
graph.add_node("confirm_classification", interrupt_node)  # interrupt①
graph.add_node("match_template", match_node)
graph.add_node("retrieve_fewshot", retrieve_node)
graph.add_node("generate", generate_node)                  # 流式
graph.add_node("confirm_result", interrupt_node)           # interrupt②
graph.add_node("fill_word", fill_word_node)
graph.add_node("archive", archive_node)

graph.set_entry_point("parse")
graph.add_edge("parse", "classify")
graph.add_edge("classify", "confirm_classification")
graph.add_edge("confirm_classification", "match_template")
graph.add_edge("match_template", "retrieve_fewshot")
graph.add_edge("retrieve_fewshot", "generate")
graph.add_edge("generate", "confirm_result")
graph.add_edge("confirm_result", "fill_word")
graph.add_edge("fill_word", "archive")

checkpointer = SqliteSaver.from_conn_string("checkpoints.db")
app_graph = graph.compile(checkpointer=checkpointer)
```

### 3.3 API 设计

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/upload | 上传文件，返回解析结果与 task_id |
| POST | /api/review/{task_id}/classify | 触发识别（同步） |
| POST | /api/review/{task_id}/confirm | 确认识别结果（resume interrupt①） |
| GET | /api/review/{task_id}/stream | SSE 流式生成评审意见 |
| POST | /api/review/{task_id}/finalize | 确认定稿（resume interrupt②） |
| GET | /api/review/{task_id}/artifacts | 产物列表（含文件级版本） |
| GET | /api/review/{task_id}/artifacts/{file_id}/download | 下载指定版本 |
| GET | /api/tasks | 任务列表（筛选/分页） |
| GET | /api/tasks/{task_id} | 任务详情（断点恢复） |
| GET/PUT | /api/config/templates | 评分模板读写 |
| GET/PUT | /api/config/rules | 识别规则读写 |
| GET/POST | /api/config/fewshot | 范文库管理 |
| GET | /api/config/history | 配置变更留痕 |

### 3.4 数据模型

```sql
-- 评审任务
CREATE TABLE review_tasks (
    id TEXT PRIMARY KEY,
    project_name TEXT,
    status TEXT,           -- draft/classified/generating/reviewing/done
    current_step INTEGER,  -- 1-4
    created_at TEXT,
    updated_at TEXT
);

-- 识别结果
CREATE TABLE classifications (
    task_id TEXT PRIMARY KEY,
    project_type TEXT,
    stage TEXT,            -- summary/proposal/combined
    sub_domain TEXT,
    year INTEGER,
    is_applied_basic BOOLEAN,
    is_combined BOOLEAN,
    confidence TEXT,       -- JSON
    confirmed BOOLEAN,
    corrected_by TEXT,
    corrected_at TEXT
);

-- 评审结果
CREATE TABLE review_results (
    id TEXT PRIMARY KEY,
    task_id TEXT,
    stage TEXT,            -- summary/proposal
    template_id TEXT,
    content TEXT,          -- 意见全文
    total_score_range TEXT,
    created_at TEXT
);

-- 产物版本（文件级）
CREATE TABLE artifact_versions (
    id TEXT PRIMARY KEY,
    task_id TEXT,
    file_type TEXT,        -- word_summary/word_proposal/md
    version INTEGER,
    file_path TEXT,
    source TEXT,           -- ai_draft/manual_edit/regenerate
    created_at TEXT
);

-- 评分模板
CREATE TABLE scoring_templates (
    id TEXT PRIMARY KEY,
    name TEXT,
    category TEXT,         -- applied_basic/non_applied_basic
    stage TEXT,            -- summary/proposal
    dimensions TEXT,       -- JSON: [{name, weight, description}]
    is_active BOOLEAN
);

-- 范文库
CREATE TABLE fewshot_samples (
    id TEXT PRIMARY KEY,
    project_name TEXT,
    project_type TEXT,
    stage TEXT,
    sub_domain TEXT,
    content TEXT,
    is_active BOOLEAN
);

-- 配置留痕
CREATE TABLE config_history (
    id TEXT PRIMARY KEY,
    config_key TEXT,
    old_value TEXT,
    new_value TEXT,
    changed_by TEXT,
    changed_at TEXT
);
```

---

## 4. 前端设计

### 4.1 目录结构

```
frontend/
├── package.json / vite.config.ts / tsconfig.json
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── api/                  # REST + SSE 客户端
│   │   ├── client.ts         # axios/fetch 封装
│   │   └── sse.ts            # XStream SSE 封装
│   ├── pages/
│   │   ├── Workbench/        # 工作台（四步流水线）
│   │   │   ├── index.tsx
│   │   │   ├── StepBar.tsx
│   │   │   ├── NewTask.tsx
│   │   │   ├── ConfirmInfo.tsx
│   │   │   ├── Processing.tsx
│   │   │   └── ExpertReview.tsx
│   │   ├── TaskList/         # 任务列表
│   │   ├── Config/           # 配置管理
│   │   └── Standard/         # 评审标准说明
│   ├── components/
│   │   ├── TaskSwitcher.tsx  # 顶栏任务切换器
│   │   ├── DocViewer.tsx     # 材料原文阅读器（锚点高亮）
│   │   ├── DimCard.tsx       # 维度卡片（评分条+专家打分+修改意见）
│   │   ├── ArtifactList.tsx  # 产物文件级版本列表
│   │   └── ChatPanel.tsx     # AI 对话（useXChat）
│   ├── stores/               # Zustand 状态管理
│   └── types/                # TypeScript 类型
```

### 4.2 核心组件设计

**TaskSwitcher（顶栏任务切换器）**
- 搜索下拉框，支持按项目名过滤
- 状态圆点（待确认/处理中/草稿/已完成）
- 点击状态标签 → 退出确认弹窗

**StepBar（四步步骤条）**
- 步骤：新建任务 → 信息确认 → AI 处理中 → 专家评审
- 已完成步骤可点击回退（弹确认框）
- 步骤③在步骤④变为"↻ 重新评审"入口

**DimCard（维度卡片）**
- 维度名 + 权重 + AI 建议区间 + 评分区间可视化条
- 结论文本（可编辑）
- 原文依据锚点（点击定位左侧）
- 评审过程折叠面板
- 专家打分输入框（超权重自动截断）
- 修改意见按钮

**ArtifactList（产物列表）**
- 每个文件独立版本线（v1/v2/v3）
- 历史版本可单独下载
- 一键下载当前版本 ZIP

**ChatPanel（AI 对话）**
- useXChat + XStream 对接 SSE
- 快捷追问气泡
- 支持追问维度依据、请求重新生成某维度

### 4.3 SSE 流式协议

```
POST /api/review/{task_id}/stream
Content-Type: text/event-stream

data: {"type":"progress","step":"战略性","status":"running"}
data: {"type":"chunk","step":"战略性","text":"项目直接对标..."}
data: {"type":"progress","step":"战略性","status":"done","score":"17~19"}
...
data: {"type":"complete","task_id":"xxx","word_files":["..."]}
```

---

## 5. 关键流程时序

### 5.1 完整评审流程

```
用户                前端                后端                LangGraph
 │                   │                   │                   │
 │──上传文件────────>│                   │                   │
 │                   │──POST /upload────>│                   │
 │                   │                   │──parse───────────>│
 │                   │                   │<──parsed_text─────│
 │                   │                   │──classify────────>│
 │                   │<──识别结果────────│<──classification──│
 │<──展示识别结果────│                   │                   │
 │                   │                   │                   │
 │──确认识别────────>│                   │                   │
 │                   │──POST /confirm───>│──resume interrupt①│
 │                   │                   │──match_template──>│
 │                   │                   │──retrieve────────>│
 │                   │                   │                   │
 │                   │──GET /stream─────>│──generate────────>│
 │<──流式展示────────│<──SSE chunks──────│<──draft───────────│
 │                   │                   │                   │
 │──编辑+定稿───────>│                   │                   │
 │                   │──POST /finalize──>│──resume interrupt②│
 │                   │                   │──fill_word───────>│
 │                   │                   │──archive─────────>│
 │<──产物下载────────│<──word_files──────│                   │
```

### 5.2 断点恢复

- 所有状态通过 SqliteSaver 持久化到 `checkpoints.db`
- 任务切换/刷新页面时，通过 `task_id` 查询最新 checkpoint 恢复
- interrupt 状态天然支持断点续评

---

## 6. 配置化设计

### 6.1 YAML 配置文件

```yaml
# config/scoring_templates.yaml
templates:
  - id: non_applied_summary
    name: 非应用基础研究类·总结
    category: non_applied_basic
    stage: summary
    dimensions:
      - {name: 目标完成度, weight: 30, description: "项目目标达成情况、指标完成度"}
      - {name: 成果丰富度, weight: 10, description: "成果类型多样性及数量"}
      - {name: 技术水平先进性, weight: 20, description: "关键技术指标国内外位置"}
      - {name: 科技成果影响力, weight: 10, description: "成果采纳、获奖、引用"}
      - {name: 市场转化, weight: 30, description: "行业核心需求满足、竞品对标、收入转化"}

# config/classification_rules.yaml
type_keywords:
  核心技术攻关: [核心技术, 关键技术, 技术攻关, 能力攻关, ...]
  应用技术研究: [应用技术, 应用研究, 应用攻关, ...]
stage_keywords:
  summary: [总结, 成果, 完成]
  proposal: [目标, 计划, 立项, 指标]
sub_domain_keywords:
  5G/6G通信: [5G, 6G, 太赫兹, 通信, ...]
  北斗/定位: [北斗, 定位, 导航, ...]
recognition:
  text_truncate: 8000
  year_range: [2024, 2029]

# config/retrieval.yaml
fewshot:
  k: 6
  min_projects: 2
embedding:
  model: bge-m3
  vector_store: sqlite-vec
```

### 6.2 环境变量（.env）

```
LLM_BASE_URL=http://internal-gateway/v1
LLM_API_KEY=sk-xxx
LLM_MODEL=qwen2.5-72b-instruct
DATABASE_URL=sqlite:///./data/review.db
UPLOAD_DIR=./data/uploads
TEMPLATE_WORD_PATH=./data/templates/blank_score_sheet.docx
```

---

## 7. 部署

### 7.1 依赖清单

**后端（Python 3.11+）**
```
fastapi>=0.110
uvicorn[standard]>=0.29
sqlalchemy>=2.0
alembic>=1.13
langgraph>=0.2
langchain-openai>=0.1
python-docx>=1.1
PyPDF2>=3.0
openpyxl>=3.1
python-pptx>=0.6
pydantic-settings>=2.2
pyyaml>=6.0
sqlite-vec>=0.1
```

**前端（Node 20+）**
```
react>=19.0
antd>=5.20
@ant-design/x>=2.9
@ant-design/x-markdown
@ant-design/x-sdk
zustand>=4.5
```

### 7.2 部署步骤

```bash
# 后端
cd backend
pip install -e .
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000

# 前端
cd frontend
npm install
npm run build
# Nginx 托管 dist/，反向代理 /api 到 8000
```

---

## 8. 非功能设计

| 编号 | 策略 |
|------|------|
| NFR-2 性能 | 文件解析异步化；LLM 流式降低首字延迟；范文检索本地向量 |
| NFR-3 可用性 | LLM 不可达时降级为"仅规则识别+模板展示"，明确提示 |
| NFR-4 安全 | 密钥仅 .env；范文专家姓名脱敏；内网离线部署 |
| NFR-5 可靠性 | LangGraph checkpoint 断点恢复；产物文件版本化 |
| NFR-7 合规 | 数据不出内网；上传文件本地存储不入库 |
