import { PassThrough } from "node:stream";
import { describe, it, expect } from "vitest";
import { createLineReader } from "./lineReader.js";

describe("createLineReader", () => {
  it("resolves readLine() once a newline-terminated chunk arrives", async () => {
    const input = new PassThrough();
    const reader = createLineReader(input);

    const promise = reader.readLine();
    input.write("hello\n");
    expect(await promise).toBe("hello");
    reader.close();
  });

  it("buffers a line that arrives before readLine() is called", async () => {
    const input = new PassThrough();
    const reader = createLineReader(input);

    input.write("early\n");
    expect(await reader.readLine()).toBe("early");
    reader.close();
  });

  it("splits multiple lines delivered in a single chunk", async () => {
    const input = new PassThrough();
    const reader = createLineReader(input);

    input.write("one\ntwo\nthree\n");
    expect(await reader.readLine()).toBe("one");
    expect(await reader.readLine()).toBe("two");
    expect(await reader.readLine()).toBe("three");
    reader.close();
  });

  it("reassembles a line split across multiple chunks", async () => {
    const input = new PassThrough();
    const reader = createLineReader(input);

    const promise = reader.readLine();
    input.write("hel");
    input.write("lo\n");
    expect(await promise).toBe("hello");
    reader.close();
  });

  it("strips a trailing carriage return (CRLF input)", async () => {
    const input = new PassThrough();
    const reader = createLineReader(input);

    input.write("windows-line\r\n");
    expect(await reader.readLine()).toBe("windows-line");
    reader.close();
  });

  it("handles several sequential readLine() calls in a row (the bug this replaces)", async () => {
    const input = new PassThrough();
    const reader = createLineReader(input);

    input.write("1\n2\n3\n4\n");
    for (const expected of ["1", "2", "3", "4"]) {
      expect(await reader.readLine()).toBe(expected);
    }
    reader.close();
  });
});
