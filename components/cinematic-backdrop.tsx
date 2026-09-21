"use client";
import { useEffect, useRef } from "react";
import CinematicMedia from "./cinematic-media";

export type FilmScene = "hero" | "orbit" | "workspace" | "story";

export default function CinematicBackdrop({ motion, scene }: { motion: boolean; scene: FilmScene }) {
  const backdrop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!motion) return;
    const layer = backdrop.current;
    let frame = 0;
    const scroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        layer?.style.setProperty("--ambient-drift", `${Math.sin(window.scrollY / 1500) * 24}px`);
        frame = 0;
      });
    };
    window.addEventListener("scroll", scroll, { passive: true });
    scroll();
    return () => { window.removeEventListener("scroll", scroll); cancelAnimationFrame(frame); layer?.style.removeProperty("--ambient-drift"); };
  }, [motion]);
  return <div ref={backdrop} className="cinematic-backdrop" aria-hidden="true">
    <div className="ambient-scene" data-active={scene === "orbit"}><CinematicMedia scene="orbit" active={scene === "orbit"} motion={motion}/></div>
    <div className="ambient-scene scene-workspace" data-active={scene === "workspace"}><CinematicMedia scene="workspace" active={scene === "workspace"} motion={motion}/></div>
    <div className="ambient-shade"/>
  </div>;
}
