// Safe for browser imports. Never put credentials or provider clients here.
export const workflowTemplates = [
  { key: "crm.sync", name: "Lead → HubSpot", description: "Create or update a contact when a lead arrives." },
  { key: "email.alert", name: "Lead → email alert", description: "Notify the configured team inbox about a new lead." },
] as const;
export const onboardingItems = [
  { key: "scope", label: "Agree the workflow scope and success measures" },
  { key: "baseline", label: "Record the current response time and lead process" },
  { key: "access", label: "Confirm client access and integration permissions" },
  { key: "consent", label: "Agree consent, retention and opt-out handling" },
  { key: "providers", label: "Connect providers and confirm an approved WhatsApp template" },
  { key: "pilot", label: "Complete a test lead and check provider delivery" },
  { key: "handover", label: "Agree monitoring ownership and client handover" },
] as const;
export const leadStatuses = ["new", "contacted", "qualified", "won", "lost"] as const;
export const requestCategories = ["Lead capture", "Follow-ups", "Reporting", "Integrations", "Team access", "Billing"] as const;
export type Lead = {id:string;name:string;email:string;phone:string;brief:string;status:string;consent_evidence:string;consent_at:number|null;opted_out_at:number|null;first_response_at:number|null;follow_up_at:number|null;created_at:number};
