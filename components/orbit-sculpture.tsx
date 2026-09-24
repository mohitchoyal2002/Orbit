"use client";

import { useEffect, useRef } from "react";

type Variant = "orbit" | "signal" | "flow";

// Lazy 3D scenes, with Anime.js scroll timelines and no off-screen render loop.
export default function OrbitSculpture({ motion, variant = "orbit" }: { motion: boolean; variant?: Variant }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = root.current;
    if (!host) return;
    if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
    let disposed = false, started = false;
    let destroy = () => {};
    const start = async () => {
      if (started || disposed) return;
      started = true;
      try {
        const [T, { RoomEnvironment }, A] = await Promise.all([
          import("three"), import("three/addons/environments/RoomEnvironment.js"), import("animejs"),
        ]);
        if (disposed) return;
        let renderer: import("three").WebGLRenderer;
        try { renderer = new T.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" }); }
        catch { return; }
        const compact = matchMedia("(max-width: 760px)").matches;
        renderer.setPixelRatio(Math.min(devicePixelRatio || 1, compact ? 1.2 : 1.6));
        renderer.setClearColor(0x000000, 0);
        renderer.outputColorSpace = T.SRGBColorSpace;
        renderer.toneMapping = T.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.2;
        host.appendChild(renderer.domElement);
        destroy = () => { renderer.dispose(); renderer.domElement.remove(); };
        const scene = new T.Scene();
        const camera = new T.PerspectiveCamera(36, 1, .1, 40);
        camera.position.set(0, 0, 9);
        const environment = new RoomEnvironment();
        const pmrem = new T.PMREMGenerator(renderer);
        const env = pmrem.fromScene(environment, .04);
        scene.environment = env.texture;
        environment.dispose(); pmrem.dispose();
        const copper = new T.MeshPhysicalMaterial({ color: 0xff7949, metalness: .86, roughness: .23, clearcoat: 1 });
        const chrome = new T.MeshPhysicalMaterial({ color: 0xb8cadb, metalness: 1, roughness: .18, clearcoat: 1 });
        const dark = new T.MeshPhysicalMaterial({ color: 0x151e2d, metalness: .8, roughness: .22, clearcoat: 1 });
        const glow = new T.MeshStandardMaterial({ color: 0xffaf79, emissive: 0xff612a, emissiveIntensity: .8 });
        const geometries: import("three").BufferGeometry[] = [];
        const model = new T.Group(), drift = new T.Group();
        scene.add(drift); drift.add(model);
        const mesh = (geometry: import("three").BufferGeometry, material: import("three").Material, group = model) => {
          geometries.push(geometry); const part = new T.Mesh(geometry, material); group.add(part); return part;
        };
        const moving: import("three").Object3D[] = [];
        if (variant === "orbit") {
          mesh(new T.IcosahedronGeometry(.82, 3), dark);
          for (let i = 0; i < 3; i++) {
            const ring = mesh(new T.TorusGeometry(1.48 + i * .18, .10 - i * .016, 12, 100), i === 1 ? copper : chrome);
            ring.rotation.set(.6 + i * .62, i * .6, i * .38); moving.push(ring);
          }
          for (let i = 0; i < 6; i++) {
            const bead = mesh(new T.SphereGeometry(i === 0 ? .18 : .09, 16, 12), i % 2 ? chrome : glow);
            bead.position.set(Math.cos(i * Math.PI / 3) * 2.02, Math.sin(i * Math.PI / 3) * 1.7, Math.sin(i * 2) * .6);
          }
        } else if (variant === "signal") {
          const positions = Array.from({ length: 9 }, (_, i) => new T.Vector3(Math.cos(i * 2.4) * (i ? 1.7 : 0), (i - 4) * .38, Math.sin(i * 2.4) * 1.3));
          positions.forEach((position, i) => {
            const node = mesh(new T.IcosahedronGeometry(i === 4 ? .48 : .23, 1), i % 3 ? chrome : copper); node.position.copy(position);
            if (i) {
              const curve = new T.CatmullRomCurve3([positions[i - 1], positions[i - 1].clone().lerp(position, .5).add(new T.Vector3(.15, .25, .2)), position]);
              mesh(new T.TubeGeometry(curve, 24, .026, 6, false), copper);
            }
          });
          const ring = mesh(new T.TorusGeometry(2.1, .023, 8, 100), chrome); ring.rotation.x = 1.2; moving.push(ring);
        } else {
          for (let i = 0; i < 7; i++) {
            const ring = mesh(new T.TorusGeometry(1.38, .075, 12, 96), i % 3 === 0 ? copper : chrome);
            ring.position.z = (i - 3) * .24;
            ring.rotation.set(i * .16, i * .18, i * .12); moving.push(ring);
          }
          mesh(new T.OctahedronGeometry(.56, 0), glow);
        }
        model.rotation.set(.12, -.35, -.18);
        scene.add(new T.HemisphereLight(0xdceaff, 0x442012, 2));
        const rim = new T.PointLight(0xff855a, 28); rim.position.set(3, 2, 3); scene.add(rim);
        let frame = 0, visible = false, last = 0, elapsed = 0, lost = false;
        const render = () => { if (!disposed && !lost) renderer.render(scene, camera); };
        const draw = (time: number) => {
          frame = 0;
          if (disposed || !visible || document.hidden || lost || !motion) return;
          const dt = last ? Math.min(time - last, 40) : 0; last = time; elapsed += dt;
          drift.rotation.y = Math.sin(elapsed * .00017) * .13;
          drift.position.y = Math.sin(elapsed * .0006) * .075;
          moving.forEach((part, i) => { part.rotation.z += dt * .000035 * (i % 2 ? -1 : 1); });
          render(); frame = requestAnimationFrame(draw);
        };
        const stop = () => { cancelAnimationFrame(frame); frame = 0; last = 0; };
        const resume = () => { stop(); if (visible && !document.hidden && motion && !lost) frame = requestAnimationFrame(draw); else render(); };
        const resize = () => { const box = host.getBoundingClientRect(); renderer.setSize(Math.max(1, box.width), Math.max(1, box.height), false); camera.aspect = Math.max(1, box.width) / Math.max(1, box.height); camera.updateProjectionMatrix(); render(); };
        const measure = new ResizeObserver(resize); measure.observe(host); resize();
        const visibility = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; resume(); }); visibility.observe(host);
        document.addEventListener("visibilitychange", resume);
        const lostContext = (event: Event) => { event.preventDefault(); lost = true; stop(); host.dataset.ready = "false"; };
        renderer.domElement.addEventListener("webglcontextlost", lostContext);
        let scroll: ReturnType<typeof A.onScroll> | undefined;
        let timeline: ReturnType<typeof A.createTimeline> | undefined;
        destroy = () => {
          stop(); timeline?.revert(); scroll?.revert(); measure.disconnect(); visibility.disconnect();
          document.removeEventListener("visibilitychange", resume);
          renderer.domElement.removeEventListener("webglcontextlost", lostContext);
          geometries.forEach(g => g.dispose()); [copper, chrome, dark, glow].forEach(m => m.dispose());
          env.dispose(); renderer.dispose(); renderer.domElement.remove(); delete host.dataset.ready;
        };
        if (motion) {
          scroll = A.onScroll({ target: host.closest("section") || host, enter: "bottom top", leave: "top bottom", sync: .6 });
          timeline = A.createTimeline({ autoplay: scroll, defaults: { duration: 1200, ease: "linear" }, onUpdate: () => { if (visible && !document.hidden) render(); } })
            .add(model.rotation, { y: [-.6, 1.25], x: [.12, -.35], z: [-.18, .3] }, 0)
            .add(camera.position, { z: [9.2, 7.3] }, 0);
        }
        host.dataset.ready = "true";
      } catch { destroy(); /* The supplied poster remains the complete fallback. */ }
    };
    const near = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { void start(); near.disconnect(); } }, { rootMargin: "250px" });
    near.observe(host);
    return () => { disposed = true; near.disconnect(); destroy(); };
  }, [motion, variant]);
  return <div ref={root} className={`orbit-sculpture sculpture-${variant}`} aria-hidden="true">
    <img className="sculpture-fallback" src="/images/orbitflow-journey-poster.jpg" alt="" loading="lazy" width={1440} height={810}/>
  </div>;
}
