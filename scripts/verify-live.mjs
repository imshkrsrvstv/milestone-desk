// Explicit opt-in. Creates one unsent sandbox invoice for a fictional QA milestone.
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAI } from "../server/ai.mjs";
import { createPayPal } from "../server/paypal.mjs";
import { startServer } from "../server.mjs";
const ai = createAI(),
  paypal = createPayPal();
if (!ai.configured || !paypal.configured)
  throw Error(
    "Configure both signed-in AI and PayPal sandbox before the explicit live verification.",
  );
const dataDir = await mkdtemp(join(tmpdir(), "milestone-live-"));
const app = await startServer({ port: 0, dataDir, ai, paypal });
try {
  const state = await (await fetch(app.url + "/api/state")).json(),
    p = state.projects[0],
    m = p.milestones[0];
  const call = async (path, body) => {
    const r = await fetch(app.url + "/api/" + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: app.url,
        "X-Milestone-Token": state.csrf,
      },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok) throw Error(path + ": " + d.error);
    return d;
  };
  console.log("Running real AI review on fictional delivery evidence.");
  const reviewed = await call("review/ai", {
    projectId: p.id,
    milestoneId: m.id,
    revision: p.revision,
  });
  console.log(
    "AI review returned " +
      reviewed.project.milestones[0].analysis.criteria.length +
      " mapped criteria.",
  );
  await call("approve", {
    projectId: p.id,
    milestoneId: m.id,
    revision: reviewed.project.revision,
    reviewer: "Synthetic QA verification",
    attestation: true,
    decisions: m.criteria.map((c) => ({
      id: c.id,
      decision: "accepted",
      note: "This is an explicitly synthetic integration test acceptance, not a customer outcome.",
    })),
  });
  const preview = await call("invoice/preview", {
    projectId: p.id,
    milestoneId: m.id,
  });
  const request = {
    projectId: p.id,
    milestoneId: m.id,
    hash: preview.hash,
    confirmDraft: true,
  };
  const created = await call("invoice/create", request),
    repeated = await call("invoice/create", request);
  if (
    created.attempt.status !== "created" ||
    created.attempt.invoiceId !== repeated.attempt.invoiceId
  )
    throw Error("Draft state or idempotence failed.");
  const reconciled = await call("invoice/reconcile", { milestoneId: m.id });
  await mkdir(new URL("../data/", import.meta.url), { recursive: true });
  await writeFile(
    new URL("../data/live-verification.json", import.meta.url),
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        ai: reviewed.project.milestones[0].analysis,
        paypalDraftId: created.attempt.invoiceId,
        state: reconciled.attempt.status,
        duplicateCreateReturnedSame: true,
        sent: false,
        syntheticOnly: true,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(
    "Real AI review, sandbox DRAFT creation, retrieval, reconciliation and repeated-create deduplication passed. No invoice sent.",
  );
} finally {
  await app.close();
  await rm(dataDir, { recursive: true, force: true });
}
