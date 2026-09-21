"use client";
import { useEffect, useState } from "react";
import OrbitBrand from "@/components/orbit-brand";
import { ArrowUpRight, CheckCircle2, Clock3, Code2, GraduationCap, MapPin, Play, ShieldCheck, Sparkles, UsersRound } from "lucide-react";

type Widget = {
  open?:()=>void;
  privacy?:()=>void;
  refresh?:()=>void;
  track?:(type:"cta_click"|"course_view",props:{action?:string;course?:string})=>void;
  getStatus:()=>{ready:boolean;analytics:boolean;error?:string;queuedEvents?:number};
};
export default function WidgetDemo({site}:{site:string|null}) {
  const [status,setStatus]=useState("Loading widget…");
  const [hostSubmitted,setHostSubmitted]=useState(false);
  function widget(){return (window as unknown as {OrbitFlowWidget?:Widget}).OrbitFlowWidget;}
  useEffect(()=>{
    if(!site)return;
    const sync=()=>{const state=widget()?.getStatus();setStatus(state?.ready?state.analytics?`Analytics allowed${state.queuedEvents?` · ${state.queuedEvents} queued`:""}`:"Ready · analytics off":state?.error||"Loading widget…");};
    window.addEventListener("orbitflow:ready",sync);window.addEventListener("orbitflow:error",sync);
    const script=document.createElement("script");script.src="https://www.orbitflow.work/widget/v1.js";script.dataset.orbitSite=site;script.defer=true;document.body.appendChild(script);
    const timer=setInterval(sync,2000);return()=>{clearInterval(timer);window.removeEventListener("orbitflow:ready",sync);window.removeEventListener("orbitflow:error",sync);};
  },[site]);
  useEffect(()=>{widget()?.refresh?.();},[]);
  const snippet=site?`<script src="https://www.orbitflow.work/widget/v1.js" data-orbit-site="${site}" defer></script>`:"";
  const openWidget=(action:string)=>{widget()?.track?.("cta_click",{action});widget()?.open?.();};
  return <main className="widget-preview"><header><OrbitBrand href="https://www.orbitflow.work"/><a href="/tracking">Tracking dashboard <ArrowUpRight size={16}/></a></header>
    <div className="widget-preview-banner"><ShieldCheck size={18}/><span>Dummy coaching website for OrbitFlow testing. Use fictional student details. Enquiries entered in the widget are saved; no WhatsApp or email is sent from this page.</span></div>
    {!site?<section className="widget-preview-intro"><h1>Start from your tracking workspace.</h1><p>Create a widget demo to get a working embed key.</p><a className="button button-primary" href="/tracking">Open tracking</a></section>:<>
      <section className="widget-preview-hero">
        <div className="widget-preview-intro"><span className="eyebrow orange">DUMMY COACHING WEBSITE</span><h1>Find the right tech course before the next batch starts.</h1><p>Scroll this page, open course cards, submit the sample form, and request a callback through the OrbitFlow widget. The tracking dashboard should show page views, scroll depth, course interest, CTA clicks, active time, form activity and the saved enquiry.</p><div><button className="button button-primary" data-orbit-action="hero-counselling" onClick={()=>openWidget("hero-counselling")}>Open course help <ArrowUpRight size={18}/></button><button className="button button-outline" onClick={()=>widget()?.privacy?.()}>Privacy settings</button></div><p role="status" className="widget-preview-status">{status}</p></div>
        <aside className="widget-preview-proof" aria-label="Tracking checklist"><Sparkles size={24}/><h2>Tracking test checklist</h2><ul>{["Allow analytics in privacy settings","Scroll to 75% of this page","Click at least one course CTA","Submit the sample host form","Use Course help to save a fake enquiry"].map(item=><li key={item}><CheckCircle2 size={17}/>{item}</li>)}</ul></aside>
      </section>
      <section className="widget-preview-film" data-orbit-video-wrap>
        <video data-orbit-video="dummy-campus-tour" src="/videos/orbitflow-workspace-mobile.mp4" poster="/images/orbitflow-workspace-poster.jpg" controls muted playsInline preload="metadata"/>
        <div><span className="eyebrow orange">WATCH SIGNAL</span><h2>Video progress is tracked too.</h2><p>Play this short sample. OrbitFlow records 25%, 50%, 75% and 100% progress as consented activity.</p><button className="button button-outline" data-orbit-action="watch-campus-tour" onClick={()=>widget()?.track?.("cta_click",{action:"watch-campus-tour"})}><Play size={17}/> Mark interest</button></div>
      </section>
      <section className="widget-preview-courses" aria-label="Sample courses">{[
        {id:"mern",name:"MERN Stack",copy:"For students who want React, Node.js, APIs, MongoDB and a portfolio-ready full-stack project.",stat:"8-week evening track",icon:Code2},
        {id:"data-science",name:"Data Science & AI",copy:"For Python learners who want data cleaning, dashboards, ML basics and guided project practice.",stat:"Weekend beginner batch",icon:Sparkles},
        {id:"java",name:"Java Full Stack",copy:"For students preparing for backend roles with Java, Spring-style concepts and interview practice.",stat:"Interview-focused path",icon:GraduationCap},
        {id:"python",name:"Python Django",copy:"For beginners who want programming fundamentals, web apps and deployment-ready assignments.",stat:"Foundation friendly",icon:UsersRound}
      ].map((course,i)=>{const Icon=course.icon;return <article key={course.id} data-orbit-course={course.id}><Icon size={28}/><span className="eyebrow">0{i+1} / SAMPLE COURSE</span><h2>{course.name}</h2><p>{course.copy}</p><small>{course.stat}</small><button data-orbit-action={`explore-${course.id}`} onClick={()=>openWidget(`explore-${course.id}`)}>Ask about this course <ArrowUpRight size={17}/></button></article>;})}</section>
      <section className="widget-preview-locations" data-orbit-course="automation-testing">
        <div><MapPin size={25}/><h2>Sample centres</h2><p>Bhawarkua and Vijay Nagar style centre cards let you test location interest without using real institute data.</p></div>
        <button data-orbit-action="location-bhawarkua" onClick={()=>openWidget("location-bhawarkua")}>Bhawarkua batch</button>
        <button data-orbit-action="location-vijay-nagar" onClick={()=>openWidget("location-vijay-nagar")}>Vijay Nagar batch</button>
      </section>
      <section className="widget-preview-form">
        <div><Clock3 size={28}/><span className="eyebrow orange">HOST FORM SIGNAL</span><h2>Test the host website form event.</h2><p>This sample form only records `form_start` and `form_submit` signals. The typed values stay on this dummy page. For contact capture, use the floating OrbitFlow widget.</p></div>
        <form data-orbit-form="dummy-admissions" onSubmit={e=>{e.preventDefault();setHostSubmitted(true);widget()?.track?.("cta_click",{action:"host-form-submit"});}}>
          <label>Name<input name="name" autoComplete="off" placeholder="Test Student"/></label>
          <label>Interested course<select name="course" defaultValue="mern"><option value="mern">MERN Stack</option><option value="data-science">Data Science & AI</option><option value="java">Java Full Stack</option><option value="python">Python Django</option></select></label>
          <button className="button button-primary" type="submit" data-orbit-action="host-form-submit">Submit sample host form</button>
          {hostSubmitted&&<p role="status"><CheckCircle2 size={16}/> Host form interaction sent. Now open the widget to save a real test enquiry.</p>}
        </form>
      </section>
      <section className="widget-preview-install">
        <h2>Embed under test</h2><p>This page loads the same public script pattern you pasted. The source is absolute so it behaves like a coaching website using OrbitFlow.</p><pre>{snippet}</pre>
      </section>
      <section className="widget-preview-last"><GraduationCap size={38}/><h2>Now save a fake enquiry.</h2><p>Click Course help, fill a fictional name and phone number, accept callback consent, and submit. The enquiry should appear in Tracking and Admissions.</p><button className="button button-primary" data-orbit-action="footer-callback" onClick={()=>openWidget("footer-callback")}>Request a callback</button><p className="widget-preview-status">This is an OrbitFlow demonstration, not an official coaching institute page.</p></section>
    </>}
  </main>;
}
