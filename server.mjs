import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join, extname } from "node:path";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createStore } from "./server/store.mjs";
import { createPayPal } from "./server/paypal.mjs";
import { createAI } from "./server/ai.mjs";
import { fail } from "./server/domain.mjs";
const root = fileURLToPath(new URL("./", import.meta.url));
const assets = new Set([
  "index.html",
  "app.mjs",
  "style.css",
  "theme.js",
  "vendor/ag-grid-community-36.3.0.min.js",
  "vendor/ag-grid-LICENSE.txt",
]);
export async function startServer({
  port = 4344,
  dataDir = join(root, "data"),
  paypal = createPayPal(),
  ai = createAI(),
} = {}) {
  const store = createStore(dataDir),
    csrf = randomBytes(24).toString("hex");
  let aiBusy = false;
  const pending = new Set();
  const hash = (value) =>
    createHash("sha256").update(JSON.stringify(value)).digest("hex");
  function checkInvoice(invoice, payload, expectedId) {
    if (invoice.id !== expectedId)
      fail(502, "PayPal returned a different invoice identifier.");
    if (
      !Array.isArray(invoice.primary_recipients) ||
      invoice.primary_recipients.length !== 1 ||
      (invoice.additional_recipients || []).length
    )
      fail(502, "PayPal returned unexpected invoice recipients.");
    const item = invoice.items?.[0],
      wanted = payload.items[0];
    if (
      !Array.isArray(invoice.items) ||
      invoice.items.length !== 1 ||
      item.name !== wanted.name ||
      item.description !== wanted.description ||
      Number(item.quantity) !== 1 ||
      item.unit_amount?.currency_code !== wanted.unit_amount.currency_code ||
      Number(item.unit_amount?.value) !== Number(wanted.unit_amount.value)
    )
      fail(502, "PayPal returned different invoice line items.");
    if (
      invoice.detail?.invoice_number !== payload.detail.invoice_number ||
      invoice.detail?.currency_code !== payload.detail.currency_code ||
      invoice.detail?.reference !== payload.detail.reference
    )
      fail(502, "The PayPal invoice does not match the approved milestone.");
    const amount = invoice.amount?.value;
    const expected = payload.items[0].unit_amount.value;
    if (
      amount === undefined ||
      Number(amount) !== Number(expected) ||
      invoice.amount?.currency_code !== payload.detail.currency_code
    )
      fail(
        502,
        "PayPal returned a different invoice total. Inspect the sandbox draft before continuing.",
      );
    const recipient =
      invoice.primary_recipients?.[0]?.billing_info?.email_address;
    if (
      recipient?.toLowerCase() !==
      payload.primary_recipients[0].billing_info.email_address.toLowerCase()
    )
      fail(502, "PayPal returned a different invoice recipient.");
    if (invoice.status !== "DRAFT")
      fail(
        409,
        "This invoice is " +
          String(invoice.status || "unknown") +
          " in PayPal. It is not an unsent draft.",
      );
  }
  async function completeAttempt(attempt) {
    const mid = attempt.milestoneId;
    try {
      const created = await paypal.create(attempt.payload);
      store.attempted(mid, "uncertain", {
        invoiceId: created.id,
        error: "Invoice identifier received. Verifying its draft state.",
      });
      const invoice = await paypal.get(created.id);
      checkInvoice(invoice, attempt.payload, created.id);
      return store.attempted(mid, "created", { invoiceId: created.id });
    } catch (error) {
      const existing = store.draft(mid);
      const definite =
        !existing.invoiceId &&
        error.providerStatus >= 400 &&
        error.providerStatus < 500;
      store.attempted(mid, definite ? "rejected" : "uncertain", {
        error: error.message,
      });
      throw error;
    }
  }
  const server = createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'; form-action 'none'",
    );
    const json = (status, data) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
      });
      res.end(JSON.stringify(data));
    };
    try {
      const host = req.headers.host || "",
        allowed = [
          "127.0.0.1:" + server.address().port,
          "localhost:" + server.address().port,
        ];
      if (!allowed.includes(host)) fail(403, "Unrecognized local host.");
      if (req.headers["sec-fetch-site"] === "cross-site")
        fail(403, "Open Milestone Desk directly to continue.");
      const url = new URL(req.url, "http://" + host),
        path = url.pathname;
      if (req.method === "GET" && path === "/health")
        return json(200, {
          ok: true,
          app: "Milestone Desk",
          sandboxOnly: true,
        });
      if (req.method === "GET" && path === "/api/state")
        return json(200, {
          ...store.snapshot(),
          csrf,
          settings: {
            paypal: paypal.configured,
            ai: ai.configured,
            aiBusy,
            mode: "sandbox",
            merchantConfigured: Boolean(paypal.merchantEmail),
          },
        });
      if (req.method === "GET" && path === "/api/export") {
        res.setHeader(
          "Content-Disposition",
          'attachment; filename="milestone-review-packet.json"',
        );
        return json(200, {
          app: "Milestone Desk",
          exportedAt: new Date().toISOString(),
          ...store.snapshot(),
        });
      }
      if (req.method === "POST") {
        if (req.headers.origin !== "http://" + host)
          fail(403, "Use the same local app origin.");
        const token = String(req.headers["x-milestone-token"] || "");
        if (
          !/^[a-f0-9]{48}$/.test(token) ||
          !timingSafeEqual(Buffer.from(token), Buffer.from(csrf))
        )
          fail(403, "Refresh the app before saving.");
        if (!(req.headers["content-type"] || "").startsWith("application/json"))
          fail(415, "Send JSON.");
        let raw = "";
        for await (const chunk of req) {
          raw += chunk;
          if (Buffer.byteLength(raw) > 100000)
            fail(413, "This request is too large.");
        }
        let body;
        try {
          body = JSON.parse(raw);
        } catch {
          fail(400, "Send a valid JSON request.");
        }
        if (path === "/api/projects")
          return json(201, { project: store.create(body) });
        if (path === "/api/milestones")
          return json(201, {
            project: store.addMilestone(
              body.projectId,
              body.milestone,
              body.revision,
            ),
          });
        if (path === "/api/evidence")
          return json(200, {
            project: store.evidence(
              body.projectId,
              body.milestoneId,
              body.evidence,
              body.revision,
            ),
          });
        if (path === "/api/review/local")
          return json(200, {
            project: store.local(
              body.projectId,
              body.milestoneId,
              body.revision,
            ),
          });
        if (path === "/api/review/ai") {
          if (!ai.configured)
            fail(
              503,
              "AI review is unavailable. Local review remains available.",
            );
          if (aiBusy) fail(429, "One AI review is already running.");
          const job = store.aiStart(
            body.projectId,
            body.milestoneId,
            body.revision,
          );
          aiBusy = true;
          try {
            return json(200, {
              project: store.aiFinish(
                job.p.id,
                job.m.id,
                job.fingerprint,
                await ai.review(job.m),
                job.p.revision,
                ai.model || "configured-model",
              ),
            });
          } finally {
            aiBusy = false;
          }
        }
        if (path === "/api/approve")
          return json(200, {
            project: store.approve(
              body.projectId,
              body.milestoneId,
              body,
              body.revision,
            ),
          });
        if (path === "/api/invoice/preview") {
          const payload = store.preview(
            body.projectId,
            body.milestoneId,
            paypal.merchantEmail,
          );
          return json(200, {
            payload,
            hash: hash(payload),
            configured: paypal.configured,
          });
        }
        if (path === "/api/invoice/create") {
          if (body.confirmDraft !== true)
            fail(400, "Confirm the sandbox draft before creating it.");
          const payload = store.preview(
            body.projectId,
            body.milestoneId,
            paypal.merchantEmail,
          );
          if (body.hash !== hash(payload))
            fail(409, "Preview the current invoice before creating it.");
          if (!paypal.configured)
            fail(
              503,
              "PayPal sandbox credentials are missing. The draft preview is available locally.",
            );
          await paypal.preflight();
          const { attempt, created } = store.reserve(
            body.projectId,
            body.milestoneId,
            body.hash,
            payload,
          );
          if (!created) return json(200, { attempt });
          pending.add(attempt.milestoneId);
          try {
            return json(201, { attempt: await completeAttempt(attempt) });
          } finally {
            pending.delete(attempt.milestoneId);
          }
        }
        if (path === "/api/invoice/retry") {
          if (body.confirmDraft !== true)
            fail(400, "Confirm the sandbox draft retry.");
          await paypal.preflight();
          const attempt = store.retry(body.milestoneId);
          pending.add(attempt.milestoneId);
          try {
            return json(200, { attempt: await completeAttempt(attempt) });
          } finally {
            pending.delete(attempt.milestoneId);
          }
        }
        if (path === "/api/invoice/reconcile") {
          const attempt = store.draft(body.milestoneId);
          if (!attempt) fail(404, "Invoice attempt not found.");
          if (pending.has(attempt.milestoneId))
            fail(409, "Creation is still running.");
          let invoice,
            expectedId = attempt.invoiceId;
          try {
            if (attempt.invoiceId)
              invoice = await paypal.get(attempt.invoiceId);
            else {
              const matches = await paypal.search(
                attempt.payload.detail.invoice_number,
              );
              if (matches.length !== 1)
                fail(
                  409,
                  matches.length
                    ? "Multiple matching invoices exist. Inspect the sandbox account."
                    : "No matching invoice is visible yet. This uncertain attempt remains locked to avoid a duplicate.",
                );
              expectedId = matches[0].id;
              invoice = await paypal.get(expectedId);
            }
            checkInvoice(invoice, attempt.payload, expectedId);
            return json(200, {
              attempt: store.attempted(attempt.milestoneId, "created", {
                invoiceId: invoice.id,
              }),
            });
          } catch (error) {
            store.attempted(attempt.milestoneId, "uncertain", {
              error: error.message,
            });
            throw error;
          }
        }
        fail(404, "Operation not found.");
      }
      if (req.method !== "GET") fail(405, "Method not allowed.");
      const asset = path === "/" ? "index.html" : path.slice(1);
      if (!assets.has(asset)) fail(404, "Page not found.");
      const data = await readFile(join(root, "web", asset));
      res.writeHead(200, {
        "Content-Type": {
          ".html": "text/html; charset=utf-8",
          ".mjs": "text/javascript; charset=utf-8",
          ".js": "text/javascript; charset=utf-8",
          ".css": "text/css; charset=utf-8",
          ".txt": "text/plain; charset=utf-8",
        }[extname(asset)],
      });
      res.end(data);
    } catch (error) {
      json(error.status || 500, {
        error: error.status
          ? error.message
          : "The operation did not complete. Your saved work remains available.",
      });
    }
  });
  server.requestTimeout = 150000;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return {
    url: "http://127.0.0.1:" + server.address().port,
    store,
    close: async () => {
      await new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      });
      store.close();
    },
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const app = await startServer({ port: Number(process.env.PORT || 4344) });
  console.log("Milestone Desk available at " + app.url);
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, async () => {
      await app.close();
      process.exit(0);
    });
}
