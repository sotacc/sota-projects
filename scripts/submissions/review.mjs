import { parseSubmission, repositoryName } from "../../src/lib/submissions/core.mjs";
import { github, bodyHash } from "./github.mjs";

export function issueNumber(value) {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw new Error("A positive Issue number is required.");
  return Number(value);
}
export function validateIntakeRepository(value) {
  if (typeof value !== "string" || repositoryName(value)?.toLowerCase() !== value.toLowerCase()) throw new Error("Configure an owner/repo submission repository first.");
  return value;
}
export async function inspectIssue(issue, { api = github, existing = [] } = {}) {
  if (issue.pull_request || issue.state !== "open") throw new Error("Only open Issues can be submitted.");
  const values = parseSubmission(issue.body);
  const name = repositoryName(values.repo);
  const repo = await api(`/repos/${name}`);
  if (repo.private || repo.visibility !== "public" || !repo.full_name || repo.full_name.toLowerCase() !== name.toLowerCase()) throw new Error("Use the canonical URL of a public GitHub repository.");
  if (!Number.isSafeInteger(repo.stargazers_count) || repo.stargazers_count < 0 || !repo.default_branch) throw new Error("Repository metadata is incomplete.");
  const id = repo.full_name.replace("/", ":").toLowerCase();
  if (existing.some(project => project.id === id)) throw new Error("This repository is already in the SOTA catalog.");
  return { values, repo, id, bodySha: bodyHash(issue.body) };
}
