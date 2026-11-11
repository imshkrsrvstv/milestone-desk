# Milestone Desk

## Customer and problem

Independent developers and small studios need to decide which completed work is ready for an invoice. A milestone's existence is not proof of delivery. Milestone Desk compares acceptance criteria against supplied delivery evidence, identifies gaps, and makes the human review explicit before creating a PayPal sandbox draft invoice.

## Smallest useful build

1. Start with a fictional three-milestone website project or create a project with its criteria, fee, and evidence.
2. Use a real configured AI reviewer to map exact source excerpts to acceptance criteria, alongside conservative deterministic evidence checks. Without AI access, local evidence review stays usable and clearly labelled.
3. Review all criteria in a native form and compare milestone amounts/statuses in a real AG Grid Community grid.
4. Approve one fixed milestone and recipient, inspect the exact payload, then create one PayPal sandbox DRAFT invoice. The application cannot send invoices, capture payments, or select production PayPal.
5. Keep a durable local audit trail, export the review packet, and reconcile a previously created invoice's sandbox state.

## Technology and limits

Node >=22.13 standalone app, localhost port 4344, relative assets/API for ProofDeck /lab/milestone/ proxy. SQLite persistence. AI uses a configurable chat-completions endpoint with no tool access, optionally disabled. AG Grid Community pinned after manifest/license/runtime review. No secret is accepted from the browser or included in an export.

PayPal credentials come only from server environment. Missing credentials are an honest setup state. Real sandbox integration must be verified before claiming the submission meets the competition requirement. Publishing is a separate release step. The application does not send emails or move real money.

## Verification

Test exact excerpt checks, untrusted model output, amount/currency validation, human-review prerequisite, durable idempotency, concurrent/repeated invoice attempts, sandbox-only URL construction, safe exports, bounded AI calls, HTTP origin checks, and a phone/keyboard browser journey.

## Submission target

PayPal AI Hackathon, potentially AG Grid sponsor prize. Separate project from ClauseCart checkout. Sandbox integration has been verified with owner-provided credentials. A public repository and hosted working video under three minutes are separate submission requirements.

## Primary sources

- https://paypalaihackathon.devpost.com/rules
- https://developer.paypal.com/api/invoicing/v2
- https://developer.paypal.com/invoicing/about
- https://www.ag-grid.com/javascript-data-grid/getting-started/
