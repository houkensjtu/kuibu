import { describe, it, expect } from "vitest";
import { checkPackReferences } from "./checkPackReferences.js";
import type { ContentPack } from "../schema/types/pack.js";

function samplePack(): ContentPack {
  return {
    manifest: {
      schema_version: "0.1.0",
      book_id: "sicp",
      title: "SICP",
      author: "Abelson & Sussman",
      license: "CC-BY-SA-4.0",
      source: "https://mitp-content-server.mit.edu/sicp/",
      generated_at: "2026-07-31T12:00:00Z",
      generator_version: "0.1.0",
    },
    blocks: [
      {
        id: "b0001",
        seq: 1,
        section_path: ["1", "1.1", "1.1.1"],
        section_title: "The Elements of Programming",
        content_md: "...",
        est_seconds: 150,
        recap_md: "表达式与求值。",
      },
    ],
    items: [
      {
        id: "k0001",
        block_ids: ["b0001"],
        statement: "组合式的求值遵循先求值再应用的规则。",
        question_ids: ["q0001"],
      },
    ],
    questions: [
      {
        id: "q0001",
        item_id: "k0001",
        type: "single_choice",
        prompt: "以下哪个是组合式求值的第一步？",
        options: ["求值各子表达式", "打印结果", "跳过求值", "报错"],
        answer_index: 0,
        explanation: "求值组合式先递归求值运算符和运算对象。",
      },
    ],
    exercises: [
      {
        id: "x0001",
        block_id: "b0001",
        number: "1.1",
        prompt_md: "以下每个表达式的结果是什么？",
        hint_md: "先确定每个子表达式的类型，再套用先求值再应用的规则。",
      },
    ],
    recap_checkpoints: [
      {
        id: "r0001",
        through_block_count: 1,
        recap_md: "上次读到：组合式的求值遵循先求值再应用的规则。",
      },
    ],
    section_headings: [
      {
        path: ["1"],
        title: "The Elements of Programming",
      },
    ],
  };
}

describe("checkPackReferences", () => {
  it("returns no errors for a clean pack", () => {
    expect(checkPackReferences(samplePack())).toEqual([]);
  });

  it("catches an item referencing a missing question", () => {
    const pack = samplePack();
    pack.items[0].question_ids = ["q9999"];
    const errors = checkPackReferences(pack);
    expect(errors.some((e) => e.includes("k0001") && e.includes("q9999"))).toBe(true);
  });

  it("catches an item referencing a missing block", () => {
    const pack = samplePack();
    pack.items[0].block_ids = ["b9999"];
    const errors = checkPackReferences(pack);
    expect(errors.some((e) => e.includes("k0001") && e.includes("b9999"))).toBe(true);
  });

  it("catches a question referencing a missing item", () => {
    const pack = samplePack();
    pack.questions[0].item_id = "k9999";
    const errors = checkPackReferences(pack);
    expect(errors.some((e) => e.includes("q0001") && e.includes("k9999"))).toBe(true);
  });

  it("catches an exercise referencing a missing block", () => {
    const pack = samplePack();
    pack.exercises[0].block_id = "b9999";
    const errors = checkPackReferences(pack);
    expect(errors.some((e) => e.includes("x0001") && e.includes("b9999"))).toBe(true);
  });

  it("catches an out-of-range answer_index (the silent-failure case)", () => {
    const pack = samplePack();
    pack.questions[0].answer_index = 4; // options has 4 entries, valid indices 0-3
    const errors = checkPackReferences(pack);
    expect(errors.some((e) => e.includes("q0001") && e.includes("answer_index"))).toBe(true);
  });

  it("catches duplicate ids", () => {
    const pack = samplePack();
    pack.blocks.push({ ...pack.blocks[0] });
    const errors = checkPackReferences(pack);
    expect(errors.some((e) => e.includes("duplicate block id: b0001"))).toBe(true);
  });
});
