import { normalizeProjectLinks } from "../project-links.mjs";
/** Shared browser/Actions validation. Never execute submitted URLs or source code. */
const OWNER = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;
const REPO = /^[a-z\d_.-]{1,100}$/i;
export function normalizeRepository(input) {
  if (typeof input !== "string") return null;
  let value = input.trim();
  if (!value || /[\s\\\u0000-\u001f\u007f]/u.test(value)) return null;
  if (/^git@github\.com:/i.test(value)) value = value.replace(/^git@github\.com:/i, "https://github.com/");
  else if (/^(?:www\.)?github\.com\//i.test(value)) value = `https://${value}`;
  else if (!value.includes(":") && !value.startsWith("/")) value = `https://github.com/${value}`;
  try {
    // Validate the literal authority/path before URL can normalize lookalikes or dot segments.
    const match = /^https:\/\/(?:www\.)?github\.com\/([^?#]+)(?:[?#].*)?$/i.exec(value);
    if (!match) return null;
    const parts = match[1].replace(/\/$/, "").split("/");
    if (parts.some(part => part === "." || part === ".." || part.includes("%"))) return null;
    const [owner, rawRepo, extra] = parts;
    const repo = rawRepo?.replace(/\.git$/i, "");
    if (!OWNER.test(owner ?? "") || !REPO.test(repo ?? "") || repo === "." || repo === "..") return null;
    if (parts.some(part => !part)) return null;
    if (extra && !["tree", "blob"].includes(extra)) return null;
    if (extra && parts.length < 4) return null;
    return `https://github.com/${owner}/${repo}`;
  } catch { return null; }
}
export function repositoryName(value) {
  const url = normalizeRepository(value);
  return url ? new URL(url).pathname.slice(1) : null;
}
export const fieldLabels = {
  repo: "GitHub repository", purpose: "What does it do?", reason: "Why is it worth including?", evidence: "Evidence links",
  website: "Project website", documentation: "Documentation", demo: "Demo", x: "Official X profile", discord: "Discord", customLinks: "Other project links",
};
const optionalLinkFields = ["website", "documentation", "demo", "x", "discord", "customLinks"];
export function submissionProjectLinks(values) {
  const links = ["website", "documentation", "demo", "x", "discord"].filter(type => values[type]).map(type => ({ type, url: values[type] }));
  if (values.customLinks) {
    for (const line of values.customLinks.split(/\r?\n/).filter(line => line.trim())) {
      const parts = line.split("|").map(part => part.trim());
      if (parts.length !== 2) throw new Error("Use one custom link per line: Label | https://example.com");
      links.push({ type: "custom", label: parts[0], url: parts[1] });
    }
  }
  return normalizeProjectLinks(links);
}
export function validateSubmission(input) {
  const values = Object.fromEntries(Object.keys(fieldLabels).map(key => [key, typeof input?.[key] === "string" ? input[key].trim() : ""]));
  const errors = {};
  const normalized = normalizeRepository(values.repo);
  if (!normalized) errors.repo = "Enter a GitHub repository URL or owner/repo.";
  else values.repo = normalized;
  for (const [key, limit] of [["purpose", 200], ["reason", 600]]) {
    if (values[key].replace(/\s/g, "").length < 5) errors[key] = "Please add at least 5 characters.";
    else if (Array.from(values[key]).length > limit) errors[key] = `Use at most ${limit} characters.`;
    else if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(values[key]) || /^#{1,6}\s/m.test(values[key])) errors[key] = "Use plain text without Markdown headings or control characters.";
  }
  const links = values.evidence.split(/\s+/).filter(Boolean);
  if (!links.length || links.length > 3 || values.evidence.length > 1000 || links.some(link => {
    try { const url = new URL(link); return url.protocol !== "https:" || !!url.username || !!url.password; } catch { return true; }
  })) errors.evidence = "Add 1–3 HTTPS links to a README, documentation, or a demo.";
  else values.evidence = links.join("\n");
  for (const key of optionalLinkFields) {
    if (!values[key] || values[key] === "_No response_") { delete values[key]; continue; }
    if (key === "customLinks") continue;
    try { values[key] = normalizeProjectLinks([{ type: key, url: values[key] }])[0].url; }
    catch (error) { errors[key] = error.message; }
  }
  if (values.customLinks?.length > 6000) errors.customLinks = "Use at most 6000 characters for custom links.";
  if (!optionalLinkFields.some(key => errors[key])) {
    try { submissionProjectLinks(values); } catch (error) { errors.customLinks = error.message; }
  }
  return { values, errors };
}
export function submissionBody(values) {
  return Object.entries(fieldLabels).filter(([key]) => values[key]).map(([key, label]) => `### ${label}\n${values[key]}\n`).join("\n");
}
export function parseSubmission(body) {
  if (typeof body !== "string" || body.length > 20000) throw new Error("Submission is empty or too long.");
  const fields = {};
  const labels = new Map(Object.entries(fieldLabels).map(([key, value]) => [value, key]));
  const sections = [...body.matchAll(/^### (.+)\r?\n([\s\S]*?)(?=^### |$(?![\s\S]))/gm)];
  for (const section of sections) {
    const key = labels.get(section[1].trim());
    if (!key) continue;
    if (key in fields) throw new Error(`Duplicate section: ${section[1]}`);
    fields[key] = section[2].trim();
  }
  const result = validateSubmission(fields);
  if (Object.keys(result.errors).length) throw new Error(Object.values(result.errors).join(" "));
  return result.values;
}
export function createIssueUrl(target, values) {
  const repo = repositoryName(target);
  if (!repo || repo.toLowerCase() !== target.toLowerCase()) throw new Error("A valid submission repository must be configured.");
  const checked = validateSubmission(values);
  if (Object.keys(checked.errors).length) throw new Error("Fix the submission fields before continuing.");
  const url = new URL(`https://github.com/${repo}/issues/new`);
  url.searchParams.set("title", `[Project] ${checked.values.repo.split("/").pop()}`);
  url.searchParams.set("body", submissionBody(checked.values));
  // Labels are deliberately omitted: public contributors cannot assign them.
  // Fall back to copying the draft rather than sending an oversized request URL.
  return url.toString().length <= 6000 ? url.toString() : null;
}

export function validateConfig(config) {
  if (!config || Object.keys(config).some(key => !["repository", "siteUrl"].includes(key))) throw new Error("Invalid submissions configuration.");
  if (config.repository !== null && (typeof config.repository !== "string" || repositoryName(config.repository) !== config.repository)) throw new Error("Submission repository must be null or owner/repo.");
  if (config.siteUrl !== null) {
    let url;
    try { url = new URL(config.siteUrl); } catch { throw new Error("Site URL must be null or an HTTPS origin."); }
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Site URL must be an HTTPS origin without credentials, paths or queries.");
  }
  return config;
}
