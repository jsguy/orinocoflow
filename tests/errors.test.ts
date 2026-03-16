import { describe, it, expect } from "vitest";
import {
  NodeNotFoundError,
  HandlerError,
  WorkflowCycleError,
  WorkflowAbortedError,
  InvalidEdgeError,
  SubWorkflowNotFoundError,
  WorkflowConfigurationError,
} from "../src/errors.js";

describe("error class properties", () => {
  it("HandlerError exposes nodeId and cause", () => {
    const original = new Error("network failure");
    const err = new HandlerError("my-node", original);
    expect(err.nodeId).toBe("my-node");
    expect(err.cause).toBe(original);
  });

  it("HandlerError works with non-Error cause", () => {
    const err = new HandlerError("my-node", "plain string cause");
    expect(err.nodeId).toBe("my-node");
    expect(err.cause).toBe("plain string cause");
  });

  it("WorkflowCycleError exposes maxSteps", () => {
    const err = new WorkflowCycleError(500);
    expect(err.maxSteps).toBe(500);
  });

  it("SubWorkflowNotFoundError exposes workflowId", () => {
    const err = new SubWorkflowNotFoundError("review-pipeline");
    expect(err.workflowId).toBe("review-pipeline");
  });

  it("NodeNotFoundError exposes nodeId", () => {
    const err = new NodeNotFoundError("missing-step");
    expect(err.nodeId).toBe("missing-step");
  });

  it("all engine error classes are instanceof Error with non-empty message", () => {
    const errors = [
      new NodeNotFoundError("n"),
      new HandlerError("n", new Error("x")),
      new WorkflowCycleError(10),
      new WorkflowAbortedError(),
      new InvalidEdgeError("bad op"),
      new SubWorkflowNotFoundError("wf"),
      new WorkflowConfigurationError("misconfigured"),
    ];

    for (const err of errors) {
      expect(err).toBeInstanceOf(Error);
      expect(err.message.length).toBeGreaterThan(0);
      expect(err.name).not.toBe("Error"); // each has its own name
    }
  });
});
