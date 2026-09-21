"use client";
import { useEffect, useRef, useState } from "react";

// Locally hosted brand films processed or generated in Higgsfield.
const films = {
  orbit: {
    desktop: "/videos/orbitflow-ambient-desktop.mp4",
    mobile: "/videos/orbitflow-ambient-mobile.mp4",
    poster: "/images/orbitflow-ambient-poster.jpg",
  },
  workspace: {
    desktop: "/videos/orbitflow-studio-desktop.mp4",
    mobile: "/videos/orbitflow-studio-mobile.mp4",
    poster: "/images/orbitflow-studio-poster.jpg",
  },
};

export default function CinematicMedia({ motion, scene = "orbit", active = true }: { motion: boolean; scene?: keyof typeof films; active?: boolean }) {
  const film = films[scene];
  const video = useRef<HTMLVideoElement>(null);
  const [source, setSource] = useState<string>();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = video.current;
    if (!element || failed) return;
    let visible = false;
    const sync = () => {
      if (!motion || !active || !visible || document.hidden) { element.pause(); return; }
      if (!source) {
        setSource(matchMedia("(max-width: 760px)").matches ? film.mobile : film.desktop);
        return;
      }
      element.play().catch(() => { /* The poster remains when autoplay is unavailable. */ });
    };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    observer.observe(element);
    document.addEventListener("visibilitychange", sync);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", sync); element.pause(); };
  }, [motion, source, failed, active, film]);

  return <>
    <img className="hero-poster" src={film.poster} alt="" width={1440} height={810} fetchPriority={scene === "orbit" ? "high" : "low"}/>
    <video ref={video} src={failed ? undefined : source} className="hero-video cinematic-video" data-ready={ready && !failed} muted loop playsInline preload="none" poster={film.poster} tabIndex={-1} aria-hidden="true" onPlaying={() => setReady(true)} onError={() => { setReady(false); setFailed(true); }}/>
  </>;
}
