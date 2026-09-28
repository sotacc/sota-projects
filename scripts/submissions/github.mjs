import { createHash } from "node:crypto";
export const bodyHash = body => createHash("sha256").update(body ?? "").digest("hex");
export async function github(path, { token = process.env.GH_TOKEN, method = "GET", body } = {}) {
  if (!path.startsWith("/repos/") && path !== "/user") throw new Error("Unexpected GitHub API path");
  const response = await fetch(`https://api.github.com${path}`, {
    method, redirect: "error", signal: AbortSignal.timeout(20000),
    headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(`GitHub ${method} ${path.split("?")[0]} returned ${response.status}`);
  return response.status === 204 ? null : boundedJson(response);
}
export async function boundedJson(response) {
  let size = 0; const chunks = [];
  for await (const chunk of response.body) { size += chunk.length; if (size > 2_000_000) throw new Error("Response exceeds 2 MB"); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
