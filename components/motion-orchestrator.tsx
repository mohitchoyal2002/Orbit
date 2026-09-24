"use client";

import { useEffect } from "react";
import { animate, createTimeline, onScroll, stagger } from "animejs";

const revealSelector = "[data-reveal], .voice-card, .op-panel, .inbox-stats > div, .op-metrics > div, .ca-metrics > div, .wt-metrics > div, .wt-insights > section, .widget-preview-courses article, .auth-card, [data-slot=tabs-content], [role=status].op-notice, .op-error, .ca-notice, .wt-notice";

export default function MotionOrchestrator({ motion }: { motion: boolean }) {
  useEffect(() => {
    if (!motion) return;
    const seen = new WeakSet<Element>();
    const effects = new Set<ReturnType<typeof animate>>();
    const scrolls: ReturnType<typeof onScroll>[] = [];
    const timelines: ReturnType<typeof createTimeline>[] = [];
    let scanFrame = 0;
    const play = (target: Element) => {
      const effect = animate(target, { opacity: [0, 1], y: [18, 0], duration: 520, ease: "out(3)", onComplete: self => { effects.delete(self); self.revert(); } });
      effects.add(effect);
    };
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        if (entry.target.getBoundingClientRect().top > 15) play(entry.target);
      });
    }, { threshold: .08 });
    const scan = () => {
      scanFrame = 0;
      document.querySelectorAll(revealSelector).forEach(el => {
        if (seen.has(el)) return;
        seen.add(el); observer.observe(el);
      });
    };
    scan();
    const changes = new MutationObserver(() => { if (!scanFrame) scanFrame = requestAnimationFrame(scan); });
    changes.observe(document.body, { childList: true, subtree: true });
    const hero = document.querySelector(".hero-content");
    if (hero) {
      const timeline = createTimeline({ defaults: { ease: "out(4)" } })
        .add(hero.querySelectorAll(".hero-kicker, h1 > span"), { opacity: [0, 1], y: [36, 0], duration: 900, delay: stagger(110) }, 0)
        .add(hero.querySelectorAll(".hero-description, .hero-footnote, .hero-actions"), { opacity: [0, 1], y: [18, 0], duration: 650, delay: stagger(65) }, 280);
      timelines.push(timeline);
    }
    document.querySelectorAll<HTMLElement>(".process-step").forEach(el => {
      const scroll = onScroll({ target: el, enter: "bottom 85%", leave: "top 25%", sync: true });
      scrolls.push(scroll);
      effects.add(animate(el, { "--step-fill": [0, 1], duration: 1000, ease: "linear", autoplay: scroll }));
    });
    const press = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && (event.repeat || !["Enter", " "].includes(event.key))) return;
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("button, [role=tab], .button, .workspace-tabs a") : null;
      if (!target || target.matches(":disabled,[aria-disabled=true]") || target.classList.contains("experience-motion")) return;
      const icon = target.querySelector("svg");
      if (icon) {
        const effect = animate(icon, { scale: [1, .78, 1], rotate: [0, -9, 0], duration: 400, ease: "out(3)", onComplete: self => { effects.delete(self); self.revert(); } });
        effects.add(effect);
      }
      const flare = document.createElement("span"); flare.className = "action-flare"; flare.setAttribute("aria-hidden", "true");
      const box = target.getBoundingClientRect();
      flare.style.left = `${event instanceof PointerEvent ? event.clientX : box.left + box.width / 2}px`;
      flare.style.top = `${event instanceof PointerEvent ? event.clientY : box.top + box.height / 2}px`;
      document.body.appendChild(flare);
      const effect = animate(flare, { scale: [.2, 3], opacity: [.32, 0], duration: 550, ease: "out(3)", onComplete: self => { effects.delete(self); flare.remove(); } });
      effects.add(effect);
    };
    document.addEventListener("pointerdown", press, { passive: true });
    document.addEventListener("keydown", press);
    return () => {
      cancelAnimationFrame(scanFrame); changes.disconnect(); observer.disconnect();
      document.removeEventListener("pointerdown", press); document.removeEventListener("keydown", press);
      timelines.forEach(t => t.revert()); effects.forEach(e => e.revert()); scrolls.forEach(s => s.revert());
      document.querySelectorAll(".action-flare").forEach(el => el.remove());
    };
  }, [motion]);
  return null;
}
