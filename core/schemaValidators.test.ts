import { describe, it, expect } from "vitest";
import { validatePack, validateEvent } from "./schemaValidators.js";

function samplePack() {
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

describe("validatePack", () => {
  it("accepts a well-formed pack", () => {
    const result = validatePack(samplePack());
    if (!result.valid) throw new Error(result.errors.join("\n"));
    expect(result.data.manifest.book_id).toBe("sicp");
  });

  it("rejects a pack with a wrong field type", () => {
    const broken = samplePack();
    // @ts-expect-error deliberately breaking the schema for this test
    broken.blocks[0].seq = "one";
    const result = validatePack(broken);
    if (result.valid) throw new Error("expected validation to fail");
    expect(result.errors[0]).toMatch(/seq/);
  });
});

describe("validateEvent", () => {
  it("accepts a session_start event", () => {
    const result = validateEvent({
      id: "e0001",
      ts: "2026-07-31T22:00:00Z",
      type: "session_start",
      book_id: "sicp",
      target_seconds: 720,
    });
    expect(result.valid).toBe(true);
  });

  it("rejects an event with an unknown type", () => {
    const result = validateEvent({
      id: "e0002",
      ts: "2026-07-31T22:00:00Z",
      type: "not_a_real_event",
    });
    expect(result.valid).toBe(false);
  });
});
