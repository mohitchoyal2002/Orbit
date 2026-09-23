# OrbitFlow project context

Last updated: 23 September 2026

This document is the durable engineering handoff for OrbitFlow. It summarizes the product requirements, decisions, implementation, deployment shape, known issues and next work from the project conversation.

It is intentionally **sanitized**. The conversation contained API keys, OAuth downloads, runner secrets and test phone numbers. None of those values belong in Git. Only secret names, safe configuration shapes and operational guidance are recorded here.

## 1. Product vision

OrbitFlow is an AI automation agency product for service businesses. Its first concrete vertical demo targets coaching institutes, with Programmer's Point in Indore as a prospective client.

The product is intended to turn enquiries into organized follow-up work:

1. Capture a lead from a website, embedded widget, manual entry, CSV import or server-to-server intake.
2. Record explicit and separate consent for analytics, WhatsApp and AI calling.
3. Track the visitor journey and declared course interest.
4. Follow up through email, WhatsApp or an AI voice agent when the client has enabled and configured that channel.
5. Store outcomes, notes and next actions in the client's isolated workspace.
6. Make the resulting data available for later, bounded AI analysis without treating untrusted visitor text as instructions.

The near-term business goal is to present a credible, working coaching-institute demo and convert a first paid pilot. Programmer's Point is a prospect, not an existing customer or authorized integration.

## 2. Brand and public experience

- Brand: **OrbitFlow**
- Tagline: **AI workflows that capture, follow up, and convert leads.**
- Visual direction: premium dark interface, warm orange accents, readable modern typography, liquid/frosted glass surfaces and restrained cinematic motion.
- Marketing inspiration included immersive scroll storytelling, full-screen background video and proof-oriented transitions. The implementation must remain original and must label simulated outcomes as simulated.
- Motion must remain optional and respect reduced-motion/reduced-data preferences.
- Public claims must not invent clients, testimonials, conversion rates, placements, prices or guarantees.

### Production hosts

| Host | Purpose |
| --- | --- |
| `www.orbitflow.work` | Public marketing website and enquiries |
| `orbitflow.work` | Redirect/entry point for the marketing website |
| `admin.orbitflow.work` | Owner-only administration, inbox, tracking and client controls |
| `app.orbitflow.work` | Client workspace/dashboard |
| `orbit-automation-studio.mohitchoyal2002.chatgpt.site` | Canonical Sites deployment origin |

The domain, subdomains and SSL were configured and reported active. Preserve existing DNS and email records when changing website DNS.

## 3. Repository and deployment

- GitHub repository: `mohitchoyal2002/Orbit`
- Sites project ID is stored in `.openai/hosting.json` and must be reused; never create a replacement Site for this checkout.
- Sites source and GitHub are separate remotes. A push to the Sites source remote does not automatically update GitHub, and a GitHub push does not automatically create a Sites release unless an explicit publishing workflow is configured.
- Production runs as a Vinext/Cloudflare Worker deployment with a Sites-managed D1 binding named `DB`.
- Additive Drizzle migrations are applied through the Sites release flow. Never rewrite an already-published migration.

### Primary commands

```bash
npm run dev
npm run build
npm test
npm run lint
npm run db:generate
```

The repository includes a GitHub Actions workflow at `.github/workflows/voice-runner.yml` for the AI-calling queue. It requires the repository Actions secret `ORBIT_RUNNER_TOKEN` and calls the production voice runner every five minutes. Scheduled GitHub jobs are best-effort, not a hard timing SLA.

## 4. Technology

- Next.js 16, React 19 and TypeScript
- Vinext, Vite and Cloudflare Workers
- Cloudflare D1 with Drizzle ORM
- Tailwind CSS 4 and existing shadcn-style primitives
- Zod validation
- Google OIDC for optional Google sign-in
- Resend for transactional email
- Gemini as an optional, bounded classifier in the synthetic coaching demo
- WhatsApp Cloud API adapters for a restricted per-client pilot
- HubSpot contact adapter
- Sarvam Voice Agents for Indian-language calling
- Node test runner with isolated SQLite-backed route tests

## 5. Access and identity

The public marketing site remains public. Administrative and client data is protected server-side.

Two sign-in paths exist:

1. Sites-owned ChatGPT sign-in.
2. A separate Google OIDC authorization-code flow using PKCE, state, nonce, signed ID-token verification and secure host-only sessions.

Google sign-in identifies a person; it does not grant a role. Owner and client workspace authorization still comes from OrbitFlow's owner allowlist and memberships.

Each subdomain has a separate host-only session. Existing ChatGPT identities are not silently linked to Google identities. A membership must be deliberately revoked/re-invited if its identity provider is changed.

### Google OAuth redirect URIs

```text
https://admin.orbitflow.work/api/auth/google/callback
https://app.orbitflow.work/api/auth/google/callback
https://www.orbitflow.work/api/auth/google/callback
https://orbit-automation-studio.mohitchoyal2002.chatgpt.site/api/auth/google/callback
```

The consent-screen application name is OrbitFlow, with the production homepage and `/privacy` URL. Requested scopes are only `openid email profile`; Gmail mailbox access is not requested.

## 6. Main product surfaces

### Marketing website

- Cinematic hero and scroll-driven story.
- Responsive desktop/mobile video treatment.
- Motion pause control and accessibility fallbacks.
- Clear enquiry CTA.
- OrbitFlow branding, logo and readable typography.
- Privacy page, robots policy, sitemap and restrictive security headers.
- The OrbitFlow tracking widget is also installed on OrbitFlow's own marketing site so first-party prospective-client activity can be measured under the same consent rules.

### Owner administration

- Enquiry inbox and full brief.
- Reply, contacted and closed states.
- Client/workspace management.
- Tracking reports and install instructions.
- AI-calling controls, agent context and call review.
- Owner-only access enforced on the server.

### Client workspace

- Leads and next actions.
- Reusable workflows, retries and alerts.
- Onboarding checklist and reports.
- Client-approved case-study drafts.
- Coaching admissions demo.
- Per-client AI-calling setup and activity.

## 7. Coaching admissions demo

The protected `/coaching` workspace demonstrates:

1. Phone-first lead capture, optional email, duplicate-number handling and CSV import.
2. Curated Hindi/Hinglish/English course assistant with counsellor handoff.
3. Demo-class booking, rescheduling, cancellation, reminders, attendance and no-show tasks.
4. Admissions stages: new, replied, booked, attended, enrolled and lost.
5. Sample WhatsApp-style conversations that are clearly marked simulated.
6. STOP/opt-out suppression.

The primary demo sequence is:

```text
Hi -> MERN -> DEMO -> BOOK 1
```

Fees, discounts, exact batch dates, availability, admission confirmation and placement guarantees must never be invented. Unknown facts go to a human counsellor.

Gemini is optional and only classifies otherwise-unrecognized synthetic demo questions into a small validated command set. It cannot grant consent, send messages, book a slot or write unverified business facts.

## 8. Embeddable tracking widget

The public embed format is:

```html
<script
  src="https://www.orbitflow.work/widget/v1.js"
  data-orbit-site="SITE_ID"
  defer
></script>
```

Each institute receives a separate public site ID, workspace binding and exact-origin allowlist. A public site ID permits event intake but never grants report access.

### Consent model

- Analytics consent, enquiry submission, WhatsApp permission and AI-call permission are separate choices.
- Contact details are collected only from an intentionally submitted form.
- Activity can remain anonymous when no enquiry is submitted; it appears in visitor/session reporting rather than in an identified lead timeline.
- Consent withdrawal stops future analytics and removes/de-links the associated activity according to the implemented deletion flow.
- Browser privacy signals are respected.
- No fingerprinting, session replay, arbitrary form-field capture or automatic phone-number discovery.

### Events

The widget can record bounded events such as:

- `page_view`
- scroll depth
- active time
- declared course views
- CTA clicks
- form interaction without field values
- video progress
- enquiry submission
- consent state and withdrawal

Repeated clicks by one visitor are multiple events/views, while the visitor/session counts remain separate metrics. A single visitor can therefore produce several course views without representing several people.

Useful host-page attributes include:

```html
data-orbit-course="mern"
data-orbit-action="book-demo"
data-orbit-form="admissions"
data-orbit-video="course-intro"
```

Tracked data is stored in D1 by client and site. The authenticated export is paginated, excludes contact fields and labels activity as untrusted input for future AI processing.

## 9. Email and CRM

Resend is configured for the `orbitflow.work` domain and the production sender uses the OrbitFlow work mailbox. Incoming mail remains with the existing mailbox provider; Resend receiving is disabled.

HubSpot's current integration scope is contact synchronization. Phone-only leads stay in OrbitFlow until a real email is supplied. A full HubSpot deal pipeline and bidirectional stage synchronization are not yet implemented.

## 10. WhatsApp

The repository includes a restricted per-client WhatsApp Cloud API adapter with:

- approved-template sends;
- allowlisted pilot recipients;
- signed webhook verification;
- incoming replies and delivery-state reconciliation;
- 24-hour reply-window awareness;
- durable retries and `needs_review` for ambiguous sends;
- STOP suppression.

The Programmer's Point prospect workspace remains a simulation. A real institute must authorize its own account, templates, number, privacy wording and recipients in a separate live client workspace.

## 11. AI calling

The intended production flow is:

```text
Consented enquiry
  -> per-client queue
  -> calling window / daily limit / suppression checks
  -> Sarvam Instant Outbound
  -> signed result webhook
  -> transcript + structured outcome
  -> human next action
```

### Client configuration

A client provides business facts, the role/purpose of the call and a starting language once. OrbitFlow supplies per-lead name and enquiry context on each call. The Sarvam agent must disclose that it is an AI assistant and that written notes are saved.

The current Programmer's Point context is designed to:

- follow up a submitted course enquiry politely in Hindi/Hinglish;
- confirm that it is a good time to speak;
- understand course interest, background, experience, learning mode, timing and career goal;
- encourage a free demo/counsellor conversation without inventing a booking;
- route fees, discounts, exact batches, guarantees and admission decisions to a human;
- capture interested/not interested, callback request, human request, unresolved questions and do-not-call.

### Safety and delivery rules

- Separate explicit AI-call consent is required for every eligible enquiry.
- One sequence is keyed by client and normalized phone.
- One in-flight call per client.
- Daily and time-window limits.
- Busy/no-answer may retry once after a delay when still eligible.
- Provider rejection, opt-out, an ambiguous send or incomplete extraction never blind-retries.
- Callback tokens are random per attempt and stored only as hashes.
- Written transcript and structured notes are retained for the bounded review period; OrbitFlow does not fetch or store audio recordings.
- A callback preference is not a confirmed appointment.

### Current live-test state

The owner connected a Sarvam Voice Agents workspace, a committed agent version, a KYC-approved calling number and the GitHub queue runner. The prospect workspace has a narrow owner-authorized exception permitting live configuration. Saved admin access, client activation, test mode, hours and daily limits must still be honored; do not force them on in code.

On 21 September 2026, two consented test records were dispatched. Both moved to `needs_review` with:

```text
error_code: provider_result_unknown
provider_id: null
interaction_id: null
duration: null
transcript: null
```

Sarvam's call-log dashboard did not show corresponding outbound entries. The current evidence therefore means OrbitFlow attempted the provider request but did not receive a confirmed `attempt_id`; it does **not** mean the recipient rejected or missed a call.

The safety behavior is intentional: Sarvam does not expose request idempotency for this path, so an ambiguous request must not be automatically redialled and risk a duplicate call or charge.

### Important temporary divergence

The general documentation says synthetic demo workspaces cannot dial, which is the desired production rule. The latest code contains a narrow exception allowing the fixed Programmer's Point workspace to be configured for the owner's live test. A previous override also forced activation, test mode and hours, ignoring saved switches. That override has been removed. The runner no longer silently promotes historical test captures. Remove the remaining workspace exception after testing and use a dedicated real/test client workspace.

### Calling investigation required

On 23 September, a read-only Sarvam analytics request using the owner-provided Voice Agents key succeeded. It returned two earlier browser debug/inbound calls and no outbound attempts for 21–23 September. This confirms that key and agent scope work, but does not prove connectivity from the production Worker.

The adapter now distinguishes transport timeouts, network/TLS/runtime errors, redirects, non-JSON responses, malformed responses and missing attempt IDs. Redirects are observed without forwarding credentials. The owner-only **Check Sarvam connection** action performs an authenticated read-only analytics request; it never dials. Safe error classes are returned and logged without credentials, response bodies, phone numbers or callback secrets.

The original failure remains unresolved until the production connection check and an authorized live call succeed. Do not claim that adding diagnostics fixed delivery. Before any retry, reconcile provider history; uncertain attempts are still held and never automatically redialled.

After the request path succeeds, validate:

- outbound call receipt on an explicitly authorized test number;
- correct Indian voice and language switching;
- AI/notes disclosure;
- written transcript callback;
- structured summary/outcome extraction;
- do-not-call extraction and suppression;
- recording remains disabled;
- one-call behavior under concurrent runners.

## 12. Database areas

The live D1 schema includes product data for:

- enquiries;
- clients and memberships;
- leads, onboarding and reports;
- workflows, jobs and operational alerts;
- coaching students, messages, slots, bookings and settings;
- widget sites, visitors, sessions, events and submissions;
- Google auth flows and sessions;
- voice settings, calls, attempts and suppression;
- case studies and consent events;
- rate-limit/runner heartbeat state.

All client-scoped queries must preserve workspace isolation. Public endpoints must never expose administrative reads.

## 13. Privacy and compliance boundaries

The public `/privacy` page must stay aligned with actual collection and providers. Every client embedding the widget also needs its own privacy notice and declared data uses.

Core rules:

- Collect the minimum required data.
- Do not derive contact information from anonymous activity.
- Keep consent purpose-specific and revocable.
- Treat visitor content and future AI-analysis input as untrusted data.
- Never commit credentials, OAuth client JSON downloads, provider identifiers that grant access, local `.env` files or exported customer data.
- Never bypass DND/NDNC, WhatsApp opt-in or telephony-provider restrictions.
- Be truthful about AI identity and data retention.
- Do not claim a sale, booking, placement or business result solely from an automated conversation.

## 14. Runtime configuration names

Values live in Sites environment settings or GitHub Actions secrets, not in source control.

| Name | Purpose |
| --- | --- |
| `ORBIT_ADMIN_EMAIL` | Owner authorization allowlist |
| `ORBIT_RATE_LIMIT_SALT` | Salt for bounded network rate-limit keys |
| `ORBIT_GOOGLE_CLIENT_ID` | Google OIDC client ID |
| `ORBIT_GOOGLE_CLIENT_SECRET` | Google OIDC client secret |
| `ORBIT_RESEND_API_KEY` | Transactional email provider key |
| `ORBIT_EMAIL_FROM` | Verified OrbitFlow sender |
| `ORBIT_GEMINI_KEY` | Optional synthetic-demo classifier key |
| `ORBIT_GEMINI_MODEL` | Optional Gemini model override |
| `ORBIT_COACHING_CONNECTORS_JSON` | Per-client WhatsApp pilot connectors |
| `ORBIT_HUBSPOT_TOKEN` or existing per-client connector setting | HubSpot contact synchronization |
| `ORBIT_SARVAM_KEY` | Model API key used for voice preview |
| `ORBIT_SARVAM_VOICE_KEY` | OrbitFlow-owned Voice Agents key |
| `ORBIT_VOICE_CONNECTORS_JSON` | Per-client Voice Agents and telephony configuration |
| `ORBIT_RUNNER_TOKEN` | Scheduled runner authorization |

Keep `.env.example` aligned with supported names but never insert real values.

## 15. Validation expectations

Before publishing functional changes:

1. Run the production build.
2. Run relevant route/database tests; use the full suite for cross-cutting changes.
3. Verify TypeScript and critical owner/client authorization paths.
4. Test mobile and desktop layouts for user-facing UI changes.
5. Verify custom-domain routing and private-page no-index behavior.
6. For provider changes, use isolated transports first; only perform real sends/calls to explicitly authorized test recipients.
7. Inspect the saved Sites version and terminal deployment status.
8. Push the exact reviewed source state to both the Sites source remote and GitHub when both are intended to remain in sync.

## 16. Recommended next work

Priority order:

1. Split `provider_result_unknown` into safe diagnostic categories and add request-stage observability.
2. Reconcile uncertain Sarvam attempts without blindly redialling.
3. Complete one successful authorized end-to-end call, including result webhook and opt-out extraction.
4. Move live calling out of the synthetic Programmer's Point workspace and remove the temporary demo exception.
5. Add an owner review action that can close, suppress or deliberately retry an attempt only after reconciliation.
6. Finish a real-client WhatsApp pilot with approved templates and verified recipients.
7. Complete HubSpot deal/stage mapping if the first client needs it.
8. Add bounded AI summaries over consented widget and lead activity after data quality and retention rules are confirmed.
9. Prepare the Programmer's Point demo script, pitch and paid-pilot scope using verified public facts only.

## 17. Source-of-truth rule

This document captures product context, not credentials and not a substitute for executable behavior. If it conflicts with code, migrations or current provider dashboards:

1. Treat security and consent constraints here as mandatory.
2. Inspect the deployed code and live state.
3. Update the implementation and this document together after a verified decision.

