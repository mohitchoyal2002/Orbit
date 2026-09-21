"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUpRight, CalendarDays, Check, CheckCheck, Sparkles } from "lucide-react";
import { storyFrame, storyTime } from "@/lib/scroll-story.mjs";

const chapters = [
  { title: "Capture the interest.", detail: "A student asks about a course. Their enquiry and contact permission stay together.", short: "Enquiry" },
  { title: "Give a useful answer.", detail: "Share approved course details. Route anything uncertain to a counsellor.", short: "Helpful reply" },
  { title: "Make the next step easy.", detail: "Offer a demo slot and keep the context ready for your team.", short: "Demo booking" },
];

export default function LeadFlowStory({ motion, onContact }: { motion: boolean; onContact: () => void }) {
  const root = useRef<HTMLElement>(null);
  const sticky = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const failed = useRef(false);
  const [source, setSource] = useState<string>();
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(2);

  useEffect(() => {
    const section = root.current;
    const panel = sticky.current;
    const visual = stage.current;
    const film = video.current;
    if (!section || !panel || !visual || !film) return;

    let frame = 0;
    let inView = false;
    let pinned = false;
    let targetProgress = 1;
    const seek = () => {
      if (!motion || !inView || document.hidden || failed.current || film.seeking || film.readyState < 2) return;
      const target = storyTime(film.duration, targetProgress);
      if (Math.abs(film.currentTime - target) > .06) {
        try { film.currentTime = target; } catch { /* A poster remains usable before metadata arrives. */ }
      }
    };
    const update = () => {
      frame = 0;
      if (!motion || document.hidden || !inView) return;
      const rect = (pinned ? section : visual).getBoundingClientRect();
      const state = storyFrame({ top: rect.top, height: rect.height, viewport: innerHeight, pinned });
      targetProgress = state.progress;
      section.style.setProperty("--story-progress", String(state.progress));
      section.style.setProperty("--reply-reveal", String(state.reply));
      section.style.setProperty("--booking-reveal", String(state.booking));
      setStep(previous => previous === state.step ? previous : state.step);
      seek();
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const resize = () => {
      // Tall content, small screens and zoomed layouts retain ordinary scrolling.
      pinned = motion && innerWidth >= 960 && innerHeight >= 760 && panel.offsetHeight <= innerHeight + 1;
      section.dataset.pinned = String(pinned);
      schedule();
    };
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      if (inView && motion && !failed.current) {
        setSource(previous => previous ?? (matchMedia("(max-width: 760px)").matches
          ? "/videos/orbitflow-journey-mobile.mp4"
          : "/videos/orbitflow-journey-desktop.mp4"));
      }
      schedule();
    }, { rootMargin: "120px 0px" });
    observer.observe(section);
    const measure = new ResizeObserver(resize);
    measure.observe(panel);
    film.addEventListener("loadeddata", schedule);
    film.addEventListener("seeked", schedule);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", schedule);
    resize();
    return () => {
      observer.disconnect();
      measure.disconnect();
      film.removeEventListener("loadeddata", schedule);
      film.removeEventListener("seeked", schedule);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", schedule);
      cancelAnimationFrame(frame);
      delete section.dataset.pinned;
      section.style.removeProperty("--story-progress");
      section.style.removeProperty("--reply-reveal");
      section.style.removeProperty("--booking-reveal");
    };
  }, [motion]);

  return <section ref={root} id="proof" className="proof-reel" data-film="story" data-step={motion ? step : 2} aria-labelledby="proof-title">
    <div ref={sticky} className="proof-reel-sticky">
      <div className="proof-film" aria-hidden="true">
        <img src="/images/orbitflow-journey-poster.jpg" alt="" width={1440} height={810} loading="lazy"/>
        <video ref={video} src={source} data-ready={motion && ready} muted playsInline preload={source ? "auto" : "none"} tabIndex={-1}
          poster="/images/orbitflow-journey-poster.jpg" onLoadedData={() => setReady(true)} onError={() => { failed.current = true; setReady(false); }}/>
      </div>
      <div className="proof-shade" aria-hidden="true"/>
      <div className="proof-content shell">
        <div className="proof-topline"><span className="eyebrow">A BETTER CUSTOMER JOURNEY</span><span className="proof-disclaimer">Simulated example · no messages sent</span></div>
        <div className="proof-layout">
          <div className="proof-copy">
            <h2 id="proof-title">One enquiry.<br/><span>A clear next step.</span></h2>
            <p>See how a coaching enquiry could move from first question to demo booking—with your team in control.</p>
            <ol className="proof-chapters">{chapters.map((chapter, index) => <li key={chapter.short} data-current={step === index}>
              <span className="proof-chapter-number">0{index + 1}</span><div><h3>{chapter.title}</h3><p>{chapter.detail}</p></div>
            </li>)}</ol>
            <button className="button button-primary" onClick={onContact}>Request a demo for my business <ArrowUpRight size={18}/></button>
          </div>
          <div ref={stage} className="proof-stage" aria-hidden="true">
            <div className="proof-caption">A new lead comes in.<strong>The right next step goes out.</strong></div>
            <div className="proof-device">
              <div className="proof-device-top"><span>ORBITFLOW / WORKFLOW PREVIEW</span><span>EXAMPLE</span></div>
              <div className="proof-lead"><span className="proof-avatar">A</span><div><small>NEW WEBSITE ENQUIRY</small><strong>Aarav · sample student</strong><p>“Can I get details on your program?”</p></div></div>
              <div className="proof-permission"><CheckCheck size={14}/>Follow-up permission recorded</div>
              <div className="proof-line"/><div className="proof-action proof-action-one"><span><Sparkles size={17}/></span><div><small>APPROVED COURSE INFORMATION</small><strong>Helpful details sent</strong></div><Check size={17}/></div>
              <div className="proof-line"/><div className="proof-action proof-action-two"><span><CalendarDays size={17}/></span><div><small>THE STUDENT CHOOSES</small><strong>Demo slot selected</strong></div><CheckCheck size={17}/></div>
              <div className="proof-status"><span><Check size={16}/></span><div><strong>Ready for your counsellor</strong><small>One enquiry. All the context.</small></div></div>
            </div>
          </div>
        </div>
        <div className="proof-bottom"><ol className="proof-rail" aria-label="Example stages">{chapters.map((chapter, index) => <li key={chapter.short} data-current={(motion ? step : 2) === index}><span>0{index + 1}</span>{chapter.short}</li>)}</ol><a href="#in-action">Try the interactive example <ArrowDown size={15}/></a></div>
      </div>
    </div>
  </section>;
}
