import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { SiteHeader } from "@/components/site-header";
import { IntroGate } from "@/components/intro-gate";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "ToVeno",
  description: "Private screen sharing controlled through Discord.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#09090b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={cn("dark font-sans", geist.variable)}>
      <body>
        <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
          <filter id="toveno-sketchy" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.012 0.05"
              numOctaves={2}
              seed={4}
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale={7}
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
          <filter id="toveno-sketchy-text" x="-15%" y="-15%" width="130%" height="130%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.03 0.09"
              numOctaves={2}
              seed={9}
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale={2.2}
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </svg>
        <IntroGate />
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
