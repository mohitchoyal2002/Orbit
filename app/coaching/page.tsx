import type { Metadata } from "next";
import { requireUser } from "@/app/auth";
import CoachingDashboard from "./dashboard";
import "./coaching.css";
import { siteSurface } from "@/lib/site-surface";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Coaching admissions — OrbitFlow",robots:{index:false,follow:false}};
export default async function Page(){await requireUser("/coaching");const { navigation } = await siteSurface();return <CoachingDashboard navigation={navigation}/>;}
