import type { Workflow } from "../schemas.js";
export declare function compileFile(path: string): Promise<Workflow>;
export declare function transformYamlToWorkflow(doc: unknown): Workflow;
