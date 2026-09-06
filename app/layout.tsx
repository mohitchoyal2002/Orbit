import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Orbit — Less busywork. More business.",
  description: "Practical AI automation for ambitious businesses. Connect your tools, follow up with leads and simplify customer support with Orbit Studio.",
  applicationName: "Orbit Studio",
  robots: { index: true, follow: true },
  openGraph: { title: "Orbit — Less busywork. More business.", description: "Human ambition. Intelligent execution. Practical AI automation for your business.", type: "website", siteName: "Orbit Studio" },
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
      <body className="antialiased">{children}</body>
    </html>
  );
}
