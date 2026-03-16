import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse, runWorkflow, resumeWorkflow } from "../src/index.js";
import type { WorkflowNode, WorkflowState } from "../src/index.js";

// ─── Workflow graph ───────────────────────────────────────────────────────────

export const HN_ROAST_WORKFLOW = {
  version: "1.0",
  graph_id: "hn_roast",
  entry_point: "fetch_story",
  nodes: [
    { id: "fetch_story",       type: "fetch"     },
    { id: "draft_roast",       type: "llm"       },
    { id: "wait_for_approval", type: "interrupt" },
    { id: "publish",           type: "output"    },
  ],
  edges: [
    { from: "fetch_story",       to: "draft_roast",       type: "standard" },
    { from: "draft_roast",       to: "wait_for_approval", type: "standard" },
    { from: "wait_for_approval", to: "publish",           type: "standard" },
  ],
};

const SNAPSHOT_PATH = "/tmp/hn-roast-snap.json";

// ─── Handlers ─────────────────────────────────────────────────────────────────

const fetchStoryHandler = async (_node: WorkflowNode, state: WorkflowState): Promise<WorkflowState> => {
  const searchRes = await fetch(
    "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=1",
  );
  const searchData = await searchRes.json() as {
    hits: Array<{ objectID: string; title: string; url?: string }>;
  };
  const story = searchData.hits[0];

  const commentsRes = await fetch(
    `https://hn.algolia.com/api/v1/search?tags=comment,story_${story.objectID}&hitsPerPage=5`,
  );
  const commentsData = await commentsRes.json() as {
    hits: Array<{ comment_text?: string }>;
  };
  const comments = commentsData.hits
    .filter((h) => h.comment_text)
    .slice(0, 5)
    .map((h) => h.comment_text!.replace(/<[^>]+>/g, "").trim());

  console.log(`\nStory: "${story.title}"`);
  return { ...state, story_title: story.title, story_url: story.url ?? "", comments };
};

const draftRoastHandler = async (_node: WorkflowNode, state: WorkflowState): Promise<WorkflowState> => {
  const commentBlock = (state.comments as string[])
    .map((c, i) => `${i + 1}. ${c}`)
    .join("\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key":           process.env.ANTHROPIC_API_KEY!,
      "anthropic-version":   "2023-06-01",
      "content-type":        "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 120,
      messages: [{
        role: "user",
        content:
          `Today's #1 Hacker News story: "${state.story_title}"\n\n` +
          `Top comments:\n${commentBlock}\n\n` +
          `Write one punchy, opinionated hot take. ` +
          `Be direct. A little spicy. Senior engineer energy. One or two sentences max.`,
      }],
    }),
  });
  const data = await res.json() as { content: Array<{ text: string }> };
  const roast = data.content[0].text.trim();

  console.log(`\nAI draft:\n  "${roast}"`);
  return { ...state, roast };
};

const publishHandler = async (_node: WorkflowNode, state: WorkflowState): Promise<WorkflowState> => {
  console.log(`\n✓ Published:\n  "${state.roast}"\n`);
  return state;
};

export const handlers = {
  fetch:  fetchStoryHandler,
  llm:    draftRoastHandler,
  output: publishHandler,
};

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const resumeIdx = process.argv.indexOf("--resume");

  if (resumeIdx !== -1) {
    // ── Resume: human approved, fire the publish node ─────────────────────────
    const snapPath = process.argv[resumeIdx + 1] ?? SNAPSHOT_PATH;
    if (!existsSync(snapPath)) {
      console.error(`Error: snapshot file not found: ${snapPath}`);
      process.exit(1);
    }
    const snapshot = JSON.parse(await readFile(snapPath, "utf8"));
    const result = await resumeWorkflow(snapshot, { handlers });
    if (result.status !== "completed") {
      console.error("Unexpected: workflow did not complete after resume");
      process.exit(1);
    }
  } else {
    // ── Initial run: fetch → draft → suspend ──────────────────────────────────
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error("Error: ANTHROPIC_API_KEY is not set");
      process.exit(1);
    }
    const workflow = parse(HN_ROAST_WORKFLOW);
    const result = await runWorkflow(workflow, {}, { handlers });
    if (result.status === "suspended") {
      await writeFile(SNAPSHOT_PATH, JSON.stringify(result.snapshot), "utf8");
      console.log(`\n⏸  Suspended — snapshot saved to ${SNAPSHOT_PATH}`);
      console.log(`   Approve and publish:`);
      console.log(`   npx tsx examples/hn-roast.ts --resume ${SNAPSHOT_PATH}\n`);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
