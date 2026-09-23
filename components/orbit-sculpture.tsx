"use client";

import { useEffect,useRef } from "react";

// A small real WebGL sculpture. Anime.js drives its Three.js meshes and ties
// the camera journey to the visitor's scroll; it is not part of the form flow.
export default function OrbitSculpture({motion}:{motion:boolean}) {
  const root=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const container=root.current;if(!container)return;
    let disposed=false;
    let cleanup=()=>{};
    void (async()=>{
      const [THREE,anime]=await Promise.all([import("three"),import("animejs")]);
      await import("animejs/adapters/three");
      if(disposed)return;
      let renderer:import("three").WebGLRenderer;
      try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:"low-power"});}catch{return;}
      renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
      renderer.outputColorSpace=THREE.SRGBColorSpace;
      container.appendChild(renderer.domElement);
      const scene=new THREE.Scene();
      const camera=new THREE.PerspectiveCamera(38,1,.1,30);camera.position.set(0,0,8);
      scene.add(new THREE.AmbientLight(0xffffff,1.3));
      const glow=new THREE.PointLight(0xff7949,85);glow.position.set(2,2,4);scene.add(glow);
      const rim=new THREE.PointLight(0xa9ccff,65);rim.position.set(-4,-1,2);scene.add(rim);
      const sculpture=new THREE.Group();scene.add(sculpture);
      const coreGeometry=new THREE.IcosahedronGeometry(.95,4);
      const core=new THREE.Mesh(coreGeometry,new THREE.MeshPhysicalMaterial({color:0x242b39,metalness:.9,roughness:.15,clearcoat:1,clearcoatRoughness:.08}));
      sculpture.add(core);
      const ringGeometry=new THREE.TorusGeometry(1.7,.055,12,132);
      const ringMaterial=new THREE.MeshStandardMaterial({color:0xff8854,metalness:.85,roughness:.24});
      const rings=[-55,32,104].map((angle,i)=>{const ring=new THREE.Mesh(ringGeometry,ringMaterial);ring.rotation.set(.35+i*.26,angle*Math.PI/180,i*.43);sculpture.add(ring);return ring;});
      const resize=()=>{const {width,height}=container.getBoundingClientRect();renderer.setSize(Math.max(1,width),Math.max(1,height),false);camera.aspect=Math.max(1,width)/Math.max(1,height);camera.updateProjectionMatrix();renderer.render(scene,camera);};
      const observer=new ResizeObserver(resize);observer.observe(container);resize();
      let frame=0,visible=true;
      const draw=()=>{if(disposed||!visible||document.hidden)return;renderer.render(scene,camera);frame=requestAnimationFrame(draw);};
      const visibility=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;if(frame)cancelAnimationFrame(frame);frame=0;if(visible)draw();});visibility.observe(container);
      const resume=()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else if(visible&&!frame)draw();};document.addEventListener("visibilitychange",resume);
      const animations:ReturnType<typeof anime.animate>[]=[];
      if(motion){
        animations.push(anime.animate(sculpture,{rotateY:165,rotateX:30,duration:1800,ease:"linear",autoplay:anime.onScroll({target:container,sync:true})}));
        animations.push(anime.animate(core,{rotateY:360,duration:24000,loop:true,ease:"linear"}));
        rings.forEach((ring,i)=>animations.push(anime.animate(ring,{rotateZ:i%2?160:-160,duration:34000+i*4700,loop:true,alternate:true,ease:"inOutSine"})));
      }
      cleanup=()=>{animations.forEach(a=>a.revert());cancelAnimationFrame(frame);observer.disconnect();visibility.disconnect();document.removeEventListener("visibilitychange",resume);coreGeometry.dispose();core.material.dispose();ringGeometry.dispose();ringMaterial.dispose();renderer.dispose();renderer.domElement.remove();};
    })();
    return()=>{disposed=true;cleanup();};
  },[motion]);
  return <div ref={root} className="orbit-sculpture" aria-hidden="true"/>;
}
