import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  email,
  fail,
  fingerprint,
  invoicePayload,
  localReview,
  milestone,
  project,
  reviewApproval,
  sampleProject,
  text,
  validateAnalysis,
} from "./domain.mjs";
export function createStore(dataDir) {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(join(dataDir, "milestones.sqlite"));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS attempts(milestone_id TEXT PRIMARY KEY,project_id TEXT NOT NULL,payload TEXT NOT NULL,invoice_id TEXT,status TEXT NOT NULL,error TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,project_id TEXT,at TEXT NOT NULL,kind TEXT NOT NULL,message TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS ai_calls(at INTEGER NOT NULL);`);
  db.prepare(
    "UPDATE attempts SET status='uncertain',error='The app restarted before the attempt was confirmed. Reconcile before continuing.' WHERE status='creating'",
  ).run();
  function event(projectId, kind, message) {
    db.prepare(
      "INSERT INTO events(project_id,at,kind,message) VALUES(?,?,?,?)",
    ).run(projectId, new Date().toISOString(), kind, message);
  }
  function get(id) {
    const row = db.prepare("SELECT payload FROM projects WHERE id=?").get(id);
    if (!row) fail(404, "Project not found.");
    return JSON.parse(row.payload);
  }
  function draft(mid) {
    const row = db
      .prepare("SELECT * FROM attempts WHERE milestone_id=?")
      .get(mid);
    return row
      ? {
          milestoneId: row.milestone_id,
          projectId: row.project_id,
          payload: JSON.parse(row.payload),
          invoiceId: row.invoice_id,
          status: row.status,
          error: row.error,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }
      : null;
  }
  function context(pid, mid, revision) {
    const p = get(pid),
      m = p.milestones.find((m) => m.id === mid);
    if (!m) fail(404, "Milestone not found.");
    if (revision !== undefined && p.revision !== revision)
      fail(409, "This project changed. Refresh before saving your review.");
    return { p, m };
  }
  function save(p) {
    p.revision++;
    db.prepare("UPDATE projects SET payload=? WHERE id=?").run(
      JSON.stringify(p),
      p.id,
    );
    return p;
  }
  function mutable(mid) {
    if (draft(mid))
      fail(
        409,
        "This milestone has an invoice attempt. Its reviewed scope is locked.",
      );
  }
  function add(p) {
    db.prepare("INSERT INTO projects(id,payload) VALUES(?,?)").run(
      p.id,
      JSON.stringify(p),
    );
    event(
      p.id,
      "created",
      "Project created with " + p.milestones.length + " milestones.",
    );
    return p;
  }
  if (!db.prepare("SELECT id FROM projects LIMIT 1").get())
    add(sampleProject());
  return {
    close: () => db.close(),
    get,
    context,
    draft,
    snapshot() {
      return {
        projects: db
          .prepare("SELECT payload FROM projects ORDER BY rowid DESC")
          .all()
          .map((row) => JSON.parse(row.payload)),
        attempts: db
          .prepare("SELECT milestone_id FROM attempts")
          .all()
          .map((row) => draft(row.milestone_id)),
        events: db
          .prepare(
            "SELECT project_id AS projectId,at,kind,message FROM events ORDER BY id DESC LIMIT 80",
          )
          .all(),
      };
    },
    create: (input) => add(project(input)),
    addMilestone(pid, input, revision) {
      const p = get(pid);
      if (p.revision !== revision)
        fail(409, "This project changed. Refresh before adding a milestone.");
      if (p.milestones.length >= 12)
        fail(400, "A project can contain at most twelve milestones.");
      p.milestones.push(milestone(input));
      save(p);
      event(pid, "milestone", "A milestone was added.");
      return p;
    },
    evidence(pid, mid, evidence, revision) {
      const { p, m } = context(pid, mid, revision);
      mutable(mid);
      m.evidence = text(evidence, "Evidence", 0, 14000);
      m.analysis = null;
      m.approval = null;
      m.revision++;
      save(p);
      event(
        pid,
        "evidence",
        "Evidence updated for " +
          m.title +
          ". Previous review and acceptance cleared.",
      );
      return p;
    },
    local(pid, mid, revision) {
      const { p, m } = context(pid, mid, revision);
      mutable(mid);
      if (!m.evidence) fail(400, "Add delivery evidence before reviewing.");
      m.analysis = localReview(m);
      m.approval = null;
      save(p);
      event(pid, "review", "Local evidence review opened for " + m.title + ".");
      return p;
    },
    aiStart(pid, mid, revision) {
      const { p, m } = context(pid, mid, revision);
      mutable(mid);
      if (!m.evidence) fail(400, "Add delivery evidence before reviewing.");
      if (
        db
          .prepare("SELECT count(*) AS n FROM ai_calls WHERE at>?")
          .get(Date.now() - 86400000).n >= 8
      )
        fail(
          429,
          "The eight-review daily AI budget is used. Local review remains available.",
        );
      db.prepare("INSERT INTO ai_calls(at) VALUES(?)").run(Date.now());
      return { p, m, fingerprint: fingerprint(m) };
    },
    aiFinish(pid, mid, expected, raw, revision, model = "configured-model") {
      const { p, m } = context(pid, mid, revision);
      mutable(mid);
      if (fingerprint(m) !== expected)
        fail(
          409,
          "Evidence changed during AI review. Review the saved evidence again.",
        );
      m.analysis = validateAnalysis(m, raw, model);
      m.approval = null;
      save(p);
      event(
        pid,
        "ai",
        "AI evidence suggestions prepared for " +
          m.title +
          ". Human decisions are still required.",
      );
      return p;
    },
    approve(pid, mid, input, revision) {
      const { p, m } = context(pid, mid, revision);
      mutable(mid);
      m.approval = reviewApproval(m, input);
      save(p);
      event(
        pid,
        "acceptance",
        m.title +
          (m.approval.ready
            ? " accepted by the reviewer."
            : " marked as needing more work."),
      );
      return p;
    },
    preview(pid, mid, merchant) {
      const { p, m } = context(pid, mid);
      return invoicePayload(p, m, merchant);
    },
    reserve(pid, mid, expectedHash, payload) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const { p, m } = context(pid, mid);
        const current = invoicePayload(p, m, payload.invoicer?.email_address);
        if (
          createHash("sha256").update(JSON.stringify(current)).digest("hex") !==
          expectedHash
        )
          fail(409, "The approved invoice changed. Preview it again.");
        const existing = draft(mid);
        if (existing) {
          db.exec("COMMIT");
          return { attempt: existing, created: false };
        }
        const now = new Date().toISOString();
        db.prepare(
          "INSERT INTO attempts(milestone_id,project_id,payload,status,created_at,updated_at) VALUES(?,?,?,'creating',?,?)",
        ).run(mid, pid, JSON.stringify(payload), now, now);
        event(
          pid,
          "invoice",
          "Sandbox draft creation requested for " + m.title + ".",
        );
        db.exec("COMMIT");
        return { attempt: draft(mid), created: true };
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    attempted(mid, status, { invoiceId, error = "" } = {}) {
      const existing = draft(mid);
      if (!existing) fail(404, "Invoice attempt not found.");
      db.prepare(
        "UPDATE attempts SET status=?,invoice_id=?,error=?,updated_at=? WHERE milestone_id=?",
      ).run(
        status,
        invoiceId || existing.invoiceId || null,
        error,
        new Date().toISOString(),
        mid,
      );
      event(
        existing.projectId,
        "invoice",
        status === "created"
          ? "PayPal sandbox confirmed a draft invoice."
          : error || "Invoice attempt updated.",
      );
      return draft(mid);
    },
    retry(mid) {
      const existing = draft(mid);
      if (existing?.status !== "rejected")
        fail(
          409,
          "Only a definitely rejected request can be retried. Reconcile uncertain attempts.",
        );
      const row = db
        .prepare(
          "UPDATE attempts SET status='creating',error='',updated_at=? WHERE milestone_id=? AND status='rejected'",
        )
        .run(new Date().toISOString(), mid);
      if (!row.changes) fail(409, "This retry was already started.");
      return draft(mid);
    },
  };
}
