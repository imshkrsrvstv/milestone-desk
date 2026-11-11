import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  localReview,
  money,
  project,
  reviewApproval,
  sampleProject,
  validateAnalysis,
} from "../server/domain.mjs";
import { createPayPal } from "../server/paypal.mjs";
import { startServer } from "../server.mjs";

test("AI suggestions require exact excerpts and never accept criteria", () => {
  const m = sampleProject().milestones[0];
  const out = validateAnalysis(m, {
    summary: "Evidence review",
    criteria: m.criteria.map((c, i) => ({
      id: c.id,
      status: "supported",
      quote: i
        ? "A made up quote that never appeared."
        : "Viewport checks at 390px and 1440px passed with no horizontal scrolling.",
      reason: "The source provides an assertion.",
    })),
  });
  assert.equal(out.criteria[0].status, "supported");
  assert.equal(out.criteria[1].status, "missing");
  assert.equal(out.criteria[1].quote, "");
  assert.equal(m.approval, null);
  assert.throws(
    () => validateAnalysis(m, { summary: "Missing criteria", criteria: [] }),
    /incomplete/,
  );
  assert.throws(
    () =>
      validateAnalysis(m, {
        summary: "Duplicate ids",
        criteria: m.criteria.map(() => ({
          id: m.criteria[0].id,
          status: "missing",
          quote: "",
          reason: "Not present.",
        })),
      }),
    /match/,
  );
});
test("Human acceptance requires every criterion, a saved review, notes and attestation", () => {
  const m = sampleProject().milestones[0],
    input = {
      reviewer: "Test reviewer",
      attestation: true,
      decisions: m.criteria.map((c) => ({
        id: c.id,
        decision: "accepted",
        note: "I inspected the stated test evidence.",
      })),
    };
  assert.throws(() => reviewApproval(m, input), /Run an evidence review/);
  m.analysis = localReview(m);
  assert.equal(reviewApproval(m, input).ready, true);
  assert.throws(
    () => reviewApproval(m, { ...input, attestation: false }),
    /confirm/,
  );
  assert.equal(
    reviewApproval(m, {
      ...input,
      decisions: input.decisions.map((d, i) => ({
        ...d,
        decision: i ? "accepted" : "needs-work",
      })),
    }).ready,
    false,
  );
  for (const value of ["0.00", "-1.00", "12", "1.001", "1e2", "1000000.00"])
    assert.throws(() => money(value));
  assert.equal(money("12.50"), "12.50");
});
test("PayPal calls are fixed to sandbox and expose no send endpoint", async () => {
  const calls = [],
    fetcher = async (url, init) => {
      calls.push({ url, init });
      return new Response(
        JSON.stringify(
          url.endsWith("/token")
            ? { access_token: "fixture-token", expires_in: 300 }
            : { id: "INV2-TEST-TEST", status: "DRAFT" },
        ),
        { status: 200 },
      );
    };
  const paypal = createPayPal({
    env: {
      PAYPAL_SANDBOX_CLIENT_ID: "fixture-id",
      PAYPAL_SANDBOX_CLIENT_SECRET: "fixture-secret",
    },
    fetcher,
  });
  await paypal.preflight();
  await paypal.create({ detail: { currency_code: "USD" }, items: [] });
  await paypal.get("INV2-TEST-TEST");
  assert(
    calls.every((c) => c.url.startsWith("https://api-m.sandbox.paypal.com/")),
  );
  assert(calls.every((c) => !c.url.includes("/send")));
  assert.equal(paypal.send, undefined);
  assert.equal(calls[1].init.redirect, "error");
  await assert.rejects(paypal.get("../send"), /Invalid/);
});

test("HTTP journey binds invoices to reviewed scope, deduplicates create and preserves evidence", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "milestone-test-"));
  let calls = 0,
    payload;
  const paypal = {
    configured: true,
    merchantEmail: "",
    preflight: async () => {},
    create: async (input) => {
      calls++;
      payload = input;
      await new Promise((r) => setTimeout(r, 40));
      return { id: "INV2-FIXTURE-ONE" };
    },
    get: async () => ({
      id: "INV2-FIXTURE-ONE",
      status: "DRAFT",
      detail: payload.detail,
      primary_recipients: payload.primary_recipients,
      items: payload.items,
      amount: {
        value: payload.items[0].unit_amount.value,
        currency_code: "USD",
      },
    }),
  };
  const app = await startServer({
    port: 0,
    dataDir,
    paypal,
    ai: { configured: false },
  });
  try {
    const get = () => fetch(app.url + "/api/state").then((r) => r.json());
    let state = await get();
    const post = async (path, body) => {
      const r = await fetch(app.url + "/api/" + path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: app.url,
          "X-Milestone-Token": state.csrf,
        },
        body: JSON.stringify(body),
      });
      return { status: r.status, ...(await r.json()) };
    };
    const p = state.projects[0],
      m = p.milestones[0];
    let body = { projectId: p.id, milestoneId: m.id, revision: p.revision };
    assert.equal((await post("invoice/preview", body)).status, 409);
    assert.equal((await post("review/local", body)).status, 200);
    state = await get();
    body.revision = state.projects[0].revision;
    assert.equal(
      (
        await post("approve", {
          ...body,
          reviewer: "QA owner",
          attestation: true,
          decisions: m.criteria.map((c) => ({
            id: c.id,
            decision: "accepted",
            note: "Human checked this demonstration fixture.",
          })),
        })
      ).status,
      200,
    );
    const preview = await post("invoice/preview", body);
    assert.equal(preview.status, 200);
    assert.equal(
      (
        await post("invoice/create", {
          ...body,
          hash: "wrong",
          confirmDraft: true,
        })
      ).status,
      409,
    );
    const results = await Promise.all([
      post("invoice/create", {
        ...body,
        hash: preview.hash,
        confirmDraft: true,
      }),
      post("invoice/create", {
        ...body,
        hash: preview.hash,
        confirmDraft: true,
      }),
    ]);
    assert.equal(calls, 1);
    assert(results.every((r) => [200, 201].includes(r.status)));
    state = await get();
    assert.equal(state.attempts[0].status, "created");
    assert.equal(
      (
        await post("invoice/create", {
          ...body,
          hash: preview.hash,
          confirmDraft: true,
        })
      ).attempt.invoiceId,
      "INV2-FIXTURE-ONE",
    );
    assert.equal(calls, 1);
    body.revision = state.projects[0].revision;
    assert.equal(
      (await post("evidence", { ...body, evidence: "Changed evidence" }))
        .status,
      409,
    );
    const unauthorized = await fetch(app.url + "/api/projects", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://attacker.example",
      },
      body: "{}",
    });
    assert.equal(unauthorized.status, 403);
    const exported = await (await fetch(app.url + "/api/export")).text();
    assert(!exported.includes("fixture-token"));
    assert(!exported.includes(state.csrf));
  } finally {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("An ambiguous creation remains locked and can reconcile to the same invoice", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "milestone-uncertain-"));
  let payload,
    calls = 0;
  const invoice = () => ({
    id: "INV2-RECOVERED",
    status: "DRAFT",
    detail: payload.detail,
    primary_recipients: payload.primary_recipients,
    items: payload.items,
    amount: { value: payload.items[0].unit_amount.value, currency_code: "USD" },
  });
  const paypal = {
    configured: true,
    merchantEmail: "",
    preflight: async () => {},
    create: async (p) => {
      payload = p;
      calls++;
      const e = Error("Connection lost after creation.");
      e.status = 502;
      e.uncertain = true;
      throw e;
    },
    search: async () => [invoice()],
    get: async () => invoice(),
  };
  const app = await startServer({
    port: 0,
    dataDir,
    paypal,
    ai: { configured: false },
  });
  try {
    const state = await (await fetch(app.url + "/api/state")).json(),
      p = state.projects[0],
      m = p.milestones[0];
    app.store.local(p.id, m.id, p.revision);
    app.store.approve(
      p.id,
      m.id,
      {
        reviewer: "Test owner",
        attestation: true,
        decisions: m.criteria.map((c) => ({
          id: c.id,
          decision: "accepted",
          note: "Checked the synthetic evidence.",
        })),
      },
      1,
    );
    const post = async (path, body) => {
      const r = await fetch(app.url + "/api/" + path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: app.url,
          "X-Milestone-Token": state.csrf,
        },
        body: JSON.stringify(body),
      });
      return { status: r.status, ...(await r.json()) };
    };
    const context = { projectId: p.id, milestoneId: m.id };
    const preview = await post("invoice/preview", context);
    assert.equal(
      (
        await post("invoice/create", {
          ...context,
          hash: preview.hash,
          confirmDraft: true,
        })
      ).status,
      502,
    );
    assert.equal(app.store.draft(m.id).status, "uncertain");
    assert.equal(
      (await post("invoice/retry", { milestoneId: m.id, confirmDraft: true }))
        .status,
      409,
    );
    await post("invoice/create", {
      ...context,
      hash: preview.hash,
      confirmDraft: true,
    });
    assert.equal(calls, 1);
    assert.equal(
      (await post("invoice/reconcile", { milestoneId: m.id })).attempt.status,
      "created",
    );
  } finally {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("A changed provider invoice identity, recipient, or line item never becomes confirmed", async (t) => {
  const variants = {
    wrongId: (i) => ({ ...i, id: "INV2-WRONG" }),
    extraRecipient: (i) => ({
      ...i,
      primary_recipients: [
        ...i.primary_recipients,
        { billing_info: { email_address: "other@example.com" } },
      ],
    }),
    changedLine: (i) => ({
      ...i,
      items: [{ ...i.items[0], name: "Unapproved work", quantity: "2" }],
    }),
  };
  for (const [name, change] of Object.entries(variants))
    await t.test(name, async () => {
      const dataDir = await mkdtemp(join(tmpdir(), "milestone-mismatch-"));
      let payload;
      const paypal = {
        configured: true,
        merchantEmail: "",
        preflight: async () => {},
        create: async (p) => {
          payload = p;
          return { id: "INV2-EXPECTED" };
        },
        get: async () =>
          change({
            id: "INV2-EXPECTED",
            status: "DRAFT",
            detail: payload.detail,
            primary_recipients: payload.primary_recipients,
            items: payload.items,
            amount: {
              value: payload.items[0].unit_amount.value,
              currency_code: "USD",
            },
          }),
      };
      const app = await startServer({
        port: 0,
        dataDir,
        paypal,
        ai: { configured: false },
      });
      try {
        const state = await (await fetch(app.url + "/api/state")).json(),
          p = state.projects[0],
          m = p.milestones[0];
        app.store.local(p.id, m.id, 0);
        app.store.approve(
          p.id,
          m.id,
          {
            reviewer: "Synthetic reviewer",
            attestation: true,
            decisions: m.criteria.map((c) => ({
              id: c.id,
              decision: "accepted",
              note: "Verified fictional QA evidence.",
            })),
          },
          1,
        );
        const call = async (path, body) => {
          const r = await fetch(app.url + "/api/" + path, {
            method: "POST",
            headers: {
              Origin: app.url,
              "Content-Type": "application/json",
              "X-Milestone-Token": state.csrf,
            },
            body: JSON.stringify(body),
          });
          return { status: r.status, ...(await r.json()) };
        };
        const body = { projectId: p.id, milestoneId: m.id },
          preview = await call("invoice/preview", body);
        assert.equal(
          (
            await call("invoice/create", {
              ...body,
              hash: preview.hash,
              confirmDraft: true,
            })
          ).status,
          502,
        );
        assert.equal(app.store.draft(m.id).status, "uncertain");
        assert.equal(app.store.draft(m.id).invoiceId, "INV2-EXPECTED");
        assert.equal(
          (await call("invoice/reconcile", { milestoneId: m.id })).status,
          502,
        );
        assert.equal(app.store.draft(m.id).status, "uncertain");
      } finally {
        await app.close();
        await rm(dataDir, { recursive: true, force: true });
      }
    });
});

test("A delayed AI result cannot erase a newer human acceptance", async () => {
  const { createStore } = await import("../server/store.mjs");
  const dataDir = await mkdtemp(join(tmpdir(), "milestone-stale-ai-"));
  const store = createStore(dataDir);
  try {
    const p = store.snapshot().projects[0],
      m = p.milestones[0];
    const job = store.aiStart(p.id, m.id, 0);
    store.local(p.id, m.id, 0);
    store.approve(
      p.id,
      m.id,
      {
        reviewer: "Human after AI started",
        attestation: true,
        decisions: m.criteria.map((c) => ({
          id: c.id,
          decision: "accepted",
          note: "Inspected the synthetic delivery note.",
        })),
      },
      1,
    );
    const raw = {
      summary: "Delayed analysis",
      criteria: m.criteria.map((c) => ({
        id: c.id,
        status: "missing",
        quote: "",
        reason: "Synthetic delayed response.",
      })),
    };
    assert.throws(
      () => store.aiFinish(p.id, m.id, job.fingerprint, raw, job.p.revision),
      /changed/,
    );
    assert.equal(store.get(p.id).milestones[0].approval.ready, true);
    assert.equal(
      store.get(p.id).milestones[0].approval.reviewer,
      "Human after AI started",
    );
  } finally {
    store.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
