import type { Metadata } from "next";
import { requireUser } from "@/app/auth";
import { siteSurface } from "@/lib/site-surface";
import TrackingDashboard from "./dashboard";
import "./tracking.css";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Website tracking — OrbitFlow",robots:{index:false,follow:false}};
export default async function Page(){await requireUser("/tracking");const {navigation}=await siteSurface();return <TrackingDashboard navigation={navigation}/>;}
