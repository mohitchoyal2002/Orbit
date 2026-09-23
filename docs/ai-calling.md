# OrbitFlow AI calling

The admin allows calling per client. A client saves business facts and a calling purpose at `/calling`, chooses a starting language, then activates the assistant. Each new enquiry must include separate, explicit AI-call consent. Sarvam Voice Agents handles ASR, conversation, Indian speech and its connected telephony provider. OrbitFlow handles authorisation, intake, scheduling, results and reporting.

## What is implemented

- **Test capture mode**: admin can allow a client to save an enquiry's call entry without dialling. The existing synthetic coaching demo defaults to this mode. Every submitted phone is saved in Call activity as `test_saved`; missing AI-call permission is shown explicitly. Nothing is sent to Sarvam in test mode. Duplicate phone submissions share one entry. Switching to live does not dial old test records; a fresh, consented enquiry is required.

- Calling setup and history on `app.orbitflow.work/calling` and `admin.orbitflow.work/calling`; existing client membership enforcement applies to every read and write.
- Admin access switch, daily attempt limit (1–100), India hours (between 09:00 and 20:00 IST), maximum 1 or 2 attempts, and client start/pause. Pausing cancels queued work; it does not terminate an already connected call.
- Inputs from generic client intake, coaching intake, manual lead creation and the public embedded widget. Analytics, WhatsApp and AI-call consent are independent. Widget AI-call permission appears only while calling is enabled. Demo workspaces cannot dial.
- One automatic follow-up sequence per `(client, phone)`; source retries and repeated form submissions do not create additional sequences. Only new consented leads (under 48 hours old) are eligible. Existing records are not bulk dialled when the feature is enabled.
- Sarvam Instant Outbound using a committed agent version and per-call context. One in-flight call per client, atomic claims, per-client daily attempt cap, and no auto-redial after ambiguous timeouts/5xx. Unknown sends are marked `needs_review`; there is intentionally no blind retry button.
- Callback results stored as written transcript, duration, structured interest/questions, requested callback, human follow-up and factual summary. A connected call does not imply a sale or booking. Missing summaries, unknown outcomes or missing opt-out results are marked `needs_review` with `extraction_incomplete`; the transcript is retained and the call is never automatically retried. A confirmed opt-out is still suppressed even if other output fields are missing. A verbal callback time is saved for a human, not interpreted into an invented appointment.
- Busy/no-answer may retry once after at least four hours, within calling hours and the 48-hour enquiry window. Provider failures, rejection, opt-outs and uncertain sends never auto-retry.
- Per-client do-not-call suppression, including repeat submissions of the same phone. Callback secrets are random per attempt and hashed in the database. Duplicate callbacks are idempotent; conflicting callbacks are rejected. Fast callbacks cannot regress a completed attempt.
- Transcript/context/notes hidden after 90 days and cleaned by the runner. Suppression and minimal call history remain. Audio recordings are neither fetched nor stored by OrbitFlow.

## Sarvam setup (admin, once per client)

The **Model APIs key** (`api-subscription-key`) enables the Hindi voice sample. It does not provision a telephone number. **Voice Agents** uses `X-API-Key` with organisation/workspace scope.

1. Open [Sarvam Voice Agents](https://indus.sarvam.ai/samvaad). Create an agent and select an available Indian voice. The OrbitFlow sample uses **Priya / Bulbul v3**; choose the intended live voice separately in the agent's Speaking settings.
2. OrbitFlow sends only the following input variables, leaving output extraction to the committed agent configuration. Declare input variables: `business_name`, `business_context`, `role_context`, `preferred_language`, `lead_name`, `enquiry_context`.
3. Use the instruction template in OrbitFlow Admin → AI calling → Agent setup (source: `lib/voice-shared.ts`). The `{{variable}}` markers show insertion locations: replace each with the matching variable using Sarvam's **@ variable picker** so it is a real variable reference, not literal text.
4. Declare output variables with extraction prompts: `outcome`, `summary`, `interest`, `questions`, `callback_request`, `next_action`, and `do_not_call` as an Enum with string values `true` and `false` (OrbitFlow also accepts actual booleans from the API). `outcome` must be one of `interested`, `callback_requested`, `human_requested`, `not_interested`, `do_not_call`, `wrong_number`, `unqualified`, `unknown`. Extract only statements supported by the conversation. `do_not_call` must be true for a refusal of further calls or a wrong number. Enable the platform's end-call tool.
5. Allow the required conversation languages; enable language switching, set a maximum five-minute duration and **disable audio recording**. Test interruption handling, AI disclosure, refusal, unknown fees, wrong numbers and human handoff in Sarvam's test agent before using it with people. The REST API cannot override an agent's chosen voice or all these settings per call.
6. Commit an agent version. Connect an authorised telephony provider/number or rent a number through Sarvam. Use the provider's required onboarding and calling restrictions. Do not bypass its DND/NDNC blocks.
7. Save this client's configuration in the secret `ORBIT_VOICE_CONNECTORS_JSON` through Sites environment settings. This stays server-side; never put it in the widget, frontend, source or a form value:

```json
{
  "CLIENT_WORKSPACE_UUID": {
    "apiKey": "VOICE_AGENTS_KEY",
    "orgId": "SARVAM_ORGANISATION_ID",
    "workspaceId": "SARVAM_WORKSPACE_ID",
    "appId": "COMMITTED_AGENT_ID",
    "appVersion": 1,
    "connectionId": "TELEPHONY_CONNECTION_ID",
    "agentPhoneNumber": "+91REGISTERED_NUMBER",
    "templateReady": true
  }
}
```

`templateReady` is the admin's attestation that the above agent, variables, disclosure, voice and recording settings were configured and tested. The presence of configuration is not proof of a completed real phone test. Inspect actual final output variables in a finished test: a polite spoken response is not proof that summary or opt-out extraction ran. If extraction or recording settings cannot be verified, leave `templateReady` unset and keep live calling disabled. Invalid or incomplete configurations fail closed. Per-client configuration supports different Sarvam accounts and numbers.

For a client explicitly hosted under OrbitFlow's own Sarvam account, replace `apiKey` in that client's connector with `"useOrbitKey": true`. The key then comes from the separate server secret `ORBIT_SARVAM_VOICE_KEY`. Never set both. Other clients continue using their own `apiKey`; no client inherits the OrbitFlow key automatically. A key alone does not activate calling: all organisation, workspace, agent/version and telephony fields remain required.

8. Deploy the environment revision. Enable the client's feature, save context and connect the scheduled runner, then turn on automatic calling. Use a separate real client workspace and your own consenting test phone for the first end-to-end call. Do not convert the existing synthetic coaching demo to live calling.

## Queue runner

The Worker responds to a successfully stored enquiry immediately, then drains eligible call jobs with `ctx.waitUntil`. Each run dispatches at most two calls, one per available client, within a bounded background window. Busy or daily-capped clients cannot block other clients. Every successful result callback also wakes the queue. This is not a reliable timer for after-hours enquiries or retries: configure a scheduler to POST `https://www.orbitflow.work/api/voice/runner` every five minutes using `Authorization: Bearer ORBIT_RUNNER_TOKEN`. Use a random secret of at least 32 characters, saved both in Sites and in the scheduler. This endpoint processes calling only; it does not send other workflow messages.

A GitHub Actions workflow is included in `.github/workflows/voice-runner.yml`. It needs the source in a GitHub repository, Actions enabled, and the `ORBIT_RUNNER_TOKEN` repository secret. Publishing the Site's source to the Sites Git remote does **not** enable GitHub Actions. GitHub scheduled jobs can be delayed; use a dedicated scheduler when you need a timing SLA. Any trusted HTTP scheduler can call the same endpoint. Activation requires a runner heartbeat in the last 15 minutes, and the dashboard reports stale heartbeats.

## Intake contract

Existing `POST /api/intake/{client}` and coaching intake authentication stays unchanged. Add these fields only when the enquiry actually includes explicit AI-call permission:

```json
{
  "callConsentAt": 1789788600000,
  "callConsentEvidence": "Form reference TEST-123; exact displayed AI-call and written-transcript permission; visitor actively checked the box."
}
```

Use the real consent time in epoch milliseconds, not the example time. An unconsented number is still a lead, but never enters the call queue. The public widget sets evidence and time server-side when its separate optional call checkbox is selected.

## Verification and limits

Run `node --test tests/voice.test.mjs tests/operations.test.mjs tests/coaching.test.mjs tests/widget-auth.test.mjs`, TypeScript and the Sites build. Tests execute real SQL/migrations and route handlers with an isolated provider transport: they do not phone anyone. A successful Model API speech check does not validate live telephony, provider webhook delivery or conversation quality. Those need the client's Voice Agents configuration and an explicitly authorised test recipient.

If a call remains `needs_review`, inspect Sarvam's attempt history before any new outreach. Do not directly reset its status to queued. Already sent calls cannot be undone by pausing. Production worker shutdown after provider acceptance is reconciled by the secret callback; a missing result is reported for manual review after 90 minutes. The integration does not promise exactly-once delivery by a telephone carrier.

## Provider references

- [Instant Outbound](https://docs.sarvam.ai/api-reference/instant-outbound/create)
- [Result webhook](https://docs.sarvam.ai/api-reference/instant-outbound/webhook-payload)
- [Voice Agents authentication](https://docs.sarvam.ai/api-reference/conversations)
- [Variables and personalisation](https://docs.sarvam.ai/conversations/build/variables-personalization)
- [Telephony](https://docs.sarvam.ai/conversations/deploy/telephony)
- [Model API speech](https://docs.sarvam.ai/api-reference/text-to-speech/convert)

## Dispatch diagnostics

Admin → AI calling → Agent setup → **Check Sarvam connection** makes a read-only request from the deployed Worker to Sarvam analytics, using the selected client connector. It checks the saved key and agent access without placing a call. A successful check does not validate the telephony number, outbound delivery or output extraction.

Dispatch errors distinguish `provider_timeout`, `provider_network_error`, `provider_connection_error`, `provider_runtime_error`, `provider_response_not_json`, `provider_attempt_id_missing` and `provider_http_<status>`. No raw provider body or request credentials are logged. Redirects are not followed. Unknown/ambiguous attempts remain in review without automatic retry.

The owner-authorized Programmer's Point live-test workspace now honors the same stored pause, test-mode, calling-hour and daily-limit settings as other workspaces. Historical test captures are not promoted by the runner.

The calling table now offers **Call now** for each eligible contact. It adds an attempt to the same call record after confirmation, with fresh explicit AI-call permission, opt-out and suppression checks, an active live workspace, a 30-minute contact cooldown, at most two attempts per contact per day, and the workspace daily cap. The request respects configured IST hours; outside them it queues until opening. Attempts with unknown provider outcomes cannot be redialled until Sarvam history is reconciled. Saving admin access now switches a real workspace out of test capture, but activation remains a separate step. The test-capture toggle is no longer exposed in the admin UI.
