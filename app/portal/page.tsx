import type { Metadata } from "next";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import Portal from "./portal";
import "./portal.css";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Client workspace — Orbit Studio",robots:{index:false,follow:false}};
export default async function Page(){await requireChatGPTUser("/portal");return <Portal/>;}
