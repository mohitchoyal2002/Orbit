import type { Metadata } from "next";
import StudioWorkspace from "./workspace";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Project inbox — OrbitFlow", robots: { index: false, follow: false } };
export default function Studio() { return <StudioWorkspace />; }
