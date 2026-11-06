"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";

export default function Navbar() {
  return (
    <header
      className="sticky top-0 z-50 w-full"
      style={{
        background: "rgba(8, 12, 20, 0.8)",
        borderBottom: "1px solid var(--border)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2.5 group"
          aria-label="Ambient Shield home"
        >
          <div
            className="flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 group-hover:scale-105"
            style={{
              background:
                "linear-gradient(135deg, rgba(91,156,246,0.2), rgba(58,123,213,0.1))",
              border: "1px solid rgba(91,156,246,0.3)",
              boxShadow: "0 0 12px rgba(91,156,246,0.15)",
            }}
          >
            <ShieldCheck
              size={16}
              style={{ color: "var(--accent)" }}
              strokeWidth={2.5}
            />
          </div>
          <span
            className="text-base font-bold tracking-tight"
            style={{
              fontFamily: "Syne, sans-serif",
              color: "var(--text)",
            }}
          >
            Ambient Shield
          </span>
        </Link>

        {/* Nav actions */}
        <nav className="flex items-center gap-3" aria-label="Main navigation">
          <Link
            href="/analyze"
            className="text-sm transition-colors duration-200 hidden sm:block"
            style={{ color: "var(--text2)" }}
            onMouseEnter={(e) =>
              ((e.target as HTMLElement).style.color = "var(--text)")
            }
            onMouseLeave={(e) =>
              ((e.target as HTMLElement).style.color = "var(--text2)")
            }
          >
            Tools
          </Link>

          <Link
            href="/settings"
            className="text-sm transition-colors duration-200 hidden sm:block"
            style={{ color: "var(--text2)" }}
            onMouseEnter={(e) =>
              ((e.target as HTMLElement).style.color = "var(--text)")
            }
            onMouseLeave={(e) =>
              ((e.target as HTMLElement).style.color = "var(--text2)")
            }
          >
            Settings
          </Link>

          <Button
            asChild
            size="sm"
            id="navbar-try-button"
          >
            <Link href="/analyze">Try Now →</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
