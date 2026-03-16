import { describe, it, expect } from "vitest";
import { evaluateOperator, resolveNextNode } from "../src/router.js";
import type { Edge } from "../src/schemas.js";

describe("evaluateOperator", () => {
  it("< operator", () => {
    expect(evaluateOperator(40, "<", 50)).toBe(true);
    expect(evaluateOperator(60, "<", 50)).toBe(false);
  });

  it("> operator", () => {
    expect(evaluateOperator(60, ">", 50)).toBe(true);
    expect(evaluateOperator(40, ">", 50)).toBe(false);
  });

  it("<= operator", () => {
    expect(evaluateOperator(50, "<=", 50)).toBe(true);
    expect(evaluateOperator(51, "<=", 50)).toBe(false);
  });

  it(">= operator", () => {
    expect(evaluateOperator(50, ">=", 50)).toBe(true);
    expect(evaluateOperator(49, ">=", 50)).toBe(false);
  });

  it("=== operator", () => {
    expect(evaluateOperator("hello", "===", "hello")).toBe(true);
    expect(evaluateOperator("hello", "===", "world")).toBe(false);
  });

  it("!== operator", () => {
    expect(evaluateOperator("hello", "!==", "world")).toBe(true);
    expect(evaluateOperator("hello", "!==", "hello")).toBe(false);
  });

  it("includes operator (string)", () => {
    expect(evaluateOperator("hello world", "includes", "world")).toBe(true);
    expect(evaluateOperator("hello world", "includes", "foo")).toBe(false);
  });

  it("includes operator (array)", () => {
    expect(evaluateOperator([1, 2, 3], "includes", 2)).toBe(true);
    expect(evaluateOperator([1, 2, 3], "includes", 5)).toBe(false);
  });

  it("startsWith operator", () => {
    expect(evaluateOperator("hello world", "startsWith", "hello")).toBe(true);
    expect(evaluateOperator("hello world", "startsWith", "world")).toBe(false);
  });

  it("endsWith operator", () => {
    expect(evaluateOperator("hello world", "endsWith", "world")).toBe(true);
    expect(evaluateOperator("hello world", "endsWith", "hello")).toBe(false);
  });

  it("throws on unknown operator", () => {
    expect(() => evaluateOperator(1, "BOGUS", 2)).toThrow("Unknown operator");
  });
});

describe("resolveNextNode", () => {
  const standardEdge: Edge = {
    from: "a",
    to: "b",
    type: "standard",
  };

  const conditionalEdge: Edge = {
    from: "a",
    type: "conditional",
    condition: { field: "score", operator: "<", value: 50 },
    routes: { true: "low_node", false: "high_node" },
  };

  it("returns undefined when no outgoing edges", () => {
    const result = resolveNextNode("a", [], {});
    expect(result).toBeUndefined();
  });

  it("resolves standard edge", () => {
    const result = resolveNextNode("a", [standardEdge], {});
    expect(result).toEqual({ nextNodeId: "b", edgeType: "standard" });
  });

  it("resolves conditional edge - true branch", () => {
    const result = resolveNextNode("a", [conditionalEdge], { score: 30 });
    expect(result).toEqual({
      nextNodeId: "low_node",
      edgeType: "conditional",
      conditionResult: true,
    });
  });

  it("resolves conditional edge - false branch", () => {
    const result = resolveNextNode("a", [conditionalEdge], { score: 80 });
    expect(result).toEqual({
      nextNodeId: "high_node",
      edgeType: "conditional",
      conditionResult: false,
    });
  });

  it("ignores edges from other nodes", () => {
    const otherEdge: Edge = { from: "z", to: "y", type: "standard" };
    const result = resolveNextNode("a", [otherEdge, standardEdge], {});
    expect(result).toEqual({ nextNodeId: "b", edgeType: "standard" });
  });
});
