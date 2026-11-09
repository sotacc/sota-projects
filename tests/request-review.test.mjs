import { test } from "node:test";
import assert from "node:assert/strict";
import { requestReview } from "../scripts/submissions/request-review.mjs";

const issue = { number: 21, state: "open", title: "[Project] Example", body: "Untrusted submission text" };
const event = { action: "opened", repository: { full_name: "sotacc/sota-projects" }, issue };
const opts = { intakeToken: "intake-fixture", triggerToken: "trigger-fixture" };

test("new, edited and reopened product events request a trusted full-queue review", async () => {
  for (const action of ["opened", "edited", "reopened"]) {
    const calls = [];
    const api = async (path, options) => { calls.push({ path, ...options }); return calls.length === 1 ? issue : null; };
    assert.equal(await requestReview({ ...event, action }, { ...opts, api }), "review-requested");
    assert.deepEqual(calls, [
      { path: "/repos/sotacc/sota-projects/issues/21", token: opts.intakeToken },
      { path: "/repos/sotacc/sota-web/actions/workflows/review-submissions.yml/dispatches", token: opts.triggerToken,
        method: "POST", body: { ref: "main", inputs: {} } },
    ]);
  }
});

test("unrelated issues, updates, PRs, closed issues and wrong repositories cannot trigger publication", async () => {
  const never = async () => { throw new Error("Unexpected API call"); };
  for (const change of [{ title: "Question" }, { title: "[Update] Example" }, { pull_request: {} }]) {
    assert.equal(await requestReview({ ...event, issue: { ...issue, ...change } }, { ...opts, api: never }), "ignored");
  }
  assert.equal(await requestReview({ ...event, action: "closed" }, { ...opts, api: never }), "ignored");
  await assert.rejects(requestReview({ ...event, repository: { full_name: "other/repository" } }, { ...opts, api: never }), /Unexpected intake/);
  for (const change of [{ state: "closed" }, { title: "Discussion" }, { pull_request: {} }, { number: 999 }]) {
    let calls = 0;
    assert.equal(await requestReview(event, { ...opts, api: async () => { calls++; return { ...issue, ...change }; } }), "ignored");
    assert.equal(calls, 1);
  }
});

test("preparation does not mint or use the trigger credential, and API failures stay visible", async () => {
  let calls = 0;
  const api = async () => { calls++; return issue; };
  assert.equal(await requestReview(event, { prepare: true, intakeToken: opts.intakeToken, api }), "ready");
  assert.equal(calls, 1);
  await assert.rejects(requestReview(event, { api }), /Missing short-lived/);
  await assert.rejects(requestReview(event, { ...opts, api: async path => {
    if (path.endsWith("/issues/21")) return issue;
    throw new Error("GitHub dispatch returned 403");
  } }), /403/);
});

test("legacy product titles and maintainer-only closed-Issue probes use the same fixed target", async () => {
  let dispatch;
  const api = async (path, options) => path.endsWith("/issues/21")
    ? { ...issue, title: "Submit project: Example", state: "closed" }
    : (dispatch = { path, ...options });
  assert.equal(await requestReview({ repository: event.repository, inputs: { issue_number: "21" } }, { ...opts, manual: true, api }), "review-requested");
  assert.deepEqual(dispatch.body, { ref: "main", inputs: { issue_number: "21" } });
  assert.equal(dispatch.path, "/repos/sotacc/sota-web/actions/workflows/review-submissions.yml/dispatches");
  await assert.rejects(requestReview({ repository: event.repository, inputs: { issue_number: "21; bad" } }, { ...opts, manual: true, api }), /positive Issue/);
});
