"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Shield } from "lucide-react";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-850 bg-black/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2.5 group"
          aria-label="Ambient Shield home"
        >
          <div className="flex items-center justify-center w-7 h-7 rounded-md bg-zinc-900 border border-zinc-800 transition-colors group-hover:border-zinc-700">
            <Shield size={14} className="text-white" strokeWidth={2.2} />
          </div>
          <span className="text-sm font-semibold tracking-tight text-white flex items-center gap-2">
            Ambient Shield
            <span className="hidden sm:inline-block font-mono text-[10px] uppercase tracking-wider text-zinc-500 border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 rounded">
              v1.0
            </span>
          </span>
        </Link>

        {/* Nav actions */}
        <nav className="flex items-center gap-4" aria-label="Main navigation">
          <Link
            href="/analyze"
            className="text-xs font-medium text-zinc-400 hover:text-white transition-colors hidden sm:block"
          >
            Tools
          </Link>

          <Link
            href="/settings"
            className="text-xs font-medium text-zinc-400 hover:text-white transition-colors hidden sm:block"
          >
            Settings
          </Link>

          <div className="h-3 w-[1px] bg-zinc-800 hidden sm:block" />

          {/* Engine indicator */}
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono text-zinc-400 border border-zinc-850 bg-zinc-950/80 px-2 py-0.5 rounded-md">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>LOCAL OLLAMA</span>
          </div>

          <Button
            asChild
            size="sm"
            id="navbar-try-button"
            className="h-8 px-3 text-xs font-medium"
          >
            <Link href="/analyze">Launch Tools →</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
