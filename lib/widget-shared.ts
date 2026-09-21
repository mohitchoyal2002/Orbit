export const WIDGET_CONSENT_VERSION = "orbit-widget-2026-09-v1";
export const ANALYTICS_NOTICE = "Allow this coaching institute and OrbitFlow to save pages visited, course interactions, scroll depth and active time, and link this activity to an enquiry you submit. No typed fields or screen recordings are collected. Optional; you can enquire without allowing analytics.";
export const CONTACT_NOTICE = "I agree that this institute may store my submitted details in OrbitFlow and contact me about this enquiry by phone or email.";
export const WHATSAPP_NOTICE = "Also send me course information and follow-ups on WhatsApp. I can reply STOP to opt out.";
export const widgetCourseIds = ["mern","data-science","data-analytics","java","python","testing","undecided"] as const;
export type WidgetSite = {id:string;client_id:string;name:string;origins:string;privacy_url:string;courses:string;color:string;enabled:number;retention_days:number;created_at:number;updated_at:number};
export type WidgetCourse = {id:typeof widgetCourseIds[number];label:string};
export const defaultWidgetCourses:WidgetCourse[] = [{id:"mern",label:"Full-stack development"},{id:"data-science",label:"Data science"},{id:"data-analytics",label:"Data analytics"},{id:"java",label:"Java"},{id:"python",label:"Python"},{id:"testing",label:"Software testing"},{id:"undecided",label:"Help me choose"}];
export function embedCode(id:string,origin="https://www.orbitflow.work") {
  return `<script src="${origin}/widget/v1.js" data-orbit-site="${id}" defer></script>`;
}
