#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { compileFile } from "./compile.js";
import { renderViz } from "./viz.js";
import { runSimulation } from "./simulate.js";
import { runCreate } from "./create.js";

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  if (command === "compile") {
    const inputFile = args[1];
    if (!inputFile) {
      console.error("Usage: oflow compile <file> [--output <file>]");
      process.exit(1);
    }
    const outputFlag = args.indexOf("--output");
    const outputFile = outputFlag !== -1 ? args[outputFlag + 1] : null;

    const workflow = await compileFile(inputFile);
    const json = JSON.stringify(workflow, null, 2);

    if (outputFile) {
      await writeFile(outputFile, json, "utf8");
    } else {
      console.log(json);
    }
  } else if (command === "viz") {
    const inputFile = args[1];
    if (!inputFile) {
      console.error("Usage: oflow viz <file>");
      process.exit(1);
    }
    const workflow = await compileFile(inputFile);
    console.log(renderViz(workflow));
  } else if (command === "simulate") {
    const workflowFile = args[1];
    const mockFile = args[2];
    if (!workflowFile || !mockFile) {
      console.error("Usage: oflow simulate <workflow> <mock-file>");
      process.exit(1);
    }
    const workflow = await compileFile(workflowFile);
    await runSimulation(workflow, mockFile);
  } else if (command === "create") {
    await runCreate(args.slice(1));
  } else {
    console.error("Usage: oflow <compile|viz|simulate|create> [args...]");
    console.error("  compile  <file> [--output <file>]");
    console.error("  viz      <file>");
    console.error("  simulate <workflow> <mock-file>");
    console.error("  create   <file> [--template basic|standard|advanced|mock]");
    console.error("  create   <mock-file> --from <workflow-file>");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
