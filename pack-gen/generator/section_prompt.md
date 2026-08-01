# 单小节生成 prompt（规格）

真正接 LLM API 时，每个小节一次调用应该按这个规格提示模型。当前阶段
（M3.22）这一步先由人工按同样的规格产出 `SectionLLMOutput`，等 API key
接入后原样把这份规格改写成实际的 system/user prompt 字符串即可，不用重
新设计契约。

## 输入

- `section_path` / `section_title`
- `paragraphs`：一个列表，每项 `{index, kind, text}`（`kind` 是 `text` 或
  `code`）。**必须提示模型：这是它能看到的唯一原文，绝不允许在输出里复述
  这些文字**——只能引用 `index`。

## 任务

1. 把 paragraphs 切成若干"原子块"，每块约 2-3 分钟阅读量、语义完整、不跨
   小节边界（已经保证，因为输入本来就是一个小节）。每块给出：
   - `start_paragraph_index` / `end_paragraph_index`（闭区间，指向输入的
     paragraph 下标）
   - `est_seconds`：基于字数、代码密度估算
   - `recap_md`：一句话摘要（给"前一日内容回顾"用）
2. 基于对内容的理解，抽取若干"知识点"（`knowledge_items`），每个知识点：
   - `statement`：知识点陈述
   - `block_indices`：关联哪些块（本节内的局部下标）
3. 为每个知识点出一道单选题（`questions`）：
   - 概念理解或代码判断皆可，但必须给选项，不能要求用户输入文本
   - **干扰项必须是学习者的常见误解**，不能是明显荒谬或格式明显不同的选项
     （这是防止"排除法蒙对"的唯一防线，DESIGN.md 风险 R8）
   - `options` 存"未打乱"的原始顺序；运行时才会 shuffle，所以这里顺序无
     所谓，但 `answer_index` 必须和 `options` 的顺序对应

## 输出

严格是 `SectionLLMOutput`（见 `section_llm_output.py`）的 JSON，不要额外
解释文字。
