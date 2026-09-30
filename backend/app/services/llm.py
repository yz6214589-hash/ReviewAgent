"""LLM 客户端（F6）：OpenAI 兼容模式，base_url/key/model 仅读 .env。

LLM_MOCK=true 时使用内置流式假数据，保证无真实凭证/无网络也可跑通全流程。
"""
from __future__ import annotations

import asyncio
from typing import Any, AsyncIterator

from app.settings import get_settings


def build_dimension_prompt(
    *,
    project_name: str,
    stage: str,
    dimension: dict[str, Any],
    context_text: str,
    fewshot_texts: list[str],
) -> list[dict[str, str]]:
    """分维度构造 Prompt（模板维度/权重驱动，零硬编码业务规则）。"""
    stage_label = {"summary": "总结评审", "proposal": "立项评审"}.get(stage, stage)
    fewshot_block = "\n\n".join(f"【范文】\n{t}" for t in fewshot_texts) or "（无）"
    user = (
        f"请对项目《{project_name}》进行{stage_label}，仅评价维度「{dimension['name']}」"
        f"（权重 {dimension['weight']} 分）。\n"
        f"维度说明：{dimension.get('description', '')}\n"
        f"要求：给出评分区间（0~{dimension['weight']}）与 100 字左右评审意见。\n\n"
        f"【申报材料摘要】\n{context_text[:2000]}\n\n"
        f"【参考范文】\n{fewshot_block}"
    )
    return [
        {
            "role": "system",
            "content": "你是重大项目评审秘书，输出客观、严谨、可追溯的评审意见草稿。",
        },
        {"role": "user", "content": user},
    ]


async def _stream_openai(messages: list[dict[str, str]]) -> AsyncIterator[str]:
    from openai import AsyncOpenAI

    settings = get_settings()
    client = AsyncOpenAI(base_url=settings.llm_base_url, api_key=settings.llm_api_key)
    stream = await client.chat.completions.create(
        model=settings.llm_model, messages=messages, stream=True
    )
    async for event in stream:
        delta = event.choices[0].delta.content if event.choices else None
        if delta:
            yield delta


async def _stream_mock(dimension: dict[str, Any], project_name: str) -> AsyncIterator[str]:
    weight = dimension["weight"]
    name = dimension["name"]
    text = (
        f"项目《{project_name}》在「{name}」维度上："
        f"对照该维度要求（{dimension.get('description', '见模板说明')}），"
        f"申报材料提供了较完整的佐证内容，整体表现符合预期，"
        f"建议评分区间 {int(weight * 0.75)}~{weight} 分。"
        f"（以上为 LLM_MOCK 内置假数据，用于离线联调）"
    )
    for i in range(0, len(text), 8):
        yield text[i : i + 8]
        await asyncio.sleep(0.01)


async def stream_dimension_opinion(
    *,
    project_name: str,
    stage: str,
    dimension: dict[str, Any],
    context_text: str,
    fewshot_texts: list[str],
) -> AsyncIterator[str]:
    """统一流式入口：mock/真实由 LLM_MOCK 决定。"""
    settings = get_settings()
    if settings.llm_mock:
        async for chunk in _stream_mock(dimension, project_name):
            yield chunk
        return
    messages = build_dimension_prompt(
        project_name=project_name,
        stage=stage,
        dimension=dimension,
        context_text=context_text,
        fewshot_texts=fewshot_texts,
    )
    async for chunk in _stream_openai(messages):
        yield chunk
