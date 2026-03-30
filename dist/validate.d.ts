import type { Workflow } from "./schemas.js";
/**
 * Collect node ids that run as part of a parallel branch from `target` to `join` (exclusive of `join`).
 * Each step must be exactly one standard edge; no conditionals or nested parallel.
 */
export declare function collectParallelBranchNodes(workflow: Workflow, target: string, join: string): string[];
/**
 * Validate workflow structure for parallel regions (simple tier) and global single-outgoing rule.
 */
export declare function validateParallelWorkflow(workflow: Workflow): void;
