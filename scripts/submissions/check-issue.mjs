import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { github, bodyHash, boundedJson } from "./github.mjs";
import { validateConfig } from "../../src/lib/submissions/core.mjs";
import { inspectIssue, issueNumber, validateIntakeRepository } from "./review.mjs";

export async function checkEvent(event, config, { api = github, fetchCatalog = fetch } = {}) {
  validateConfig(config);
  const target = validateIntakeRepository(config.repository);
  if (event.repository?.full_name?.toLowerCase() !== target.toLowerCase()) throw new Error("Event repository does not match the configured intake repository.");
  const issue = event.issue;
  if (!issue || issue.pull_request || issue.state !== "open" || !/^\[Project\]/i.test(issue.title ?? "")) return "ignored";
  issueNumber(issue.number);
  let result; let problem; let duplicateNote = "Duplicate check will run during import.";
  try {
    let existing = [];
    if (config.siteUrl) {
      const origin = new URL(config.siteUrl);
      if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/") throw new Error("Configure an HTTPS site origin.");
      const response = await fetchCatalog(new URL("/catalog-index.json", origin), { redirect: "error", signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error("Published catalog is unavailable; retry the check later.");
      const catalog = await boundedJson(response);
      if (catalog.version !== 1 || !Array.isArray(catalog.projects)) throw new Error("Published catalog format is invalid.");
      existing = catalog.projects;
      duplicateNote = "No duplicate was found in the published catalog.";
    }
    result = await inspectIssue(issue, { api, existing });
  } catch (error) { problem = error.message; }
  const fresh = await api(`/repos/${target}/issues/${issue.number}`);
  if (fresh.state !== "open" || bodyHash(fresh.body) !== bodyHash(issue.body)) return "changed; no feedback posted";
  const marker = "<!-- sota-submission-check -->";
  const comment = result
    ? `${marker}\nThanks for suggesting a project. The repository and required fields passed the initial checks. ${duplicateNote}\n\n${result.repo.archived ? "The repository is archived. " : ""}${result.repo.fork ? "This is a fork. " : ""}A maintainer will assess its purpose, evidence, and fit before inclusion. These checks do not run the project or verify its claims. This Issue remains open until review and publication.`
    : `${marker}\nThis submission needs attention:\n\n${problem}\n\nPlease edit the Issue using the project template. Checks run again when the Issue is edited; nothing has been published.`;
  const comments = await api(`/repos/${target}/issues/${issue.number}/comments?per_page=100`);
  const prior = comments.find(item => item.user?.login === "github-actions[bot]" && item.body?.includes(marker));
  if (prior) await api(`/repos/${target}/issues/comments/${prior.id}`, { method: "PATCH", body: { body: comment } });
  else await api(`/repos/${target}/issues/${issue.number}/comments`, { method: "POST", body: { body: comment } });
  return result ? "awaiting maintainer review" : "needs attention";
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
    const config = JSON.parse(readFileSync("config/submissions.json", "utf8"));
    console.log(await checkEvent(event, config));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
