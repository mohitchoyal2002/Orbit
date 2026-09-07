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
