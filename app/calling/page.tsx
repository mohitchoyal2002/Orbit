import type { Metadata } from "next";
import { requireUser } from "@/app/auth";
import { siteSurface } from "@/lib/site-surface";
import CallingDashboard from "./dashboard";
import "../portal/portal.css";
import "./calling.css";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"AI calling — OrbitFlow",robots:{index:false,follow:false}};
export default async function Page(){await requireUser("/calling");const {navigation}=await siteSurface();return <CallingDashboard navigation={navigation}/>;}
