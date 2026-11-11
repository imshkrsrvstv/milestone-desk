# Milestone Desk — submission package

## Short description

Milestone Desk connects promised work to a draft invoice through evidence. An AI reviewer maps delivery notes to acceptance criteria using exact source excerpts. A human accepts or rejects each criterion before the app creates an unsent PayPal sandbox invoice for the approved amount.

## Inspiration

Freelancers often have project boards on one side and invoices on the other. The important decision sits in between. What evidence shows that a particular milestone is ready to bill? Milestone Desk makes that decision readable and auditable.

## What it does

A genuine AG Grid Community table lets the owner compare milestones, fees, review status, and AI evidence coverage. Each selected milestone opens a focused review surface. AI identifies direct support, partial evidence, and gaps. Every excerpt is checked against the original text. The human records an acceptance decision and reason for every criterion.

Only accepted milestones unlock a PayPal sandbox invoice preview. The server validates the exact request again before creating an unsent draft. A durable attempt record prevents duplicate clicks from creating duplicate invoices. Ambiguous responses require reconciliation.

## How it was built

Original vanilla JavaScript interface, pinned AG Grid Community 36.3.0, Node.js HTTP server, SQLite persistence, a provider-neutral structured AI reviewer, and PayPal’s actual sandbox Invoicing v2 REST API. The AI receives only the selected evidence and has no tools. The application’s PayPal host is fixed to the sandbox.

## What was verified

- Real AI call with exact evidence mappings on explicitly fictional delivery notes.
- Real sandbox draft creation and retrieval.
- Reconciliation and repeated-create deduplication.
- Concurrent-request and uncertain-network tests.
- Human acceptance and changed-evidence invalidation.
- Responsive browser journey, keyboard-accessible forms, and automated accessibility checks.

## Submission checklist

- [x] Working local application and complete setup guide.
- [x] Meaningful AI workflow, tested with the actual provider.
- [x] Meaningful PayPal sandbox integration, tested against the actual API.
- [x] Genuine AG Grid Community milestone comparison.
- [x] Original source and MIT license, with third-party notices.
- [x] Publish the [public source repository](https://github.com/imshkrsrvstv/milestone-desk).
- [x] Provide a [confirmed free local test setup](../README.md#run), including the verified local AI option.
- [x] Record a working demo video under three minutes (`artifacts/demo.mp4`).
- [x] Publish the [working demo on YouTube](https://youtu.be/eSDjjLaUI2M).
- [x] Review eligibility, AI-assistance disclosures and third-party notices.
- [ ] Complete the final Devpost fields and submit the entry before the official deadline.

The Devpost entry is pending. No prize or submission success is claimed. Sandbox tests do not prove live merchant eligibility or production readiness.

## Demonstration

The [public captioned film](https://youtu.be/eSDjjLaUI2M), also available in `artifacts/demo.mp4`, shows the redesigned running app with a clearly fictional project. Its saved evidence mappings and human acceptance are existing verified records. The film rechecks the existing PayPal sandbox draft instead of creating another invoice. It shows the actual interface, grid filtering, both appearances, exact evidence excerpts, the recorded human decisions and the activity journal. See `artifacts/DEMO.md` for the scene list and recording limits.

The final source and demo describe AI assistance accurately; no human-only authorship is claimed. AI assisted application development, and the application itself uses AI only to suggest evidence mappings. It never decides acceptance or creates invoices independently.
