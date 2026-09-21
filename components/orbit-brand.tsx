export default function OrbitBrand({ href = "/" }: { href?: string }) {
  return <a className="orbit-brand" href={href} aria-label="OrbitFlow home">
    <OrbitMark/>
    <span>Orbit<span className="brand-flow">Flow</span></span>
  </a>;
}

export function OrbitMark({small=false}:{small?:boolean}) {
  return <svg className={`orbitflow-symbol${small?" small":""}`} viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <path d="M37 19a14 14 0 1 0-9 18" stroke="currentColor" strokeWidth="5" strokeLinecap="round"/>
    <path d="M8 35c6-1 12-6 18-12s10-9 15-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
    <circle cx="36" cy="33" r="4" fill="currentColor"/>
  </svg>;
}
