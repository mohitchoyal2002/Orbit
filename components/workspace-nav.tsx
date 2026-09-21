import { Activity, ArrowUpRight, GraduationCap, Inbox, LayoutDashboard, LogOut, PhoneCall } from "lucide-react";
import OrbitBrand from "./orbit-brand";

type Props = {
  active: "inbox" | "operations" | "admissions" | "tracking" | "calling";
  websiteHref: string;
  portalHref: string;
  studioHref?: string;
  owner?: boolean;
};

export default function WorkspaceNav({ active, websiteHref, portalHref, studioHref = "/studio", owner = false }: Props) {
  const links = [
    ...(owner ? [{ id: "inbox", title: "Inbox", href: studioHref, Icon: Inbox }] : []),
    { id: "operations", title: "Operations", href: portalHref, Icon: LayoutDashboard },
    { id: "admissions", title: "Admissions", href: "/coaching", Icon: GraduationCap },
    { id: "tracking", title: "Tracking", href: "/tracking", Icon: Activity },
    { id: "calling", title: "AI calling", href: "/calling", Icon: PhoneCall },
  ];
  return <header className="workspace-nav" data-workspace-nav>
    <OrbitBrand href={websiteHref}/>
    <div className="workspace-identity"><span>{owner ? "STUDIO" : "WORKSPACE"}</span><strong>{owner ? "Your control room" : "Your business, connected"}</strong></div>
    <nav className="workspace-tabs" aria-label="Workspace navigation" data-items={links.length}>
      {links.map(({ id, title, href, Icon }) => <a key={id} href={href} aria-current={active === id ? "page" : undefined}><Icon size={17}/><span>{title}</span></a>)}
    </nav>
    <div className="workspace-links">
      <a href={websiteHref} className="workspace-website">Website <ArrowUpRight size={16}/></a>
      <a className="workspace-signout" href="/logout" target="_top" aria-label="Sign out"><LogOut size={17}/><span>Sign out</span></a>
    </div>
    <div className="workspace-nav-caption">Less busywork.<br/><strong>More momentum.</strong></div>
  </header>;
}
