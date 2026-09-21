import type { Metadata } from "next";
import ClientWorkspace from "./workspace";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Client workspace — OrbitFlow",robots:{index:false,follow:false}};
export default function Page(){return <ClientWorkspace/>;}
