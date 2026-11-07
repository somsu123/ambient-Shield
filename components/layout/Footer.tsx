"use client";

import Link from "next/link";
import { Shield } from "lucide-react";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="w-full mt-auto border-t border-zinc-850 bg-black">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Brand */}
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-6 h-6 rounded bg-zinc-900 border border-zinc-800">
              <Shield size={12} className="text-white" strokeWidth={2.2} />
            </div>
            <span className="text-xs font-semibold text-white tracking-tight">
              Ambient Shield
            </span>
          </div>

          {/* Mission statement */}
          <p className="text-xs font-mono text-zinc-500 text-center">
            ZERO CLOUD KEYS &middot; 100% LOCAL INFERENCE &middot; ZERO DATA STORED
          </p>

          {/* Links */}
          <nav className="flex items-center gap-4 text-xs font-mono text-zinc-400" aria-label="Footer navigation">
            <Link href="/" className="hover:text-white transition-colors">
              HOME
            </Link>
            <Link href="/analyze" className="hover:text-white transition-colors">
              TOOLS
            </Link>
            <Link href="/settings" className="hover:text-white transition-colors">
              CONFIG
            </Link>
          </nav>
        </div>

        <div className="mt-6 pt-4 border-t border-zinc-900 flex flex-col sm:flex-row items-center justify-between text-[11px] font-mono text-zinc-600 gap-2">
          <span>&copy; {year} AMBIENT SHIELD. ALL PROTECTIONS PRIVATELY RUN ON-DEVICE.</span>
          <span className="text-zinc-500">ENGINE: GEMMA / LOCAL OLLAMA</span>
        </div>
      </div>
    </footer>
  );
}
