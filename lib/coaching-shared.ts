// Public course summaries checked 9 September 2026: https://www.programmerspoint.in/
// Prospect demonstration only. Fees, batch dates and placement guarantees are not verified.
export const coachingCourses = [
  {id:"mern",name:"MERN Stack",summary:"React, Node.js, Express and MongoDB for web applications."},
  {id:"data-science",name:"Data Science & AI/ML",summary:"Python, data analysis and machine learning with practical projects."},
  {id:"data-analytics",name:"Data Analytics",summary:"Excel, SQL, Power BI and Python for analysing business data."},
  {id:"java",name:"Java Full Stack",summary:"Java, Spring Boot, APIs, React and databases."},
  {id:"python",name:"Python Django",summary:"Python and Django for backend and web development."},
  {id:"testing",name:"Automation Testing",summary:"Selenium, API testing, TestNG and quality assurance workflows."},
] as const;
export const coachingStages = ["new","replied","booked","attended","enrolled","lost"] as const;
export const stageLabels:Record<string,string>={new:"New enquiry",replied:"Replied",booked:"Demo booked",attended:"Attended",enrolled:"Enrolled",lost:"Closed / lost"};
export const courseName=(id:string)=>coachingCourses.find(c=>c.id===id)?.name||"Course counselling";
export const indiaTime=(at:number)=>new Intl.DateTimeFormat("en-IN",{timeZone:"Asia/Kolkata",dateStyle:"medium",timeStyle:"short"}).format(at)+" IST";
export const DEMO_CLIENT="be29a896-ff9a-4b1c-9bd6-a3b4a2c5418c";
export type Student={id:string;name:string;phone:string;email:string;course:string;centre:string;learning_mode:string;background:string;source:string;stage:string;assigned_to:string;handoff:number;consent_at:number|null;consent_evidence:string;opted_out_at:number|null;last_inbound_at:number|null;follow_up_at:number|null;created_at:number};
export type CoachingMessage={id:string;lead_id:string;direction:string;kind:string;body:string;status:string;error_code:string|null;send_at:number;created_at:number};
export type CoachingSlot={id:string;course:string;centre:string;starts_at:number;capacity:number;booked:number};
export type CoachingBooking={id:string;lead_id:string;slot_id:string;status:string;starts_at:number;course:string;centre:string};
export type CoachingData={client:{id:string;name:string};owner:boolean;demo:boolean;students:Student[];messages:CoachingMessage[];slots:CoachingSlot[];bookings:CoachingBooking[];total:number;hasMore:boolean;page:number;metrics:{leads:number;replied:number;booked:number;attended:number;enrolled:number;handoff:number};connections:{whatsapp:boolean;hubspot:boolean;gemini:boolean};};
