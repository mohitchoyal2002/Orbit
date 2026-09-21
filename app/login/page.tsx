import type { Metadata } from "next";
import { chatGPTSignInPath } from "@/app/chatgpt-auth";
import { googleConfigured } from "@/lib/google-auth";
import { safeReturnPath } from "@/lib/auth-paths";
import { siteSurface } from "@/lib/site-surface";
import OrbitBrand from "@/components/orbit-brand";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import "./login.css";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Sign in — OrbitFlow",robots:{index:false,follow:false}};
const errors:Record<string,string>={"google-unavailable":"Google sign-in is not connected yet. You can continue with ChatGPT.","try-again":"Sign-in could not be completed. Please try again with a Gmail or Google Workspace account.",cancelled:"Google sign-in was cancelled. Choose an account to try again."};
export default async function Page({searchParams}:{searchParams:Promise<{return_to?:string;error?:string}>}) {
  const p=await searchParams,{surface,navigation}=await siteSurface(),returnTo=safeReturnPath(p.return_to,surface==="marketing"?"/portal":"/"),ready=googleConfigured();
  return <main className="auth-page"><header><OrbitBrand href={navigation.websiteHref}/><a href={navigation.websiteHref}>Back to website <ArrowUpRight size={16}/></a></header>
    <section className="auth-layout"><div className="auth-intro"><span className="eyebrow orange">YOUR WORK, IN FLOW.</span><h1>Less juggling.<br/><span>More in flow.</span></h1><p>Your leads, follow-ups and website insights. All in your OrbitFlow workspace.</p><div className="auth-features"><span>Capture enquiries</span><span>Understand interest</span><span>Keep follow-ups moving</span></div><img className="auth-art" src="/images/orbitflow-studio-poster.jpg" alt="" width={720} height={405}/></div>
    <div className="auth-card"><span className="auth-label">{surface==="admin"?"OWNER WORKSPACE":"CLIENT WORKSPACE"}</span><h2>Welcome to OrbitFlow.</h2><p>Sign in with the account that has access to your workspace.</p>{p.error&&errors[p.error]&&<p className="auth-error" role="alert">{errors[p.error]}</p>}
      {ready?<a className="auth-google" href={`/api/auth/google/start?return_to=${encodeURIComponent(returnTo)}`} target="_top"><GoogleMark/>Continue with Google</a>:<><button className="auth-google" disabled><GoogleMark/>Continue with Google</button><p className="auth-setup">Google sign-in is being connected.</p></>}
      <div className="auth-divider"><span>or</span></div><a className="auth-chatgpt" href={chatGPTSignInPath(returnTo)} target="_top">Continue with ChatGPT <ArrowUpRight size={16}/></a>
      <div className="auth-access"><ShieldCheck size={20}/><p>Signing in identifies you. Your workspace invitation determines what you can access.</p></div><p className="auth-privacy">We use your name and verified email to sign you in. <a href={navigation.websiteHref.replace(/\/$/,"")+"/privacy"}>Privacy</a></p>
    </div></section><footer>OrbitFlow · AI workflows that capture, follow up, and convert leads.</footer></main>;
}
function GoogleMark(){return <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.02 46.98 31.86 46.98 24.55Z"/><path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24 24 0 0 0 0 21.56l7.98-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg>}
