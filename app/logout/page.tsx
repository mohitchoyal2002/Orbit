import type { Metadata } from "next";
import OrbitBrand from "@/components/orbit-brand";
export const metadata:Metadata={title:"Sign out — OrbitFlow",robots:{index:false,follow:false}};
export default function Page(){return <main className="legal-page shell"><OrbitBrand/><h1>Sign out of this workspace?</h1><p>This ends your OrbitFlow session on this subdomain.</p><form method="post" action="/api/auth/signout"><button className="button button-primary" type="submit">Sign out</button></form><a className="button button-outline" href="/">Back to workspace</a></main>}
