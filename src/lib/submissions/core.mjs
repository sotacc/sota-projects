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
export function normalizeLogoUrl(value) {
  if (typeof value !== "string" || value.length > 1000 || !/^https:\/\//i.test(value) || /[\s\\\u0000-\u001f\u007f]/u.test(value)) throw new Error("Logo: use a direct HTTPS image URL (up to 1000 characters).");
  let url;
  try { url = new URL(value); } catch { throw new Error("Logo: enter a valid HTTPS image URL."); }
  if (url.username || url.password || url.hash) throw new Error("Logo: remove credentials and fragments from the image URL.");
  if (/\.svg$/i.test(url.pathname)) throw new Error("Logo: use PNG, JPEG or WebP. Export an SVG logo to PNG first.");
  return url.href;
}
export const fieldLabels = {
  name: "Product name", repo: "GitHub repository", purpose: "Summary", tags: "Tags", problem: "Problem it solves", audience: "Who is it for?", reason: "Why is it useful?", limitations: "Known limitations", evidence: "Evidence links", logo: "Project logo",
  website: "Project website", documentation: "Documentation", demo: "Demo", x: "Official X profile", discord: "Discord", customLinks: "Other project links",
};
const optionalLinkFields = ["website", "documentation", "demo", "x", "discord", "customLinks"];
/** @param {string | undefined} value @param {{id: string}[]} [allowedTags] */
export function submissionTags(value, allowedTags) {
  if (!value || value === "_No response_") return [];
  if (typeof value !== "string" || value.length > 300) throw new Error("Choose up to 3 tags from the submission page.");
  const tags = [...new Set(value.split(/[,\r\n]+/).map(tag => tag.trim()).filter(Boolean))];
  if (!tags.length || tags.length > 3 || tags.some(tag => tag.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tag))) throw new Error("Use up to 3 tag IDs, separated by commas or new lines.");
  if (allowedTags && tags.some(tag => !allowedTags.some(item => item.id === tag))) throw new Error("Unknown tag. Choose existing tags from https://sota.cc/submit/.");
  return tags;
}
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
  try {
    const tags = submissionTags(values.tags);
    if (tags.length) values.tags = tags.join(", ");
    else delete values.tags;
  } catch (error) { errors.tags = error.message; }
  for (const key of ["repo", "name"]) if (!values[key] || values[key] === "_No response_") delete values[key];
  if (values.name && (Array.from(values.name).length > 100 || /[\u0000-\u001f\u007f]/u.test(values.name) || /^#{1,6}\s/.test(values.name))) errors.name = "Use a plain-text product name of up to 100 characters.";
  const normalized = normalizeRepository(values.repo);
  if (values.repo && !normalized) errors.repo = "Enter a GitHub repository URL or owner/repo.";
  else if (normalized) values.repo = normalized;
  for (const [key, limit] of [["purpose", 200], ["problem", 600], ["audience", 600], ["reason", 600], ["limitations", 1000]]) {
    if (key !== "purpose" && (!values[key] || values[key] === "_No response_")) { delete values[key]; continue; }
    if (values[key].replace(/\s/g, "").length < 5) errors[key] = "Please add at least 5 characters.";
    else if (Array.from(values[key]).length > limit) errors[key] = `Use at most ${limit} characters.`;
    else if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(values[key]) || /^#{1,6}\s/m.test(values[key])) errors[key] = "Use plain text without Markdown headings or control characters.";
  }
  if (!values.logo || values.logo === "_No response_") delete values.logo;
  else { try { values.logo = normalizeLogoUrl(values.logo); } catch (error) { errors.logo = error.message; } }
  for (const key of optionalLinkFields) {
    if (!values[key] || values[key] === "_No response_") { delete values[key]; continue; }
    if (key === "customLinks") continue;
    try { values[key] = normalizeProjectLinks([{ type: key, url: values[key] }])[0].url; }
    catch (error) { errors[key] = error.message; }
  }
  if (!values.evidence || values.evidence === "_No response_") values.evidence = values.website || values.repo || "";
  const links = values.evidence.split(/\s+/).filter(Boolean);
  if (!links.length || links.length > 3 || values.evidence.length > 1000 || links.some(link => {
    try { const url = new URL(link); return url.protocol !== "https:" || !!url.username || !!url.password; } catch { return true; }
  })) errors.evidence = "Add 1–3 HTTPS links to an official website, documentation, or a demo.";
  else values.evidence = links.join("\n");
  for (const [key, max] of [["audience", 4], ["limitations", 5]]) {
    if (!values[key]) continue;
    const lines = submissionLines(values[key]);
    if (!lines.length || lines.length > max || lines.some(line => Array.from(line).length > (key === "audience" ? 100 : 200))) errors[key] = `Use up to ${max} lines, each at most ${key === "audience" ? 100 : 200} characters.`;
    else values[key] = lines.join("\n");
  }
  if (values.customLinks?.length > 6000) errors.customLinks = "Use at most 6000 characters for custom links.";
  if (!optionalLinkFields.some(key => errors[key])) {
    try { submissionProjectLinks(values); } catch (error) { errors.customLinks = error.message; }
  }
  if (!values.repo) {
    if (!values.name) errors.name = "Enter the product name.";
    if (!values.website) errors.website = "Add an official website, or provide a public GitHub repository.";
  }
  return { values, errors };
}
export function submissionLines(value) {
  return [...new Set((value ?? "").split(/\r?\n/).map(line => line.replace(/^\s*[-*]\s+/, "").trim()).filter(Boolean))];
}
/** Submitted suggestions remain unreviewed until an independent editorial review. */
export function submissionEditorial(values) {
  return { summary: values.purpose || null, problem: values.problem || null, audience: submissionLines(values.audience), whyRecommended: values.reason || null, limitations: submissionLines(values.limitations) };
}
export function submissionBody(values) {
  const visible = new Set(["purpose", "problem", "audience", "reason", "limitations"]);
  return Object.entries(fieldLabels).filter(([key]) => values[key] || visible.has(key)).map(([key, label]) => `### ${label}\n${values[key] || "_No response_"}\n`).join("\n");
}
export function parseSubmission(body) {
  if (typeof body !== "string" || body.length > 20000) throw new Error("Submission is empty or too long.");
  const fields = {};
  const labels = new Map(Object.entries(fieldLabels).map(([key, value]) => [value, key]));
  // Preserve old Issue Forms and reject mixed old/new duplicate headings.
  for (const [label, key] of Object.entries({ "What does it do?": "purpose", "Why is it worth including?": "reason", "Problem": "problem", "Audience": "audience" })) labels.set(label, key);
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
  url.searchParams.set("title", `[Project] ${checked.values.name || checked.values.repo.split("/").pop()}`);
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

/** URL identity preserves product paths and meaningful queries; fragments and tracking do not identify products. */
export function websiteIdentity(value) {
  const normalized = normalizeProjectLinks([{ type: "website", url: value }])[0].url;
  const url = new URL(normalized);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) if (/^utm_/i.test(key) || ["gclid", "fbclid"].includes(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  return url.href.replace(/\/(?=\?|$)/, "");
}
export function projectWebsite(project) {
  return project.websiteUrl ?? project.links?.find(link => link.type === "website")?.url ?? null;
}
