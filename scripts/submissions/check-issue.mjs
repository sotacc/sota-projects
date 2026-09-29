import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { github, bodyHash, boundedJson } from "./github.mjs";
import { validateConfig } from "../../src/lib/submissions/core.mjs";
import { inspectIssue, issueNumber, validateIntakeRepository } from "./review.mjs";
import { inspectUpdate } from "../../src/lib/submissions/updates.mjs";

export async function checkEvent(event, config, { api = github, fetchCatalog = fetch } = {}) {
  validateConfig(config);
  const target = validateIntakeRepository(config.repository);
  if (event.repository?.full_name?.toLowerCase() !== target.toLowerCase()) throw new Error("Event repository does not match the configured intake repository.");
  const issue = event.issue;
  if (!issue || issue.pull_request || issue.state !== "open" || !/^\[(Project|Update)\]/i.test(issue.title ?? "")) return "ignored";
  const isUpdate = /^\[Update\]/i.test(issue.title);
  issueNumber(issue.number);
  let result; let problem; let duplicateNote = "Duplicate check will run during import.";
  try {
    let existing = [];
    if (config.siteUrl) {
      const origin = new URL(config.siteUrl);
      if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/") throw new Error("Configure an HTTPS site origin.");
      const response = await fetchCatalog(new URL(isUpdate ? "/projects.json" : "/catalog-index.json", origin), { redirect: "error", signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error("Published catalog is unavailable; retry the check later.");
      const catalog = await boundedJson(response);
      if ((isUpdate ? catalog.schemaVersion : catalog.version) !== 1 || !Array.isArray(catalog.projects)) throw new Error("Published catalog format is invalid.");
      existing = catalog.projects;
      if (isUpdate) {
        const response = await fetchCatalog(new URL("/submission-config.json", origin), { redirect: "error", signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error("Submission configuration is unavailable; retry later.");
        const settings = await boundedJson(response);
        if (settings.version !== 1 || settings.repository !== target) throw new Error("Submission configuration does not match this repository.");
        result = inspectUpdate(issue, existing, settings.taxonomy);
      }
      duplicateNote = "No duplicate was found in the published catalog.";
    }
    if (isUpdate && !result) throw new Error("A live catalog is required to validate updates.");
    if (!isUpdate) result = await inspectIssue(issue, { api, existing });
  } catch (error) { problem = error.message; }
  const fresh = await api(`/repos/${target}/issues/${issue.number}`);
  if (fresh.state !== "open" || fresh.title !== issue.title || bodyHash(fresh.body) !== bodyHash(issue.body)) return "changed; no feedback posted";
  const marker = "<!-- sota-submission-check -->";
  const comment = result && isUpdate
    ? `${marker}\nThe update format, target revision and taxonomy passed initial checks. Changed fields: ${result.changes.map(item => item.field).join(", ")}.\n\nA maintainer must verify the official evidence and any maker/team claim before preparing a draft PR. Nothing has changed on SOTA. Editing this Issue runs the checks again; changes after import require a new review of the draft PR.`
    : result
    ? `${marker}\nThanks for suggesting a project. The submission fields and any supplied repository metadata passed the initial checks. ${duplicateNote}\n\n${result.repo?.archived ? "The repository is archived. " : ""}${result.repo?.fork ? "This is a fork. " : ""}A maintainer will assess its purpose, evidence, and fit before inclusion. These checks do not run the project or verify its claims. This Issue remains open until review and publication.`
    : `${marker}\nThis ${isUpdate ? "update" : "submission"} needs attention:\n\n${problem}\n\nPlease edit the Issue using the ${isUpdate ? "update" : "project"} template. Checks run again when the Issue is edited; nothing has been published.`;
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
