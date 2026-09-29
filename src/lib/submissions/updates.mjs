import { createHash } from "node:crypto";
import { normalizeProjectLinks } from "../project-links.mjs";
import { normalizeLogoUrl, submissionTags, websiteIdentity, projectWebsite } from "./core.mjs";

const fields = ["name", "category", "tags", "links", "summary", "problem", "audience", "whyRecommended", "limitations", "logo"];
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
export function updateRevision(project) {
  const snapshot = { id: project.id, slug: project.slug, name: project.name, repository: project.repository, category: project.category, tags: project.tags, links: project.links, avatar: new URL(project.avatar, "https://sota.cc").pathname, editorial: project.review.status === "reviewed" ? project.editorial : null, review: project.review };
  return createHash("sha256").update(canonical(snapshot)).digest("hex");
}
function object(value, allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) throw new Error("Update contains an unknown field or invalid object.");
}
function text(value, min, max) {
  if (typeof value !== "string" || value.trim().length < min || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error(`Use plain text of ${min}–${max} characters.`);
  return value.trim();
}
function https(value) {
  text(value, 1, 1000);
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Evidence must use HTTPS without credentials.");
  return url.href;
}
export function parseUpdate(body) {
  if (typeof body !== "string" || body.length > 20000) throw new Error("Update is empty or too long.");
  const match = /^\s*### Update request\s*\r?\n```json\r?\n([\s\S]*?)\r?\n```\s*$/.exec(body);
  if (!match) throw new Error("Use one JSON block under the Update request heading; see the Agent Skill update format.");
  const request = JSON.parse(match[1]);
  object(request, ["version", "projectId", "baseRevision", "changes", "reason", "evidence", "relationship"]);
  if (request.version !== 1 || !/^[a-f0-9]{64}$/.test(request.baseRevision ?? "")) throw new Error("Use version 1 and the current project's updateRevision from projects.json.");
  request.projectId = text(request.projectId, 1, 1000);
  request.reason = text(request.reason, 5, 1000);
  if (!["maker", "team", "community"].includes(request.relationship)) throw new Error("Relationship must be maker, team or community; this is a claim, not ownership verification.");
  if (!Array.isArray(request.evidence) || !request.evidence.length || request.evidence.length > 3) throw new Error("Provide 1–3 official HTTPS evidence URLs.");
  request.evidence = request.evidence.map(https);
  object(request.changes, fields);
  if (!Object.keys(request.changes).length) throw new Error("Include at least one changed field.");
  for (const [key, value] of Object.entries(request.changes)) {
    if (["name", "summary", "problem", "whyRecommended"].includes(key)) request.changes[key] = text(value, key === "name" ? 1 : 5, key === "name" ? 100 : key === "summary" ? 200 : 600);
    if (["audience", "limitations"].includes(key)) {
      if (!Array.isArray(value) || value.length > (key === "audience" ? 4 : 5) || (key === "audience" && !value.length)) throw new Error("Invalid audience or limitations array.");
      request.changes[key] = value.map(item => text(item, 2, key === "audience" ? 100 : 200));
      if (new Set(request.changes[key]).size !== value.length) throw new Error("Remove duplicate entries.");
    }
    if (key === "category") text(value, 1, 80);
    if (key === "tags") {
      if (!Array.isArray(value) || value.length > 3 || value.some(tag => typeof tag !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tag)) || new Set(value).size !== value.length) throw new Error("Use up to three unique tag IDs.");
      submissionTags(value.join(", "));
    }
    if (key === "links") {
      if (!Array.isArray(value)) throw new Error("Links must be an array.");
      value.forEach(link => object(link, ["type", "url", "label"]));
      request.changes.links = normalizeProjectLinks(value);
    }
    if (key === "logo") request.changes.logo = normalizeLogoUrl(value);
  }
  return request;
}
export function inspectUpdate(issue, projects, taxonomy) {
  if (issue.pull_request || issue.state !== "open" || !/^\[Update\]/i.test(issue.title ?? "")) throw new Error("Only open [Update] Issues can update products.");
  const request = parseUpdate(issue.body);
  const project = projects.find(item => item.id === request.projectId && (!item.publication || item.publication.status === "published"));
  if (!project) throw new Error("The target is not a published SOTA product.");
  const revision = project.updateRevision ?? updateRevision(project);
  if (request.baseRevision !== revision) throw new Error("The listing changed. Fetch the current projects.json and review your diff again before resubmitting.");
  if (request.changes.category && !taxonomy.categories.some(item => item.id === request.changes.category)) throw new Error("Choose an existing category ID.");
  if (request.changes.tags) submissionTags(request.changes.tags.join(", "), taxonomy.tags);
  if (request.changes.links) {
    const current = projectWebsite(project);
    const next = projectWebsite({ links: request.changes.links });
    if (!!current !== !!next || (current && websiteIdentity(current) !== websiteIdentity(next))) throw new Error("Official website identity changes require a separate maintainer migration; this update flow cannot change it.");
  }
  const changes = Object.entries(request.changes).map(([field, after]) => ({ field, before: ["summary", "problem", "audience", "whyRecommended", "limitations"].includes(field) ? project.editorial?.[field] ?? null : field === "logo" ? project.avatar : project[field], after }));
  if (changes.every(change => canonical(change.before) === canonical(change.after))) throw new Error("The proposed update does not change the listing.");
  return { request, project, changes };
}
