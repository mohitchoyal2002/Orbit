import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const enquiries = sqliteTable("enquiries", {
  id: text("id").primaryKey(),
  reference: text("reference").notNull(),
  payloadHash: text("payload_hash").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  company: text("company").notNull(),
  goal: text("goal").notNull(),
  plan: text("plan").notNull(),
  message: text("message").notNull(),
  status: text("status", { enum: ["new", "contacted", "closed"] }).notNull().default("new"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, table => [uniqueIndex("idx_enquiries_reference").on(table.reference), index("idx_enquiries_created_at").on(table.createdAt)]);

export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  hits: integer("hits").notNull().default(1),
  expiresAt: integer("expires_at").notNull(),
}, table => [index("idx_rate_limits_expiry").on(table.expiresAt)]);

// Client operations are deliberately separate from the studio's sales enquiries.
export const clients = sqliteTable("clients", {
  id: text("id").primaryKey(), name: text("name").notNull(),
  intakeKeyHash: text("intake_key_hash").notNull(), active: integer("active").notNull().default(1),
  createdAt: integer("created_at").notNull(),
});
export const memberships = sqliteTable("memberships", {
  id: text("id").primaryKey(), clientId: text("client_id").notNull().references(() => clients.id),
  email: text("email").notNull(), userId: text("user_id"),
  active: integer("active").notNull().default(1), createdAt: integer("created_at").notNull(),
}, t => [uniqueIndex("idx_memberships_email").on(t.clientId, t.email), index("idx_memberships_user").on(t.userId, t.active)]);
export const leads = sqliteTable("leads", {
  id: text("id").primaryKey(), clientId: text("client_id").notNull().references(() => clients.id),
  externalRef: text("external_ref").notNull(), payloadHash: text("payload_hash").notNull(),
  name: text("name").notNull(), email: text("email").notNull(), phone: text("phone").notNull().default(""),
  brief: text("brief").notNull().default(""), status: text("status").notNull().default("new"),
  consentEvidence: text("consent_evidence").notNull().default(""), consentAt: integer("consent_at"),
  callConsentAt: integer("call_consent_at"), callConsentEvidence: text("call_consent_evidence").notNull().default(""),
  optedOutAt: integer("opted_out_at"), firstResponseAt: integer("first_response_at"),
  followUpAt: integer("follow_up_at"), createdAt: integer("created_at").notNull(), updatedAt: integer("updated_at").notNull(),
}, t => [uniqueIndex("idx_leads_source").on(t.clientId, t.externalRef), index("idx_leads_client_created").on(t.clientId, t.createdAt), index("idx_leads_follow_up").on(t.clientId, t.followUpAt)]);
export const workflows = sqliteTable("workflows", {
  id: text("id").primaryKey(), clientId: text("client_id").notNull().references(() => clients.id),
  template: text("template").notNull(), enabled: integer("enabled").notNull().default(0),
}, t => [uniqueIndex("idx_workflows_template").on(t.clientId, t.template)]);
export const jobs = sqliteTable("workflow_jobs", {
  id: text("id").primaryKey(), clientId: text("client_id").notNull().references(() => clients.id),
  leadId: text("lead_id").references(() => leads.id), action: text("action").notNull(),
  status: text("status").notNull().default("pending"), attempts: integer("attempts").notNull().default(0),
  nextAt: integer("next_at").notNull(), leaseUntil: integer("lease_until"), claimToken: text("claim_token"),
  payload: text("payload"), providerId: text("provider_id"), errorCode: text("error_code"),
  createdAt: integer("created_at").notNull(), updatedAt: integer("updated_at").notNull(), finishedAt: integer("finished_at"),
}, t => [index("idx_jobs_due").on(t.status, t.nextAt), index("idx_jobs_client_created").on(t.clientId, t.createdAt)]);
export const alerts = sqliteTable("operation_alerts", {
  id: text("id").primaryKey(), clientId: text("client_id").notNull().references(() => clients.id),
  jobId: text("job_id").notNull().references(() => jobs.id), code: text("code").notNull(),
  acknowledgedAt: integer("acknowledged_at"), createdAt: integer("created_at").notNull(),
}, t => [uniqueIndex("idx_alert_job").on(t.jobId), index("idx_alert_client").on(t.clientId, t.createdAt)]);
export const onboarding = sqliteTable("onboarding", {
  id: text("id").primaryKey(), clientId: text("client_id").notNull().references(() => clients.id),
  item: text("item").notNull(), completed: integer("completed").notNull().default(0),
  updatedBy: text("updated_by").notNull(), updatedAt: integer("updated_at").notNull(),
}, t => [uniqueIndex("idx_onboarding_item").on(t.clientId, t.item)]);
export const caseStudies = sqliteTable("case_studies", {
  id: text("id").primaryKey(), clientId: text("client_id").notNull().references(() => clients.id),
  title: text("title").notNull(), body: text("body").notNull(), contentHash: text("content_hash").notNull(),
  status: text("status").notNull().default("draft"), approvedHash: text("approved_hash"), approvedBy: text("approved_by"),
  approvedAt: integer("approved_at"), revokedAt: integer("revoked_at"), updatedAt: integer("updated_at").notNull(),
}, t => [index("idx_case_client").on(t.clientId)]);
export const consentEvents = sqliteTable("case_consent_events", {
  id: text("id").primaryKey(), caseId: text("case_id").notNull().references(() => caseStudies.id),
  action: text("action").notNull(), contentHash: text("content_hash").notNull(),
  actor: text("actor").notNull(), createdAt: integer("created_at").notNull(),
});
export const reports = sqliteTable("monthly_reports", {
  id: text("id").primaryKey(), clientId: text("client_id").notNull().references(() => clients.id),
  month: text("month").notNull(), metrics: text("metrics").notNull(), generatedAt: integer("generated_at").notNull(),
}, t => [uniqueIndex("idx_reports_month").on(t.clientId, t.month)]);
export const featureRequests = sqliteTable("feature_requests", {
  id: text("id").primaryKey(), clientId: text("client_id").notNull().references(() => clients.id),
  category: text("category").notNull(), description: text("description").notNull(),
  actor: text("actor").notNull(), createdAt: integer("created_at").notNull(),
}, t => [index("idx_requests_client").on(t.clientId, t.createdAt)]);

export const coachingSettings = sqliteTable("coaching_settings", {
  clientId: text("client_id").primaryKey().references(() => clients.id),
  isDemo: integer("is_demo").notNull().default(1), createdAt: integer("created_at").notNull(),
});
export const coachingStudents = sqliteTable("coaching_students", {
  leadId: text("lead_id").primaryKey().references(() => leads.id), clientId: text("client_id").notNull().references(() => clients.id),
  phone: text("phone").notNull(), course: text("course").notNull(), centre: text("centre").notNull().default("Bhawarkua"),
  learningMode: text("learning_mode").notNull().default("Undecided"), source: text("source").notNull(),
  stage: text("stage").notNull().default("new"), background: text("background").notNull().default(""),
  assignedTo: text("assigned_to").notNull().default(""), handoff: integer("handoff").notNull().default(0),
  lastInboundAt: integer("last_inbound_at"), offeredSlots: text("offered_slots").notNull().default("[]"),
}, t => [uniqueIndex("idx_coaching_phone").on(t.clientId,t.phone),index("idx_coaching_stage").on(t.clientId,t.stage)]);
export const coachingSlots = sqliteTable("coaching_slots", {
  id: text("id").primaryKey(),clientId: text("client_id").notNull().references(() => clients.id),course: text("course").notNull(),
  centre: text("centre").notNull(),startsAt: integer("starts_at").notNull(),capacity: integer("capacity").notNull().default(1),
}, t => [index("idx_coaching_slots_time").on(t.clientId,t.startsAt)]);
export const coachingBookings = sqliteTable("coaching_bookings", {
  leadId: text("lead_id").primaryKey().references(() => leads.id),id: text("id").notNull(),
  clientId: text("client_id").notNull().references(() => clients.id),slotId: text("slot_id").notNull().references(() => coachingSlots.id),
  status: text("status").notNull().default("confirmed"),updatedAt: integer("updated_at").notNull(),
}, t => [uniqueIndex("idx_coaching_booking_version").on(t.id),index("idx_coaching_bookings_slot").on(t.clientId,t.slotId,t.status)]);
export const coachingMessages = sqliteTable("coaching_messages", {
  id: text("id").primaryKey(),clientId: text("client_id").notNull().references(() => clients.id),leadId: text("lead_id").notNull().references(() => leads.id),
  direction: text("direction").notNull(),kind: text("kind").notNull().default("text"),body: text("body").notNull(),
  parameters: text("parameters").notNull().default("[]"),status: text("status").notNull(),
  providerId: text("provider_id"),errorCode: text("error_code"),bookingId: text("booking_id"),
  attempts: integer("attempts").notNull().default(0),leaseUntil: integer("lease_until"),claimToken: text("claim_token"),
  sendAt: integer("send_at").notNull(),createdAt: integer("created_at").notNull(),updatedAt: integer("updated_at").notNull(),
}, t => [index("idx_coaching_messages_thread").on(t.clientId,t.leadId,t.createdAt),index("idx_coaching_messages_due").on(t.status,t.sendAt),index("idx_coaching_provider").on(t.clientId,t.providerId)]);

// Public embed keys identify a site; they never authorize reading its data.
export const widgetSites = sqliteTable("widget_sites", {
  id: text("id").primaryKey(), clientId: text("client_id").notNull().references(() => clients.id),
  name: text("name").notNull(), origins: text("origins").notNull(), privacyUrl: text("privacy_url").notNull(),
  courses: text("courses").notNull(), color: text("color").notNull().default("#fa783c"),
  enabled: integer("enabled").notNull().default(1), retentionDays: integer("retention_days").notNull().default(90),
  createdAt: integer("created_at").notNull(), updatedAt: integer("updated_at").notNull(),
}, t => [index("idx_widget_sites_client").on(t.clientId)]);
export const widgetVisitors = sqliteTable("widget_visitors", {
  id: text("id").primaryKey(), siteId: text("site_id").notNull().references(() => widgetSites.id),
  leadId: text("lead_id"), consentVersion: text("consent_version").notNull(), consentAt: integer("consent_at").notNull(),
  revokedAt: integer("revoked_at"), origin: text("origin").notNull(), lastSeen: integer("last_seen").notNull(),
}, t => [index("idx_widget_visitors_site_seen").on(t.siteId,t.lastSeen)]);
export const widgetSessions = sqliteTable("widget_sessions", {
  id: text("id").primaryKey(), siteId: text("site_id").notNull().references(() => widgetSites.id),
  visitorId: text("visitor_id").notNull().references(() => widgetVisitors.id),
  startedAt: integer("started_at").notNull(), lastSeen: integer("last_seen").notNull(), expiresAt: integer("expires_at").notNull(),
  attribution: text("attribution").notNull(), device: text("device").notNull(),
}, t => [index("idx_widget_sessions_site_visitor").on(t.siteId,t.visitorId,t.startedAt),index("idx_widget_sessions_expiry").on(t.expiresAt)]);
export const widgetEvents = sqliteTable("widget_events", {
  id: text("id").primaryKey(), siteId: text("site_id").notNull().references(() => widgetSites.id),
  sessionId: text("session_id").notNull().references(() => widgetSessions.id,{onDelete:"cascade"}),
  visitorId: text("visitor_id").notNull().references(() => widgetVisitors.id),
  type: text("type").notNull(), path: text("path").notNull(), properties: text("properties").notNull(),
  occurredAt: integer("occurred_at").notNull(), receivedAt: integer("received_at").notNull(), expiresAt: integer("expires_at").notNull(),
  schemaVersion: integer("schema_version").notNull().default(1),
}, t => [index("idx_widget_events_site_time").on(t.siteId,t.occurredAt),index("idx_widget_events_journey").on(t.siteId,t.visitorId,t.occurredAt),index("idx_widget_events_expiry").on(t.expiresAt)]);
export const widgetSubmissions = sqliteTable("widget_submissions", {
  id: text("id").primaryKey(), siteId: text("site_id").notNull().references(() => widgetSites.id),
  leadId: text("lead_id").notNull(), visitorId: text("visitor_id"), payloadHash: text("payload_hash").notNull(),
  course: text("course").notNull(), origin: text("origin").notNull(), contactConsentAt: integer("contact_consent_at").notNull(),
  whatsappConsentAt: integer("whatsapp_consent_at"), consentVersion: text("consent_version").notNull(),
  consentText: text("consent_text").notNull(), createdAt: integer("created_at").notNull(),
}, t => [index("idx_widget_submissions_site_time").on(t.siteId,t.createdAt),index("idx_widget_submissions_visitor").on(t.siteId,t.visitorId)]);

// Host-bound Google login sessions; provider tokens are never persisted.
export const googleAuthFlows = sqliteTable("google_auth_flows", {
  id: text("id").primaryKey(), browserHash: text("browser_hash").notNull(),
  verifier: text("verifier").notNull(), nonce: text("nonce").notNull(),
  origin: text("origin").notNull(), returnPath: text("return_path").notNull(), expiresAt: integer("expires_at").notNull(),
}, t => [index("idx_google_flows_expiry").on(t.expiresAt)]);
export const googleAuthSessions = sqliteTable("google_auth_sessions", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), email: text("email").notNull(),
  fullName: text("full_name"), origin: text("origin").notNull(), createdAt: integer("created_at").notNull(), expiresAt: integer("expires_at").notNull(),
}, t => [index("idx_google_sessions_expiry").on(t.expiresAt)]);

export const voiceSettings = sqliteTable("voice_settings", {
  clientId:text("client_id").primaryKey().references(()=>clients.id),
  adminEnabled:integer("admin_enabled").notNull().default(0),clientEnabled:integer("client_enabled").notNull().default(0),
  testMode:integer("test_mode").notNull().default(1),
  businessName:text("business_name").notNull().default(""),
  businessContext:text("business_context").notNull().default(""),roleContext:text("role_context").notNull().default(""),
  language:text("language").notNull().default("Hindi"),dailyLimit:integer("daily_limit").notNull().default(20),
  startHour:integer("start_hour").notNull().default(10),endHour:integer("end_hour").notNull().default(18),
  maxAttempts:integer("max_attempts").notNull().default(2),revision:integer("revision").notNull().default(0),
  updatedAt:integer("updated_at").notNull(),updatedBy:text("updated_by").notNull(),
});
export const voiceCalls = sqliteTable("voice_calls", {
  id:text("id").primaryKey(),clientId:text("client_id").notNull().references(()=>clients.id),
  leadId:text("lead_id").notNull().references(()=>leads.id),phone:text("phone").notNull(),
  status:text("status").notNull().default("queued"),attempts:integer("attempts").notNull().default(0),
  nextAt:integer("next_at").notNull(),expiresAt:integer("expires_at").notNull(),
  activeAttemptId:text("active_attempt_id"),errorCode:text("error_code"),
  outcome:text("outcome"),summary:text("summary"),answers:text("answers"),
  createdAt:integer("created_at").notNull(),updatedAt:integer("updated_at").notNull(),
},t=>[uniqueIndex("idx_voice_calls_contact").on(t.clientId,t.phone),index("idx_voice_calls_due").on(t.status,t.nextAt),index("idx_voice_calls_client").on(t.clientId,t.createdAt)]);
export const voiceAttempts = sqliteTable("voice_attempts", {
  id:text("id").primaryKey(),clientId:text("client_id").notNull().references(()=>clients.id),callId:text("call_id").notNull().references(()=>voiceCalls.id),
  attemptNumber:integer("attempt_number").notNull(),providerId:text("provider_id"),
  tokenHash:text("token_hash").notNull(),status:text("status").notNull().default("dispatching"),
  contextSnapshot:text("context_snapshot").notNull(),settingsRevision:integer("settings_revision").notNull(),
  callerNumber:text("caller_number").notNull(),duration:integer("duration"),interactionId:text("interaction_id"),
  transcript:text("transcript"),resultHash:text("result_hash"),startedAt:integer("started_at").notNull(),finishedAt:integer("finished_at"),
},t=>[uniqueIndex("idx_voice_attempt_provider").on(t.providerId),uniqueIndex("idx_voice_attempt_number").on(t.callId,t.attemptNumber),index("idx_voice_attempt_client_time").on(t.clientId,t.startedAt)]);
export const voiceSuppression = sqliteTable("voice_suppression", {
  id:text("id").primaryKey(),clientId:text("client_id").notNull().references(()=>clients.id),phone:text("phone").notNull(),
  reason:text("reason").notNull(),createdAt:integer("created_at").notNull(),
},t=>[uniqueIndex("idx_voice_suppression_contact").on(t.clientId,t.phone)]);
