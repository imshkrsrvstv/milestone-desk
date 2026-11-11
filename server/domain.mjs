import { createHash, randomUUID } from "node:crypto";
export function fail(status, message) {
  const error = Error(message);
  error.status = status;
  throw error;
}
export const id = () => randomUUID();
export function text(value, label, min = 1, max = 400) {
  if (
    typeof value !== "string" ||
    value.trim().length < min ||
    value.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)
  )
    fail(400, `${label} must contain ${min}–${max} characters.`);
  return value.trim();
}
export function email(value) {
  const out = text(value, "Sandbox recipient email", 5, 254);
  if (
    !/^[a-zA-Z0-9.!#$%&'*+\-/=?^_`{|}~]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/.test(
      out,
    )
  )
    fail(400, "Enter a valid sandbox email address.");
  return out;
}
export function money(value) {
  if (
    typeof value !== "string" ||
    !/^(?:0|[1-9][0-9]{0,5})\.[0-9]{2}$/.test(value) ||
    Number(value) <= 0
  )
    fail(
      400,
      "Use a positive amount with two decimal places, below 1,000,000.",
    );
  return value;
}
export function milestone(input) {
  if (
    !input ||
    !Array.isArray(input.criteria) ||
    input.criteria.length < 1 ||
    input.criteria.length > 8
  )
    fail(400, "Add one to eight acceptance criteria.");
  return {
    id: id(),
    title: text(input.title, "Milestone name", 3, 100),
    amount: money(input.amount),
    criteria: input.criteria.map((c) => ({
      id: id(),
      text: text(c, "Acceptance criterion", 8, 600),
    })),
    evidence: text(input.evidence || "", "Evidence", 0, 14000),
    analysis: null,
    approval: null,
    revision: 0,
  };
}
export function project(input) {
  if (
    !input ||
    !Array.isArray(input.milestones) ||
    !input.milestones.length ||
    input.milestones.length > 12
  )
    fail(400, "Add one to twelve milestones.");
  const currency = input.currency || "USD";
  if (!["USD", "EUR", "GBP", "CAD", "AUD"].includes(currency))
    fail(400, "Choose a supported two-decimal currency.");
  return {
    id: id(),
    title: text(input.title, "Project name", 3, 100),
    client: text(input.client, "Client name", 2, 100),
    recipient: email(input.recipient),
    currency,
    milestones: input.milestones.map(milestone),
    createdAt: new Date().toISOString(),
    revision: 0,
  };
}
export function fingerprint(m) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        title: m.title,
        amount: m.amount,
        criteria: m.criteria,
        evidence: m.evidence,
      }),
    )
    .digest("hex");
}
export function localReview(m) {
  return {
    kind: "local",
    createdAt: new Date().toISOString(),
    fingerprint: fingerprint(m),
    summary:
      "Local review only. Supplied text is available for human inspection. No AI or independent completion verification has run.",
    criteria: m.criteria.map((c) => ({
      id: c.id,
      status: "unreviewed",
      quote: "",
      reason: m.evidence
        ? "Read the evidence and make your own acceptance decision."
        : "No evidence supplied yet.",
    })),
  };
}
export function validateAnalysis(m, raw, model = "configured-model") {
  if (
    !raw ||
    typeof raw.summary !== "string" ||
    raw.summary.length > 1600 ||
    !Array.isArray(raw.criteria) ||
    raw.criteria.length !== m.criteria.length
  )
    fail(
      502,
      "The AI reviewer returned an incomplete result. No acceptance decisions were changed.",
    );
  const ids = new Set();
  const criteria = raw.criteria.map((row) => {
    if (
      !m.criteria.some((c) => c.id === row.id) ||
      ids.has(row.id) ||
      !["supported", "partial", "missing"].includes(row.status)
    )
      fail(502, "The AI result did not match the acceptance criteria.");
    ids.add(row.id);
    const quote = text(row.quote, "AI evidence excerpt", 0, 900),
      reason = text(row.reason, "AI explanation", 5, 1200);
    const quoted = quote.length >= 8 && m.evidence.includes(quote);
    // A model suggestion can only claim support when its exact excerpt exists.
    return {
      id: row.id,
      status:
        row.status === "missing" ? "missing" : quoted ? row.status : "missing",
      quote: quoted ? quote : "",
      reason:
        row.status !== "missing" && !quoted
          ? "The suggested excerpt was absent from the supplied evidence. Treat this criterion as missing."
          : reason,
    };
  });
  return {
    kind: "ai",
    model,
    createdAt: new Date().toISOString(),
    fingerprint: fingerprint(m),
    summary: raw.summary.trim(),
    criteria,
  };
}
export function reviewApproval(m, input) {
  if (!m.evidence || !m.analysis || m.analysis.fingerprint !== fingerprint(m))
    fail(409, "Run an evidence review before approving this milestone.");
  if (
    input.attestation !== true ||
    !Array.isArray(input.decisions) ||
    input.decisions.length !== m.criteria.length
  )
    fail(400, "Review every acceptance criterion and confirm your decision.");
  const seen = new Set();
  const decisions = input.decisions.map((row) => {
    if (
      !m.criteria.some((c) => c.id === row.id) ||
      seen.has(row.id) ||
      !["accepted", "needs-work"].includes(row.decision)
    )
      fail(400, "Each criterion needs one acceptance decision.");
    seen.add(row.id);
    return {
      id: row.id,
      decision: row.decision,
      note: text(row.note, "Review note", 8, 1000),
    };
  });
  return {
    fingerprint: fingerprint(m),
    at: new Date().toISOString(),
    reviewer: text(input.reviewer, "Reviewer name", 2, 100),
    decisions,
    ready: decisions.every((d) => d.decision === "accepted"),
  };
}
export function invoicePayload(p, m, merchantEmail) {
  if (!m.approval?.ready || m.approval.fingerprint !== fingerprint(m))
    fail(409, "Approve every criterion before creating a draft invoice.");
  return {
    detail: {
      invoice_number:
        "MD-" +
        createHash("sha256")
          .update(p.id + ":" + m.id)
          .digest("hex")
          .slice(0, 20),
      reference: m.id,
      currency_code: p.currency,
      note: "Sandbox draft for a human-reviewed milestone. No payment is requested by Milestone Desk.",
      memo: "Review " + m.approval.at + " • " + m.approval.reviewer,
      payment_term: { term_type: "DUE_ON_RECEIPT" },
    },
    ...(merchantEmail
      ? { invoicer: { email_address: email(merchantEmail) } }
      : {}),
    primary_recipients: [{ billing_info: { email_address: p.recipient } }],
    items: [
      {
        name: m.title,
        description: p.title,
        quantity: "1",
        unit_amount: { currency_code: p.currency, value: m.amount },
      },
    ],
    configuration: {
      partial_payment: { allow_partial_payment: false },
      allow_tip: false,
    },
  };
}
export function sampleProject() {
  return project({
    title: "Northstar Studio website",
    client: "Northstar Studio · fictional",
    recipient: "sandbox-buyer@example.com",
    currency: "USD",
    milestones: [
      {
        title: "Accessible landing page",
        amount: "450.00",
        criteria: [
          "The landing page works at 390px and 1440px without horizontal scrolling.",
          "All interactive controls can be reached and used with a keyboard.",
          "The primary contact form displays an error when the email is invalid.",
        ],
        evidence:
          'Delivery log · fictional sample\nViewport checks at 390px and 1440px passed with no horizontal scrolling.\nKeyboard test: navigation, accordion, contact form and submit button can be reached and activated using Tab, Enter and Space.\nContact form: email value "invalid" displayed "Enter a valid email address" and blocked submission.\nThese are supplied demonstration claims, not independent test results.',
      },
      {
        title: "Content migration",
        amount: "300.00",
        criteria: [
          "All twelve case studies retain their original headings and image descriptions.",
          "The old case-study URLs redirect to the matching new page.",
        ],
        evidence:
          "Delivery log · fictional sample\nEight of twelve case studies have been copied. Image descriptions are still being reviewed. Redirects have not been configured.",
      },
      {
        title: "Launch handover",
        amount: "250.00",
        criteria: [
          "The owner receives a deployment guide and recovery steps.",
          "A restore from the latest backup is demonstrated.",
        ],
        evidence: "",
      },
    ],
  });
}
