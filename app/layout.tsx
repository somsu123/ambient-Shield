import React from "react";
import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ambient Shield — Autonomous Verification & Privacy Engine",
  description:
    "Zero-cloud local verification engine. Analyze privacy policies, spot job scams, fact-check claims, and detect manipulated media with 100% on-device local intelligence.",
  keywords: [
    "privacy policy analyzer",
    "deepfake detector",
    "misinformation scanner",
    "job scam verifier",
    "cybersecurity",
    "local AI",
  ],
  authors: [{ name: "Ambient Shield" }],
  openGraph: {
    title: "Ambient Shield — Zero-Cloud Digital Protector",
    description:
      "100% local privacy and credibility analysis running privately on your machine.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased min-h-screen bg-black text-white font-sans selection:bg-zinc-800 selection:text-white">
        {children}
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: "#09090b",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              color: "#ffffff",
              fontFamily: "Inter, sans-serif",
              fontSize: "13px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.8)",
            },
          }}
        />
      </body>
    </html>
  );
}
