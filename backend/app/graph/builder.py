"""LangGraph StateGraph + SqliteSaver（SSD 3.2）。

节点链：parse → classify → interrupt①(confirm_classification) → match_template
→ retrieve_fewshot → generate(流式) → interrupt②(confirm_result) → fill_word → archive

- thread_id = task_id，所有状态经 checkpoint 持久化，支持断点恢复。
- interrupt_before=["generate"]：确认①后停在生成前，由 GET /stream 驱动流式生成。
"""
from __future__ import annotations

import aiosqlite
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langgraph.graph import END, StateGraph

from app.graph.nodes.archive import archive_node
from app.graph.nodes.classify import classify_node
from app.graph.nodes.confirm import confirm_classification_node, confirm_result_node
from app.graph.nodes.fill_word import fill_word_node
from app.graph.nodes.generate import generate_node
from app.graph.nodes.match_template import match_template_node
from app.graph.nodes.parse import parse_node
from app.graph.nodes.retrieve import retrieve_fewshot_node
from app.graph.state import ReviewState
from app.settings import get_settings


def _build() -> StateGraph:
    graph = StateGraph(ReviewState)
    graph.add_node("parse", parse_node)
    graph.add_node("classify", classify_node)
    graph.add_node("confirm_classification", confirm_classification_node)  # interrupt①
    graph.add_node("match_template", match_template_node)
    graph.add_node("retrieve_fewshot", retrieve_fewshot_node)
    graph.add_node("generate", generate_node)  # 流式
    graph.add_node("confirm_result", confirm_result_node)  # interrupt②
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
    graph.add_edge("archive", END)
    return graph


_graph = None


async def get_graph():
    """惰性构建并编译图（进程级单例，连接贯穿应用生命周期）。"""
    global _graph
    if _graph is None:
        settings = get_settings()
        settings.checkpoint_db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = await aiosqlite.connect(str(settings.checkpoint_db_path))
        checkpointer = AsyncSqliteSaver(conn)
        await checkpointer.setup()
        _graph = _build().compile(
            checkpointer=checkpointer,
            interrupt_before=["generate"],
        )
    return _graph
