/** Shared by content validation, the browser form and the dependency-free intake checker. */
export const projectLinkTypes = ["website", "documentation", "demo", "x", "discord", "custom"];
export const projectLinkLabels = { website: "Website", documentation: "Documentation", demo: "Demo", x: "X", discord: "Discord", custom: "Other" };
/**
 * @typedef {{type: "website" | "documentation" | "demo" | "x" | "discord" | "custom", url: string, label?: string}} ProjectLink
 * @param {ProjectLink[]} links
 * @returns {ProjectLink[]}
 */
export function normalizeProjectLinks(links) {
  if (!Array.isArray(links) || links.length > 10) throw new Error("Use at most 10 project links.");
  const urls = new Set(); const types = new Set();
  return links.map(link => {
    if (!link || !projectLinkTypes.includes(link.type)) throw new Error("Choose a supported project link type.");
    const label = projectLinkLabels[link.type];
    if (typeof link.url !== "string" || link.url.length > 1000 || /[\s\\\u0000-\u001f\u007f]/u.test(link.url)) throw new Error(`${label}: use an HTTPS URL without spaces or control characters.`);
    let url;
    try { url = new URL(link.url); } catch { throw new Error(`${label}: enter a valid HTTPS URL.`); }
    if (url.protocol !== "https:" || url.username || url.password) throw new Error(`${label}: use an HTTPS URL without embedded credentials.`);
    if (link.type === "x") {
      const handle = url.pathname.replace(/^\//, "").replace(/\/$/, "");
      if (!["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(url.hostname) || url.port || !/^[a-zA-Z0-9_]{1,15}$/.test(handle) || /^(home|explore|search|intent|i|settings|notifications|messages|login|signup|share)$/i.test(handle) || url.search || url.hash) throw new Error("X: enter a profile URL, such as https://x.com/username. Put posts in Evidence links.");
      url = new URL(`https://x.com/${handle.toLowerCase()}`);
    }
    if (link.type === "discord" && (url.port || url.search || url.hash || !((url.hostname === "discord.gg" && /^\/[a-zA-Z0-9-]+\/?$/.test(url.pathname)) || (["discord.com", "www.discord.com"].includes(url.hostname) && /^\/invite\/[a-zA-Z0-9-]+\/?$/.test(url.pathname))))) throw new Error("Discord: enter a discord.gg invitation or a discord.com/invite URL.");
    if (link.type === "discord") url = new URL(`https://discord.gg/${url.pathname.split("/").filter(Boolean).at(-1)}`);
    if (link.type !== "custom" && types.has(link.type)) throw new Error(`Only one ${label} link is allowed.`);
    types.add(link.type);
    if (urls.has(url.href)) throw new Error("Remove duplicate project links.");
    urls.add(url.href);
    if (link.type === "custom") {
      if (typeof link.label !== "string" || !link.label.trim() || link.label.trim().length > 40 || /[\u0000-\u001f\u007f|]/u.test(link.label) || /^#{1,6}\s/.test(link.label.trim())) throw new Error("Custom links need a plain-text label of 1–40 characters.");
      return { type: link.type, label: link.label.trim(), url: url.href };
    }
    if (link.label !== undefined) throw new Error("Only custom project links accept a label.");
    return { type: link.type, url: url.href };
  });
}
