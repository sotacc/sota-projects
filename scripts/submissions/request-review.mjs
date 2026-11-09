import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { github } from "./github.mjs";
import { issueNumber, isProjectTitle } from "./review.mjs";

const intake = "sotacc/sota-projects";
const reviewPath = "/repos/sotacc/sota-web/actions/workflows/review-submissions.yml/dispatches";

export async function requestReview(event, { api = github, manual = false, prepare = false, intakeToken, triggerToken } = {}) {
  if (event.repository?.full_name !== intake) throw new Error("Unexpected intake repository.");
  if (!manual && !["opened", "edited", "reopened"].includes(event.action)) return "ignored";
  if (!manual && (!event.issue || event.issue.pull_request || !isProjectTitle(event.issue.title))) return "ignored";
  const number = issueNumber(manual ? event.inputs?.issue_number : event.issue.number);
  const issue = await api(`/repos/${intake}/issues/${number}`, { token: intakeToken });
  if (issue.number !== number || issue.pull_request || !isProjectTitle(issue.title) || (!manual && issue.state !== "open")) return "ignored";
  if (prepare) return "ready";
  if (!triggerToken) throw new Error("Missing short-lived review trigger token.");
  // Real events scan the queue: GitHub may replace older pending concurrency jobs during a burst.
  // Maintainer-only manual probes can target an existing Issue without creating public test activity.
  await api(reviewPath, { token: triggerToken, method: "POST", body: { ref: "main", inputs: manual ? { issue_number: String(number) } : {} } });
  return "review-requested";
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const prepare = process.argv[2] === "prepare";
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
    const result = await requestReview(event, { manual: process.env.GITHUB_EVENT_NAME === "workflow_dispatch", prepare,
      intakeToken: process.env.INTAKE_TOKEN, triggerToken: process.env.REVIEW_TRIGGER_TOKEN });
    if (prepare && process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `ready=${result === "ready"}\n`);
    console.log(result);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
