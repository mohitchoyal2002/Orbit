"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Pause, Play } from "lucide-react";

const Experience = createContext({ motion: false, toggleMotion: () => {} });
export const useExperience = () => useContext(Experience);

export function ExperienceProvider({ children }: { children: ReactNode }) {
  const [motion, setMotion] = useState(false);
  const enabled = useRef(false);
  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const sync = () => {
      let choice = null;
      try { choice = localStorage.getItem("orbit-motion"); } catch { /* Device storage is optional. */ }
      setMotion(!reduced.matches && !connection?.saveData && choice !== "off");
    };
    sync();
    reduced.addEventListener("change", sync);
    window.addEventListener("storage", sync);
    return () => { reduced.removeEventListener("change", sync); window.removeEventListener("storage", sync); };
  }, []);
  useEffect(() => {
    enabled.current = motion;
    document.documentElement.dataset.motion = motion ? "on" : "off";
    return () => { delete document.documentElement.dataset.motion; };
  }, [motion]);

  // These visual effects never intercept clicks, change focus or record activity.
  useEffect(() => {
    let frame = 0;
    let target: HTMLElement | null = null;
    let x = 0, y = 0;
    const fine = matchMedia("(hover: hover) and (pointer: fine)");
    const reset = () => {
      target?.style.removeProperty("--pointer-x"); target?.style.removeProperty("--pointer-y");
      target?.style.removeProperty("--magnet-x"); target?.style.removeProperty("--magnet-y");
      target = null;
    };
    const move = (event: PointerEvent) => {
      if (!enabled.current || !fine.matches || event.pointerType !== "mouse") { reset(); return; }
      const next = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-magnetic], [data-spotlight]") : null;
      if (next !== target) { reset(); target = next; }
      if (!target) return;
      x = event.clientX; y = event.clientY;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!target || !enabled.current) return;
        const bounds = target.getBoundingClientRect();
        target.style.setProperty("--pointer-x", `${x - bounds.left}px`);
        target.style.setProperty("--pointer-y", `${y - bounds.top}px`);
        if (target.hasAttribute("data-magnetic")) {
          target.style.setProperty("--magnet-x", `${Math.max(-5, Math.min(5, (x - bounds.left - bounds.width / 2) * .09))}px`);
          target.style.setProperty("--magnet-y", `${Math.max(-4, Math.min(4, (y - bounds.top - bounds.height / 2) * .09))}px`);
        }
      });
    };
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", reset);
    window.addEventListener("blur", reset);
    return () => { cancelAnimationFrame(frame); reset(); document.removeEventListener("pointermove", move); document.removeEventListener("pointerleave", reset); window.removeEventListener("blur", reset); };
  }, []);
  function toggleMotion() {
    // An explicit pause always wins; operating-system reduced motion stays respected.
    const next = !motion && !matchMedia("(prefers-reduced-motion: reduce)").matches;
    setMotion(next);
    try { localStorage.setItem("orbit-motion", next ? "on" : "off"); } catch { /* Optional preference. */ }
  }
  return <Experience.Provider value={{ motion, toggleMotion }}>
    {children}
    <button className="experience-motion" onClick={toggleMotion} aria-pressed={motion} aria-label={motion ? "Pause animations" : "Enable animations (respects reduced motion)"}>
      {motion ? <Pause size={14}/> : <Play size={14}/>}<span>{motion ? "Motion on" : "Motion off"}</span>
    </button>
  </Experience.Provider>;
}
