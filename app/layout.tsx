import type { Metadata } from "next";
import "./globals.css";
import "./refinement.css";
import "./experience.css";
import "./glass.css";
import { ExperienceProvider } from "@/components/experience-provider";

export const metadata: Metadata = {
  title: "OrbitFlow — Your business, in a better flow.",
  description: "Practical AI automation for ambitious businesses. Connect your tools, follow up with leads and simplify customer support with OrbitFlow.",
  applicationName: "OrbitFlow",
  robots: { index: true, follow: true },
  openGraph: { title: "OrbitFlow — Your business, in a better flow.", description: "Lead follow-ups, customer support and connected workflows. Practical AI automation built around your business.", type: "website", siteName: "OrbitFlow" },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preload" href="/fonts/inter-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/plus-jakarta-sans-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body className="antialiased orbit-ui"><ExperienceProvider>{children}</ExperienceProvider></body>
    </html>
  );
}
