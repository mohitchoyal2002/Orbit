# ORBIT client operations

Implementation date: 7 September 2026. This change adds the first client-operations release; it does not claim live provider activation, live customer results or a launched subscription service.

## Included

| Product need | Working implementation | Activation / limitation |
| --- | --- | --- |
| Secure client dashboard | `/portal`, explicit memberships, stable signed-in user binding, scoped lead and report APIs | Client must also be allowed by Site sharing. Existing publication remains owner-only. |
| Lead pipeline | Intake API and manual entry, follow-up dates, new/contacted/qualified/won/lost stages | Intake credentials belong in a server, never public JavaScript. |
| Human response time | Immutable first response timestamp set when a member confirms an actual response | Self-reported; starts at ORBIT receipt time. Email clicks and automation acceptance are not responses. |
| CRM workflow | Reusable new-lead → HubSpot contact upsert | A scoped HubSpot token and a real provider test are required. No existing contacts are bulk-imported. |
| WhatsApp workflow | One approved, parameter-free template per lead; explicit owner queue action and opt-in evidence required | Meta account, approved template, phone ID, token and supported Graph version are required. This is not a sequence builder or chatbot. |
| Error alerts | Persistent in-app alerts; separate error notification jobs for CRM/WhatsApp failures | External alerts need a verified Resend sender and a configured recipient. Email failures remain visible in-app. |
| Retries | D1 queue, atomic claims, two-minute leases, bounded processing, five-attempt ceiling | Recurring processing requires a scheduled caller. Manual processing is available. |
| Reusable workflows | Per-client CRM and email templates, initially disabled | Enabling affects new leads. Disabling does not cancel already queued jobs. |
| Onboarding | Seven persistent checklist items and progress | A checked item records a human confirmation, not a provider test. |
| Case studies | Private drafts, exact-content hash, client approval/revocation, append-only consent event records | A real pilot and real client are needed. Nothing is published automatically. |
| Recurring operations | Usage counters, monthly snapshots, JSON exports, previous-month report generation | UTC reporting; runner must be connected. No billing or revenue attribution is inferred. |
| Subscription direction | Feature requests, grouped by category and distinct client count | The evidence informs a later product/pricing decision; there is no payment integration. |

## Access model

1. The studio owner signs in and opens `/portal` (also linked from `/studio`).
2. Create a workspace and enter the client's **ChatGPT sign-in email**.
3. Separately allow that client in the Site's viewer sharing. An application membership alone cannot bypass the Site's audience restrictions.
4. The invited email claims its membership on its first authorized workspace request. Later requests require the same stable Site user ID. Changing an email does not transfer the claimed membership to a different identity.
5. Client members can manage their own leads, follow-ups, onboarding, reports and product requests. Only the studio owner can manage memberships, workflow switches, provider runs and case-study drafts.
6. Only a client member can approve or revoke a case-study draft. Editing a draft resets its permission. The retained consent event records show the approved content hash and actor.

Identity headers are trusted only behind Sites dispatch. Never expose the raw Worker directly to untrusted traffic that can set `oai-authenticated-user-*` headers. Protected responses are private/no-store and noindex. All browser mutations enforce origin checks and bounded validated bodies. Every resource operation scopes identifiers to the authorized client.

No invitation emails are sent by member creation. No client credentials are included in API responses. Intake secrets are shown once and only their SHA-256 hash is stored. Key rotation invalidates the previous key immediately.

## Provider setup

Set server-side runtime values through Sites. Do not commit real values or enter them into the public website. `.env.example` contains only variable names.

| Environment variable | Value |
| --- | --- |
| `ORBIT_ADMIN_EMAIL` | Existing studio owner allowlist |
| `ORBIT_RATE_LIMIT_SALT` | Existing public enquiry rate-limit secret |
| `ORBIT_CONNECTORS_JSON` | Object keyed by client workspace ID; see shape below |
| `ORBIT_RESEND_KEY` | Resend sending API key, optional until email is enabled |
| `ORBIT_EMAIL_FROM` | Verified sender, for example `ORBIT <alerts@your-domain.example>` |
| `ORBIT_RUNNER_TOKEN` | Random 32+ character bearer secret for the scheduled runner |

Example **shape only**; replace all placeholder values privately:

```json
{
  "CLIENT_WORKSPACE_UUID": {
    "hubspotToken": "SERVER_SECRET",
    "alertEmail": "client-operations@example.com",
    "whatsapp": {
      "token": "SERVER_SECRET",
      "phoneId": "META_PHONE_NUMBER_ID",
      "version": "SUPPORTED_GRAPH_API_VERSION",
      "template": "YOUR_APPROVED_TEMPLATE_NAME",
      "language": "en"
    }
  }
}
```

Only include connected providers. The Graph version must have the form `vNN.0`; obtain a currently supported value from the Meta app. Template and language must match an approved **parameter-free** template. This release does not build template parameters or verify template approval through Meta. “Configured” means the settings are present and structurally valid, not that a live connection has been tested.

HubSpot uses `/crm/v3/objects/contacts/batch/upsert`, identifying the contact by email. Provided name and phone fields are synchronized. Empty optional name/phone fields are omitted so that they are not intentionally cleared. Verify the chosen portal's contact scopes and email-based upsert behavior with test contacts before enabling a production workflow.

Email alerts contain an internal reference or an instruction to open the workspace, not the customer's name, email or brief. The recipient is explicitly configured per client. Rotate provider tokens using runtime configuration; secret values are not editable through the dashboard.

## Intake API

`POST /api/intake/{clientId}` accepts `Authorization: Bearer <intakeKey>` and JSON:

```json
{
  "externalRef": "your-form-submission-unique-id",
  "name": "Example Contact",
  "email": "contact@example.com",
  "phone": "+919876543210",
  "brief": "We would like a callback about the training programme.",
  "consentEvidence": "Form submission FORM-001; customer selected the business-specific WhatsApp opt-in checkbox.",
  "consentAt": 1788751800000
}
```

The example contains fictional contact data. `consentAt` is a real past consent timestamp in milliseconds, not a value to copy. Omit `consentAt` and `consentEvidence` when no consent was obtained. `phone` is optional, but WhatsApp requires an international number and consent evidence. The original payload hash is retained for idempotency: reuse the same external reference and exact payload on a retry; a changed payload returns 409. The reference is unique within the client workspace. The limit is 60 requests/minute/client, returning 429 with Retry-After when exceeded.

Lead creation and enabled workflow jobs are committed in one D1 batch. The public agency enquiry API remains separate: prospective ORBIT customers are not silently assigned to a client workspace.

## Processing, retries and alerts

Manual: choose **Workflows → Process due runs** as the studio owner. Each invocation processes at most five due jobs. It does not fabricate provider results when a connection is missing.

Scheduled: an authorized server-side scheduler calls `POST /api/runner` with the runner bearer token. Each call processes up to five jobs, creates up to ten missing previous-month report snapshots and removes expired rate-limit buckets. Run periodically and monitor its HTTP status. No scheduler has been created or activated by this implementation. The Site's outer access layer must also authorize the scheduler; the application bearer token does not bypass owner-only Site sharing. Confirm a supported machine-access/deployment path before relying on unattended processing.

Processing behavior:

- A job is atomically claimed with a unique claim token and a two-minute lease. Concurrent callers cannot claim the same active run.
- Retries use exponential delay beginning at 30 seconds and honor a larger provider Retry-After. No sleeping occurs in a request.
- CRM upserts can safely repeat against the email identifier. Email sends retain the same frozen request payload and Resend idempotency key. Ambiguous email retries stop after 23 hours from job creation, conservatively inside the provider's 24-hour key retention.
- WhatsApp timeouts, 5xx results, unreadable successful responses and expired processing leases enter `needs_review`, because acceptance may already have happened. They are never automatically resent. Explicit rate-limit rejections can retry.
- The studio owner can record a provider message ID after independently verifying an ambiguous send was accepted. A not-accepted or unresolved run remains in review; this release does not expose a “send anyway” control.
- Opt-out is checked again at processing time. Recording opt-out is irreversible in this UI; resuming communication requires a future verified re-consent workflow.
- After five attempts, runs stop and surface an alert. Missing configuration blocks a run and surfaces an alert. Adding configuration requires the owner to queue a permitted retry.
- Provider success means **accepted by the API**, not delivered or read. WhatsApp delivery/inbound webhooks, automatic opt-out keyword handling and automatic response attribution are not yet implemented.
- If an external notification fails, its in-app alert is retained. Email failures do not recursively generate more failure emails.

Monitor the in-app alerts and the runner's health during a pilot. A stopped runner cannot process its own alert. Job request snapshots can contain contact data; agree retention and implement the required client data-deletion/export process before handling production customer data at scale.

## Reports and case-study evidence

Reports use calendar-month boundaries in UTC. Lead counts and response metrics describe leads received in that month; “won” reflects the cohort's status at snapshot time. Provider usage counts successful job completions during the month. Unanswered leads have no response duration, not zero. Clicking “Open email app” never records a response or a sent email.

The recurring runner creates the previous month's first snapshot once. Saving a snapshot explicitly from the dashboard refreshes that month using current outcomes. Exports contain aggregate metrics only. Actual provider invoices remain the authority for usage charges; this implementation does not calculate bills.

Use `docs/CASE-STUDY-TEMPLATE.md` after a real pilot. Do not invent a baseline, claim customer permission or publish business names until the exact client-approved copy is available.

## Validation and rollout

The local suite runs real API handlers against real SQLite migrations and stubbed network providers. It checks membership isolation, revocation, origin protection, idempotent intake, transaction-backed jobs, concurrent claims, retry safety, consent, reporting and secret exclusion. The actual provider APIs have not been called and no customer messages have been sent in development.

1. Review the change and apply the new additive migration with the release.
2. Grant one pilot workspace and verify authorized/unauthorized access using separate real accounts.
3. Configure one provider at a time; enable only the intended workflow.
4. Test an actual permitted lead, confirm provider acceptance/delivery and verify opt-out and failure handling.
5. Connect and monitor the runner through an authorized machine-access path.
6. Agree retention, support ownership and the first reporting period.

## Primary provider references checked 7 September 2026

- [HubSpot contacts and upserts](https://developers.hubspot.com/docs/api-reference/legacy/crm/objects/contacts/guide)
- [Meta template fundamentals](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview)
- [Meta Messages API](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/message-api)
- [Meta opt-in requirements](https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in)
- [Resend idempotency keys and 24-hour retention](https://resend.com/docs/dashboard/emails/idempotency-keys)
