import React from "react";
import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ambient Shield",
  description:
    "Your quiet digital protector against privacy traps and digital deception. Analyze privacy policies, detect misinformation, and spot deepfakes — free for everyone.",
  keywords: [
    "privacy policy analyzer",
    "deepfake detector",
    "misinformation scanner",
    "cybersecurity",
    "digital protection",
  ],
  authors: [{ name: "Ambient Shield" }],
  openGraph: {
    title: "Ambient Shield",
    description:
      "Your quiet digital protector against privacy traps and digital deception.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Syne:wght@700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased min-h-screen" style={{ background: "var(--bg)" }}>
        {children}
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: "var(--bg3)",
              border: "1px solid var(--border2)",
              color: "var(--text)",
              fontFamily: "DM Sans, sans-serif",
              fontSize: "13px",
            },
          }}
        />
      </body>
    </html>
  );
}
