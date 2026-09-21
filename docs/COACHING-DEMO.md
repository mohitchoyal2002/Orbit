# Coaching admissions demo

Implementation: 9 September 2026. Route: `/coaching`, linked from the client workspace.

Programmer’s Point is a **prospective client**. The preset is an independent OrbitFlow demonstration, not an authorized integration with the institute. The preset never sends WhatsApp messages or exports contacts to HubSpot, even if provider credentials are accidentally configured for it.

## Four connected demo features

1. **Phone-based intake:** manual form, previewed CSV import and a separate authenticated server-to-server intake endpoint. Indian mobile numbers normalize to international format. A number is unique within the coaching workspace. Email is optional. Duplicate imports retain the existing record and its consent; importing again does not grant or restore permission.
2. **Conversation assistant:** inbound/outbound history; curated Hindi/Hinglish/English responses; course and learning-mode collection; counsellor takeover. Unknown questions, fees, duration, placement guarantees and batch dates request a human. STOP and common stop-message phrases suppress pending sends. Staff replies pause the assistant.
3. **Demo booking:** real persisted slots, atomic capacity checks, rescheduling and cancellation, confirmation and one-hour reminders. A reminder validates its current booking before sending. Attendance and no-shows are recorded; a no-show creates a counsellor task due in 24 hours. The no-show task does not send a marketing message automatically.
4. **Admission pipeline:** new, replied, booked, attended, enrolled and lost; assigned counsellor, next follow-up and current-stage counts. Existing HubSpot adapters can upsert contacts with actual email addresses. Phone-only leads remain in OrbitFlow until a real email is supplied; the UI supports adding it later. No fabricated email is generated.

The demo stores records in D1, not browser localStorage. Refreshing the page preserves work. Workspace membership and owner checks are enforced on the server. Students do not access this internal dashboard.

## Present the demo in five minutes

1. Sign in as the OrbitFlow owner, open `/coaching`, select **Create prospect demo**.
2. Select **Aarav Demo**. The welcome is marked `simulated`. Kabir Demo illustrates a lead without proactive-message permission.
3. In the conversation, send `MERN`, then `Online`, then `DEMO` as the student. The assistant lists the current sample slots.
4. Send `BOOK 1`. Open **Demo booking** to see the persisted reservation. Use **Simulate reminder now** to show the scheduled reminder without waiting.
5. Reschedule to another slot, or mark attendance. Record a counsellor and next action in **Follow-up & details**.
6. Ask `Fees?` to demonstrate handover. Resume the assistant if needed, then send `STOP` to demonstrate suppression. The stopped contact cannot be resumed by importing its number again.

Seed names and the +44 7700 900xxx numbers are fictional. Demo dates are generated relative to the current day. Creating the preset again refreshes future sample slots without clearing previous work or changing consent.

## Gemini: optional understanding, bounded replies

`ORBIT_GEMINI_KEY` is a server-side secret. `ORBIT_GEMINI_MODEL` defaults to `gemini-3.1-flash-lite`. Gemini is called only for questions that the deterministic rules do not already understand, and only inside a demo workspace.

The model may return one validated command such as MERN, DEMO or COUNSELLOR. It cannot generate an unverified price, execute a booking, grant consent, or send a message directly. The application renders the curated response and executes booking/consent rules itself. Failures, quota exhaustion and malformed output fall back to human handover. The app caps fallback requests at 5/minute and 100/day/workspace, with no automatic retries. These are application limits, not a guarantee of Google's free allowance or the billing status of the account.

Only a bounded question is sent, without the contact record or conversation history. Email/phone patterns are redacted. Live customer conversations do not use this demo free-tier path. Real-tenant AI processing should be agreed with the client before enabling it.

On 9 September 2026, the supplied credential passed Google's model-list check. A synthetic React-course classification also returned HTTP 200 and the command MERN. The key is stored in Sites secrets and is absent from Git and browser bundles.

## Live WhatsApp pilot setup

The real coaching account requires the institute's authorization. First test with the operator's own verified numbers and account identity. The prospect preset stays simulated permanently; enable a **separate** client workspace for live testing.

1. Create a normal client workspace in `/portal`. Give only the intended people membership.
2. As the signed-in owner, POST `/api/coaching` with `{"action":"enableWorkspace","client":"<workspace-uuid>"}`. This does not activate external sending without credentials. It cannot convert the prospect preset to live mode.
3. Configure the following server-side secret, preserving configurations for other clients:

```json
{
  "<workspace-uuid>": {
    "token": "META_ACCESS_TOKEN",
    "phoneId": "META_PHONE_NUMBER_ID",
    "version": "vXX.0",
    "appSecret": "META_APP_SECRET",
    "verifyToken": "GENERATE_A_RANDOM_VALUE_AT_LEAST_24_CHARACTERS",
    "language": "en",
    "welcomeTemplate": "approved_course_welcome",
    "bookingTemplate": "approved_demo_confirmation",
    "reminderTemplate": "approved_demo_reminder",
    "allowedRecipients": ["+91YOUR_VERIFIED_TEST_NUMBER"]
  }
}
```

Secret key: `ORBIT_COACHING_CONNECTORS_JSON`. Replace the placeholders with a supported Graph API version and actual provider identifiers. `allowedRecipients` is mandatory and currently limited to 50 numbers; this release is a restricted pilot, not an unrestricted broadcast tool. Keep the demo's real lead data out of this list.

4. Register the webhook callback on the preferred stable HTTPS site origin at `/api/coaching/whatsapp/<workspace-uuid>`. Set the verification token to the configured value and subscribe to the WhatsApp `messages` field. GET verification compares the token; POST verifies HMAC-SHA256 on the raw request bytes and checks `phone_number_id` before accepting events.
5. Publish approved template bodies with these positional parameters: welcome = `[student name, course]`; booking/reminder = `[course, time in IST, centre]`. The welcome preview is illustrative; Meta sends the exact approved template configured by name. Ensure the approved text has the promised meaning, business identity and opt-out instructions. Do not combine unsolicited promotional content with a utility reminder. Meta decides template approval/category.
6. Configure `ORBIT_RUNNER_TOKEN` as a server secret of at least 32 random characters. An authorized external scheduler must POST `/api/runner` with `Authorization: Bearer <runner-token>` at least once per minute. The endpoint processes bounded batches (10 inbound coaching events, 5 outbound coaching messages, plus existing workflows/reports). Monitor backlog and processing errors; the scheduler must be connected separately. No scheduler was provisioned by this release. **Process due messages** in the owner dashboard runs a manual batch.
7. Deploy the saved version to apply code, additive migrations and runtime secrets. Validate one opted-in, allowlisted test recipient: welcome, incoming reply, booking, reminder, delivery status and STOP. Meta live messaging cannot be verified until the actual WhatsApp account credentials are provided.

User replies open a 24-hour free-form response window; this is a messaging rule, not a promise that all such replies are free of charge. Proactive templates require opt-in. The integration deliberately does not infer marketing consent from an incoming chat. A welcome/refreshed import never clears opt-out. An in-flight request may already have left the server before an opt-out is received.

## Website intake and CSV

Use `/api/coaching/intake/<workspace-uuid>` from the institute website's server with the existing workspace intake key as a Bearer token. Do not put the key in public JavaScript. A rotated key takes effect immediately. The endpoint accepts 60 requests/minute/workspace and a bounded JSON body.

```json
{
  "name": "Synthetic test student",
  "phone": "+447700900020",
  "email": "",
  "course": "mern",
  "centre": "Bhawarkua",
  "source": "Website form reference TEST-01",
  "consentAt": null,
  "consentEvidence": ""
}
```

Record actual consent with its timestamp in milliseconds and the exact permission wording/source reference. Omit consent fields when it was not obtained. Supported course identifiers: mern, data-science, data-analytics, java, python, testing, undecided. The initial catalogue is the verified prospect-demo curriculum and needs review for another institute.

CSV requires `name,phone`; optional columns are `email,course,centre,source,consent_at,consent_evidence`. Consent times in CSV must use ISO timestamps with explicit timezones. Maximum 50 students and 64 KB. Preview is required in the UI; all row schemas are checked before importing. Database failures midway may leave a partial import; re-import safely skips existing contacts, and reports inserted versus duplicate rows.

## Delivery and operational limits

- WhatsApp `accepted`, `delivered` and `read` are different states. Signed delivery callbacks update them without regressing read to delivered/sent. Opaque callback references allow reconciliation when the original send result was lost.
- Network timeouts, interrupted workers and provider 5xx responses go to `needs_review` to avoid duplicate sends. 429 responses retry with backoff and a five-attempt bound. A missing connection or consent blocks a send. Owner review is required; uncertain messages are never silently resent.
- The fixed demo preset makes no external WhatsApp/CRM calls. Gemini may classify synthetic demo questions when configured. There is no bulk-message send or automatic opt-in button.
- The dashboard reads the latest 100 messages per selected student and paginates leads at 50/page. Metrics are current-stage counts, not historical conversion-rate claims. Slots/bookings are app-managed; no Google Calendar/Calendly account is connected.
- HubSpot synchronizes contact fields only. Booking stages and counsellor tasks currently live in OrbitFlow; a HubSpot deal pipeline and bidirectional synchronization are not implemented.
- Browser visual testing was not requested. Validation uses TypeScript, a production build, real SQLite-backed API tests and isolated provider transports, plus the synthetic live Gemini check above.

## Sources

- [Programmer’s Point courses and enquiry form](https://www.programmerspoint.in/)
- [Public company profile](https://in.linkedin.com/company/programmers-point)
- [WhatsApp messaging policy](https://whatsappbusiness.com/policy/)
- [Webhook signature verification](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint/)
- [Template components](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/components/)
- [Delivery status callbacks](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/status)
- [Gemini model information](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite)
- [Gemini pricing and data-use distinctions](https://ai.google.dev/gemini-api/docs/pricing)
