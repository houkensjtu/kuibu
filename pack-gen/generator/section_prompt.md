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
4. **原书每一道 Exercise 都要标记出来（`exercises`）**，不要把它们当成普通
   正文折进某个 block 的 `recap_md` 里就算完事：
   - `number`：原书编号，如 `"1.9"`
   - `start_paragraph_index` / `end_paragraph_index`（闭区间，指向输入的
     paragraph 下标）——跟 block 一样，只给边界，原文由脚本按边界切出来，
     绝不在这里复述习题原文
   - `hint_md`：给一条**提示**，不是答案——现阶段刻意不提供答案。提示应该
     指向"该用哪个已学过的概念/哪一步该注意"，但不能直接把解法写出来
   - 习题跟第 3 步的复习题是**两种不同的东西**：复习题每天必做、自动判分、
     进 Leitner 调度；习题是可选做的开放题，不判分，不进调度，用户可以选择
     完全自己做、或者看一眼 hint。**不要**把同一段习题内容既写成
     `exercises` 条目又写成 `knowledge_items`/`questions`——两者选一个，
     优先归入 `exercises`（这是原书自己的练习，不需要我们另造一道选择题
     来测同样的内容）

## 语言

**`recap_md`、`statement`、`prompt`、`options`、`explanation` 全部必须跟随源书本身的语言**
——英文书（如 SICP）出英文内容，中文书出中文内容。这是内容语言，跟阅读器
CLI 界面语言（固定英文，见 `cli/` 下的用户可见字符串）是两件不相关的事：
界面语言不随书变，题目语言随书变。判断依据是输入 paragraphs 的实际语言，
不是生成器运行环境的语言。

## 输出

严格是 `SectionLLMOutput`（见 `section_llm_output.py`）的 JSON，不要额外
解释文字。
