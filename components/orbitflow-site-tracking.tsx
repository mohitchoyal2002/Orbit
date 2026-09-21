"use client";

import { useEffect } from "react";

// Public widget key: it identifies the marketing-site configuration and contains no secret.
const marketingSite = "a17be54e-8a9f-4700-9e5e-0ec2110717cc";

export default function OrbitFlowSiteTracking() {
  useEffect(() => {
    if (document.querySelector(`script[data-orbit-site="${marketingSite}"]`)) return;

    const script = document.createElement("script");
    script.src = "/widget/v1.js";
    script.async = false;
    script.dataset.orbitSite = marketingSite;
    script.dataset.orbitMode = "analytics";
    script.dataset.orbitLoader = "marketing";
    document.body.appendChild(script);
  }, []);

  return null;
}
