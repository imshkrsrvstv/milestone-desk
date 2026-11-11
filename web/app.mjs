const $ = (s) => document.querySelector(s),
  esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
let state,
  projectId,
  milestoneId,
  grid,
  busy = false,
  returnFocus,
  returnFocusId;
const money = (value, currency = "USD") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).format(
    Number(value),
  );
const current = () =>
  state.projects.find((p) => p.id === projectId) || state.projects[0];
const selected = () =>
  current()?.milestones.find((m) => m.id === milestoneId) ||
  current()?.milestones[0];
const attempt = (m) => state.attempts.find((a) => a.milestoneId === m.id);
const label = (m) =>
  attempt(m)?.status === "created"
    ? "Draft created"
    : attempt(m)
      ? "Invoice pending"
      : m.approval?.ready
        ? "Ready to invoice"
        : m.approval
          ? "Needs work"
          : m.analysis
            ? "Needs your review"
            : "Evidence to review";
const fmt = (d) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(d));
function notice(text) {
  $("#notice").textContent = text;
  $("#notice").classList.add("shown");
  clearTimeout(notice.timer);
  notice.timer = setTimeout(() => $("#notice").classList.remove("shown"), 6000);
}
async function api(path, body) {
  const response = await fetch("./api/" + path, {
    cache: "no-store",
    ...(body
      ? {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Milestone-Token": state.csrf,
          },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await response.json();
  if (!response.ok)
    throw Error(data.error || "The request could not be completed.");
  return data;
}
function dialog(title, html, setup) {
  returnFocus = document.activeElement;
  returnFocusId = returnFocus?.id;
  $("#dialog-content").innerHTML =
    `<header class="dialog-head"><h2 id="dialog-title">${esc(title)}</h2><button class="close" aria-label="Close dialog">×</button></header><div class="dialog-body">${html}</div>`;
  $("#dialog .close").onclick = () => $("#dialog").close();
  $("#dialog").showModal();
  setup?.($("#dialog"));
}
$("#dialog").addEventListener("close", () => {
  if (returnFocus?.isConnected) returnFocus.focus();
  else if (returnFocusId) {
    const replacement =
      document.getElementById(returnFocusId) ||
      document.getElementById("reconcile") ||
      document.getElementById("main");
    replacement?.focus();
  }
});
async function refresh() {
  state = await api("state");
  projectId = current().id;
  milestoneId = selected().id;
  draw({ preserveScroll: true });
}
async function act(path, body, message) {
  if (busy) return;
  busy = true;
  try {
    const data = await api(path, body);
    await refresh();
    if (message) notice(message);
    return data;
  } catch (error) {
    notice(error.message);
    throw error;
  } finally {
    busy = false;
  }
}
const actionBody = () => ({
  projectId: current().id,
  milestoneId: selected().id,
  revision: current().revision,
});
function gridTheme() {
  const css = getComputedStyle(document.documentElement);
  const token = (name) => css.getPropertyValue(name).trim();
  return agGrid.themeQuartz.withParams({
    backgroundColor: token("--surface"),
    foregroundColor: token("--ink"),
    headerBackgroundColor: token("--surface-soft"),
    headerTextColor: token("--muted"),
    borderColor: token("--line"),
    rowBorder: { color: token("--line-soft") },
    fontFamily: '"Avenir Next", "Trebuchet MS", system-ui, sans-serif',
    fontSize: 13,
    headerFontSize: 12,
    rowHoverColor: token("--hover"),
    selectedRowBackgroundColor: token("--accent-soft"),
    accentColor: token("--accent"),
    wrapperBorder: false,
    borderRadius: 0,
    browserColorScheme: window.MilestoneTheme.get(),
  });
}
function syncTheme() {
  const dark = window.MilestoneTheme.get() === "dark";
  $("#theme-toggle").setAttribute("aria-pressed", String(dark));
  $("#theme-label").textContent = dark ? "Dark theme" : "Light theme";
  if (grid) grid.setGridOption("theme", gridTheme());
}
$("#theme-toggle").onclick = () => window.MilestoneTheme.toggle();
addEventListener("milestone-theme", syncTheme);
syncTheme();
function provenance(m, a) {
  const evidence = m.evidence.trim().length > 0;
  const reviewed = Boolean(m.analysis);
  const accepted = Boolean(m.approval?.ready);
  const created = a?.status === "created";
  return `<ol class="provenance" aria-label="Milestone progress">
    <li class="${evidence ? "complete" : ""}"><span aria-hidden="true">1</span><div><strong>Delivery evidence</strong><small>${evidence ? (reviewed ? "Source saved and reviewed" : "Source ready for review") : "Add your delivery record"}</small></div></li>
    <li class="${accepted ? "complete" : ""}"><span aria-hidden="true">2</span><div><strong>Human acceptance</strong><small>${accepted ? "Every criterion accepted" : m.approval ? "More work requested" : reviewed ? "Your decision is needed" : "Waiting for evidence review"}</small></div></li>
    <li class="${created ? "complete" : ""}"><span aria-hidden="true">3</span><div><strong>Invoice draft</strong><small>${created ? "Verified in sandbox · unsent" : a ? "Reconciliation required" : accepted ? "Ready for your preview" : "Locked until acceptance"}</small></div></li>
  </ol>`;
}
function draw({ preserveScroll = false } = {}) {
  const scrollPosition = preserveScroll ? window.scrollY : 0;
  for (const id of ["#projects", "#new-project", "#connection"])
    $(id).disabled = false;
  const p = current(),
    m = selected();
  $("#projects").innerHTML = state.projects
    .map(
      (p) =>
        `<option value="${esc(p.id)}" ${p.id === projectId ? "selected" : ""}>${esc(p.title)}</option>`,
    )
    .join("");
  const total = p.milestones.reduce((n, m) => n + Number(m.amount), 0),
    accepted = p.milestones
      .filter((m) => m.approval?.ready)
      .reduce((n, m) => n + Number(m.amount), 0),
    drafts = p.milestones.filter(
      (m) => attempt(m)?.status === "created",
    ).length;
  $("#view").innerHTML =
    `<section class="page-heading"><div><p class="eyebrow">Project dossier</p><h1>${esc(p.title)}</h1><p>${esc(p.client)} <span class="heading-sep">·</span> ${p.milestones.length} deliverables, one clear record.</p></div><button class="outline" id="add-milestone">＋ Add milestone</button></section>
 <div class="metrics"><article><span>Project value</span><strong>${money(total, p.currency)}</strong><small>Across ${p.milestones.length} milestones</small></article><article><span>Human accepted</span><strong>${money(accepted, p.currency)}</strong><small>Acceptance stays in your hands</small></article><article><span>Sandbox drafts</span><strong>${drafts.toString().padStart(2, "0")}<i> / ${p.milestones.length}</i></strong><small>Prepared, never sent</small></article></div>
 <section class="milestone-table"><header><div><h2>Deliverables</h2><p>Select a milestone to follow the evidence.</p></div><label class="search-label"><span aria-hidden="true">⌕</span><input id="grid-search" type="search" placeholder="Find a milestone" aria-label="Find a milestone"></label></header><div id="milestone-grid" aria-label="Milestone comparison"></div></section>
 <section id="review-workspace"></section>
 <details class="activity"><summary>Activity journal <span>${state.events.filter((e) => e.projectId === p.id).length} recorded updates</span></summary><ol>${state.events
   .filter((e) => e.projectId === p.id)
   .map((e) => `<li><time>${fmt(e.at)}</time><p>${esc(e.message)}</p></li>`)
   .join("")}</ol></details>`;
  grid?.destroy();
  const theme = gridTheme();
  grid = agGrid.createGrid($("#milestone-grid"), {
    theme,
    loadThemeGoogleFonts: false,
    rowData: p.milestones.map((m, i) => ({
      ...m,
      number: String(i + 1).padStart(2, "0"),
      status: label(m),
      evidenceCount:
        m.analysis?.criteria.filter((c) =>
          ["supported", "partial"].includes(c.status),
        ).length || 0,
    })),
    columnDefs: [
      { field: "number", headerName: "", width: 55, sortable: false },
      { field: "title", headerName: "Milestone", flex: 2, minWidth: 200 },
      {
        field: "amount",
        headerName: "Amount",
        width: 125,
        valueFormatter: (params) => money(params.value, p.currency),
        comparator: (a, b) => Number(a) - Number(b),
      },
      {
        field: "status",
        headerName: "Review status",
        width: 180,
        cellRenderer: (params) => {
          const span = document.createElement("span");
          span.className =
            "grid-status " +
            (params.value === "Ready to invoice" ||
            params.value === "Draft created"
              ? "good"
              : "");
          span.textContent = params.value;
          return span;
        },
      },
      {
        field: "evidenceCount",
        headerName: "AI excerpts",
        width: 125,
        valueFormatter: (params) =>
          params.data.analysis?.kind === "ai"
            ? params.value + " / " + params.data.criteria.length
            : "Not reviewed",
      },
    ],
    defaultColDef: { sortable: true, resizable: true },
    rowHeight: 58,
    headerHeight: 39,
    domLayout: "autoHeight",
    animateRows: false,
    rowSelection: {
      mode: "singleRow",
      checkboxes: false,
      enableClickSelection: true,
    },
    getRowId: (params) => params.data.id,
    onSelectionChanged: (event) => {
      const row = event.api.getSelectedRows()[0];
      if (row && row.id !== milestoneId) {
        milestoneId = row.id;
        drawReview();
      }
    },
    onGridReady: (event) =>
      event.api.forEachNode((node) => node.setSelected(node.id === m.id)),
  });
  $("#grid-search").oninput = (event) =>
    grid.setGridOption("quickFilterText", event.target.value);
  $("#add-milestone").onclick = () => projectForm(true);
  drawReview();
  window.scrollTo({ top: scrollPosition, behavior: "instant" });
}
function drawReview() {
  const p = current(),
    m = selected(),
    a = attempt(m),
    analysis = m.analysis;
  $("#review-workspace").innerHTML =
    `<div class="review-title"><div><p class="eyebrow">Milestone ${p.milestones.indexOf(m) + 1} / ${p.milestones.length}</p><h2>${esc(m.title)}</h2></div><strong>${money(m.amount, p.currency)}</strong></div>
 ${provenance(m, a)}<div class="review-columns"><section class="panel evidence-panel" id="delivery-record"><header><span class="step">01</span><div><h3>The delivery record</h3><p>What was promised. What was provided.</p></div></header><div class="panel-body"><h4>Acceptance criteria</h4><ol class="criteria">${m.criteria.map((c) => `<li>${esc(c.text)}</li>`).join("")}</ol><label class="field-label" for="evidence">Delivery evidence <small>Paste a test log, delivery note or handover text.</small></label><textarea id="evidence" rows="9" maxlength="14000" ${a ? "readonly" : ""}>${esc(m.evidence)}</textarea><div class="evidence-tools"><span id="evidence-count">${m.evidence.length.toLocaleString()} / 14,000</span><button class="text-button" id="save-evidence" ${a ? "disabled" : ""}>Save evidence</button></div><div class="review-buttons"><button class="primary" id="ai-review" ${!state.settings.ai || a ? "disabled" : ""}>Review with AI</button><button class="outline" id="local-review" ${a ? "disabled" : ""}>Review myself</button></div><p class="fine-print">AI checks the supplied text for support and gaps. It does not run your tests or decide whether work is accepted.${!state.settings.ai ? " AI connection is currently unavailable." : ""}</p></div></section>
 <section class="panel analysis-panel" id="acceptance-record"><header><span class="step">02</span><div><h3>From evidence to acceptance</h3><p>Your judgment is the final checkpoint.</p></div></header><div class="panel-body">${
   analysis
     ? `<div class="analysis-summary"><span class="tag">${analysis.kind === "ai" ? "AI suggestions" : "Personal review"}</span><p>${esc(analysis.summary)}</p></div><div class="evidence-matches">${m.criteria
         .map((c) => {
           const match = analysis.criteria.find((x) => x.id === c.id);
           return `<article><div><span class="evidence-status ${match.status === "supported" ? "supported" : match.status === "partial" ? "partial" : ""}">${esc({ supported: "Text supports", partial: "Partial evidence", missing: "Evidence missing", unreviewed: "Your review needed" }[match.status])}</span><span class="criterion-number">${m.criteria.indexOf(c) + 1}</span></div><h4>${esc(c.text)}</h4>${match.quote ? `<blockquote>${esc(match.quote)}</blockquote>` : ""}<p>${esc(match.reason)}</p></article>`;
         })
         .join(
           "",
         )}</div>${m.approval ? `<div class="approval-record ${m.approval.ready ? "approved" : ""}"><strong>${m.approval.ready ? "Accepted by " + esc(m.approval.reviewer) : "More work requested"}</strong><p>${fmt(m.approval.at)}</p>${m.approval.decisions.map((d, i) => `<p><b>${i + 1}.</b> ${esc(d.note)}</p>`).join("")}</div>` : ""}<button class="primary wide" id="human-review" ${a ? "disabled" : ""}>${m.approval ? "Revise human review" : "Review each criterion"}</button>`
     : `<div class="analysis-empty"><div class="evidence-art" aria-hidden="true"><span>?</span><i></i><i></i><i></i></div><h4>Review this delivery.</h4><p>Save the delivery record, then run AI review or inspect it yourself. Each acceptance decision remains yours.</p><span class="empty-note">No review has run yet</span></div>`
 }</div></section></div>
 <section class="invoice-panel" id="invoice-record"><span class="step">03</span><div><h3>${a?.status === "created" ? "Your sandbox draft is ready." : "A deliberate step to an invoice."}</h3><p>${a ? `${esc(a.invoiceId || "Awaiting confirmed invoice ID")} · ${esc(a.status)}${a.error ? "<br>" + esc(a.error) : ""}` : m.approval?.ready ? "Every criterion is accepted. Inspect the exact recipient and amount before creating the draft." : "Accept every criterion to unlock a PayPal sandbox draft. No invoice is sent by this app."}</p></div>${a ? `<button class="outline" id="reconcile">Check sandbox state</button>${a.status === "rejected" ? '<button class="primary" id="retry-invoice">Retry same draft</button>' : ""}` : `<button class="primary" id="invoice-preview" ${!m.approval?.ready ? "disabled" : ""}>Preview draft</button>`}</section>`;
  $("#evidence").oninput = (event) =>
    ($("#evidence-count").textContent =
      event.target.value.length.toLocaleString() + " / 14,000");
  $("#save-evidence").onclick = () =>
    act(
      "evidence",
      { ...actionBody(), evidence: $("#evidence").value },
      "Evidence saved. Earlier review decisions were cleared.",
    ).catch(() => {});
  async function runReview(kind) {
    if (busy) return;
    const value = $("#evidence").value;
    if (value !== selected().evidence) {
      try {
        await act("evidence", { ...actionBody(), evidence: value });
      } catch {
        return;
      }
    }
    busy = true;
    $("#job").hidden = false;
    $("#job").textContent =
      kind === "ai"
        ? "✧ Reading the evidence with AI. This can take up to two minutes."
        : "Opening your evidence review…";
    for (const button of $("#review-workspace").querySelectorAll("button"))
      button.disabled = true;
    try {
      await api("review/" + kind, actionBody());
      await refresh();
      notice(
        kind === "ai"
          ? "AI suggestions are ready. Review the excerpts and make your decision."
          : "Evidence is ready for your review.",
      );
    } catch (error) {
      notice(error.message);
      await refresh();
    } finally {
      busy = false;
      $("#job").hidden = true;
    }
  }
  $("#ai-review").onclick = () => runReview("ai");
  $("#local-review").onclick = () => runReview("local");
  if ($("#human-review")) $("#human-review").onclick = humanReview;
  if ($("#invoice-preview")) $("#invoice-preview").onclick = invoicePreview;
  if ($("#reconcile"))
    $("#reconcile").onclick = () =>
      act(
        "invoice/reconcile",
        { milestoneId: m.id },
        "Sandbox invoice state checked.",
      ).catch(() => {});
  if ($("#retry-invoice"))
    $("#retry-invoice").onclick = () => {
      dialog(
        "Retry the same sandbox draft",
        `<p>This retries only the exact invoice payload that PayPal previously rejected. It cannot send the invoice.</p><button class="primary" id="retry-confirm">Retry sandbox draft</button>`,
        (el) => {
          el.querySelector("#retry-confirm").onclick = async () => {
            try {
              await act(
                "invoice/retry",
                { milestoneId: m.id, confirmDraft: true },
                "Sandbox draft created.",
              );
              el.close();
            } catch {}
          };
        },
      );
    };
}
function humanReview() {
  const m = selected();
  dialog(
    "Your acceptance review",
    `<p class="modal-intro">Accept a criterion only after checking its delivery evidence. AI suggestions are an aid to your decision.</p><form id="acceptance"><label>Reviewer name<input name="reviewer" required minlength="2" maxlength="100" value="${esc(m.approval?.reviewer || "")}"></label>${m.criteria
      .map((c, i) => {
        const existing = m.approval?.decisions.find((d) => d.id === c.id);
        return `<fieldset><legend>${i + 1}. ${esc(c.text)}</legend><label>Decision<select name="decision-${c.id}" aria-label="Decision for criterion ${i + 1}" required><option value="">Choose a decision</option><option value="accepted" ${existing?.decision === "accepted" ? "selected" : ""}>Accept delivery</option><option value="needs-work" ${existing?.decision === "needs-work" ? "selected" : ""}>Needs more work</option></select></label><label>Your evidence or reason<textarea name="note-${c.id}" required minlength="8" maxlength="1000" rows="2">${esc(existing?.note || "")}</textarea></label></fieldset>`;
      })
      .join(
        "",
      )}<label class="check"><input type="checkbox" name="attestation" required><span>I reviewed the evidence and take responsibility for these acceptance decisions.</span></label><p id="form-error" class="form-error" role="alert"></p><button class="primary wide" type="submit">Save acceptance review</button></form>`,
    (el) => {
      el.querySelector("form").onsubmit = async (event) => {
        event.preventDefault();
        const data = new FormData(event.target);
        try {
          await act(
            "approve",
            {
              ...actionBody(),
              reviewer: data.get("reviewer"),
              attestation: data.get("attestation") === "on",
              decisions: m.criteria.map((c) => ({
                id: c.id,
                decision: data.get("decision-" + c.id),
                note: data.get("note-" + c.id),
              })),
            },
            "Your acceptance review was saved.",
          );
          el.close();
        } catch (error) {
          el.querySelector("#form-error").textContent = error.message;
        }
      };
    },
  );
}
async function invoicePreview() {
  try {
    const preview = await api("invoice/preview", actionBody()),
      payload = preview.payload;
    dialog(
      "Review your sandbox draft",
      `<p class="modal-intro">This creates an unsent draft in your PayPal sandbox. It does not email the client or request a payment.</p><div class="invoice-sheet"><p class="eyebrow">Draft invoice</p><h3>${esc(selected().title)}</h3><dl><div><dt>Recipient</dt><dd>${esc(current().recipient)}</dd></div><div><dt>Milestone</dt><dd>${esc(current().title)}</dd></div><div><dt>Invoice number</dt><dd>${esc(payload.detail.invoice_number)}</dd></div><div class="invoice-total"><dt>Total</dt><dd>${money(selected().amount, current().currency)}</dd></div></dl></div><details class="payload"><summary>Inspect the exact PayPal request</summary><pre>${esc(JSON.stringify(payload, null, 2))}</pre></details>${!preview.configured ? '<div class="setup-note"><strong>Connect a PayPal sandbox first.</strong><p>Your local preview is ready. Add PAYPAL_SANDBOX_CLIENT_ID and PAYPAL_SANDBOX_CLIENT_SECRET to the server environment, then restart the app. No credentials are entered into this page.</p></div>' : ""}<form id="create-invoice"><label class="check"><input type="checkbox" required ${!preview.configured ? "disabled" : ""}><span>I checked the sandbox recipient, amount and accepted milestone.</span></label><p class="form-error" id="invoice-error" role="alert"></p><button class="primary wide" ${!preview.configured ? "disabled" : ""}>Create PayPal sandbox draft</button></form>`,
      (el) => {
        el.querySelector("form").onsubmit = async (event) => {
          event.preventDefault();
          const button = event.target.querySelector("button");
          button.disabled = true;
          try {
            await act(
              "invoice/create",
              { ...actionBody(), hash: preview.hash, confirmDraft: true },
              "PayPal sandbox draft confirmed. Nothing was sent.",
            );
            el.close();
          } catch (error) {
            el.querySelector("#invoice-error").textContent = error.message;
          } finally {
            button.disabled = false;
          }
        };
      },
    );
  } catch (error) {
    notice(error.message);
  }
}
function projectForm(adding = false) {
  dialog(
    adding ? "Add a milestone" : "Start a project",
    `<form id="project-form">${adding ? "" : `<label>Project name<input name="title" required minlength="3" maxlength="100" placeholder="Website redesign"></label><div class="form-row"><label>Client name<input name="client" required minlength="2" maxlength="100" placeholder="Acme Studio"></label><label>Currency<select name="currency">${["USD", "EUR", "GBP", "CAD", "AUD"].map((c) => `<option>${c}</option>`).join("")}</select></label></div><label>Sandbox recipient email<input type="email" name="recipient" required maxlength="254" placeholder="your-sandbox-buyer@example.com"></label>`}<fieldset><legend>${adding ? "New milestone" : "First milestone"}</legend><div class="form-row"><label>Milestone name<input name="milestone" required minlength="3" maxlength="100" placeholder="Accessible landing page"></label><label>Amount<input name="amount" inputmode="decimal" required pattern="[0-9]+\.[0-9]{2}" placeholder="450.00"></label></div><label>Acceptance criteria <small>One per line, up to eight.</small><textarea name="criteria" required rows="4" placeholder="The contact form prevents invalid email submissions."></textarea></label><label>Delivery evidence <small>You can add this later.</small><textarea name="evidence" rows="3" maxlength="14000"></textarea></label></fieldset><p id="project-error" class="form-error" role="alert"></p><button class="primary wide">${adding ? "Add milestone" : "Create project"}</button></form>`,
    (el) => {
      el.querySelector("form").onsubmit = async (event) => {
        event.preventDefault();
        const f = new FormData(event.target),
          milestone = {
            title: f.get("milestone"),
            amount: f.get("amount"),
            criteria: String(f.get("criteria"))
              .split("\n")
              .map((x) => x.trim())
              .filter(Boolean),
            evidence: f.get("evidence"),
          };
        try {
          const result = await act(
            adding ? "milestones" : "projects",
            adding
              ? {
                  projectId: current().id,
                  revision: current().revision,
                  milestone,
                }
              : {
                  title: f.get("title"),
                  client: f.get("client"),
                  recipient: f.get("recipient"),
                  currency: f.get("currency"),
                  milestones: [milestone],
                },
          );
          projectId = result.project.id;
          milestoneId = adding
            ? result.project.milestones.at(-1).id
            : result.project.milestones[0].id;
          draw();
          el.close();
          notice(adding ? "Milestone added." : "Your project is ready.");
        } catch (error) {
          el.querySelector("#project-error").textContent = error.message;
        }
      };
    },
  );
}
$("#new-project").onclick = () => projectForm();
$("#projects").onchange = (event) => {
  projectId = event.target.value;
  milestoneId = current().milestones[0].id;
  draw();
};
$("#connection").onclick = () =>
  dialog(
    "Workspace connections",
    `<div class="connection-row"><strong>PayPal sandbox</strong><span class="tag">${state.settings.paypal ? "Configured" : "Setup needed"}</span></div><p>Milestone Desk only creates and reads draft invoices against the PayPal sandbox host. A successful sandbox receipt is needed to verify the connection.</p><div class="connection-row"><strong>AI evidence reviewer</strong><span class="tag">${state.settings.ai ? "Available" : "Unavailable"}</span></div><p>The configured AI provider runs a bounded evidence review. It receives only the selected milestone’s title, criteria and supplied evidence. It cannot run tools or create invoices. Eight reviews per day, one at a time.</p><p>Server environment variables and setup instructions are documented in the project README. Do not paste credentials into project evidence.</p><div class="appearance-setting"><strong>Appearance</strong><p>Your choice is saved on this device.</p><button class="outline" id="system-theme">Use system appearance</button></div>`,
    (el) => {
      el.querySelector("#system-theme").onclick = () => {
        window.MilestoneTheme.set(null);
        notice("Appearance now follows your device.");
      };
    },
  );
refresh().catch((error) => {
  $("#view").innerHTML =
    `<section class="error-state"><h1>We couldn’t open your desk.</h1><p>${esc(error.message)}</p><button class="primary" id="reload">Try again</button></section>`;
  $("#reload").onclick = () => location.reload();
});
