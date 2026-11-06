"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer
      className="w-full mt-auto"
      style={{
        borderTop: "1px solid var(--border)",
        background: "var(--bg)",
      }}
    >
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <div
              className="flex items-center justify-center w-7 h-7 rounded-lg"
              style={{
                background:
                  "linear-gradient(135deg, rgba(91,156,246,0.15), rgba(58,123,213,0.08))",
                border: "1px solid rgba(91,156,246,0.2)",
              }}
            >
              <ShieldCheck
                size={13}
                style={{ color: "var(--accent)" }}
                strokeWidth={2.5}
              />
            </div>
            <span
              className="text-sm font-bold"
              style={{ fontFamily: "Syne, sans-serif", color: "var(--text)" }}
            >
              Ambient Shield
            </span>
          </div>

          {/* Mission statement */}
          <p
            className="text-sm text-center"
            style={{ color: "var(--text2)" }}
          >
            Free to use &middot; No signup required &middot; Your data is not stored
          </p>

          {/* Links */}
          <nav className="flex items-center gap-5" aria-label="Footer navigation">
            <Link
              href="/"
              className="text-xs transition-colors duration-150"
              style={{ color: "var(--text3)" }}
              onMouseEnter={(e) =>
                ((e.target as HTMLElement).style.color = "var(--text2)")
              }
              onMouseLeave={(e) =>
                ((e.target as HTMLElement).style.color = "var(--text3)")
              }
            >
              Home
            </Link>
            <Link
              href="/analyze"
              className="text-xs transition-colors duration-150"
              style={{ color: "var(--text3)" }}
              onMouseEnter={(e) =>
                ((e.target as HTMLElement).style.color = "var(--text2)")
              }
              onMouseLeave={(e) =>
                ((e.target as HTMLElement).style.color = "var(--text3)")
              }
            >
              Analyze
            </Link>
          </nav>
        </div>

        {/* Copyright */}
        <div
          className="mt-8 pt-6 text-center text-xs"
          style={{
            borderTop: "1px solid var(--border)",
            color: "var(--text3)",
          }}
        >
          © {year} Ambient Shield. Built to protect digital privacy.
        </div>
      </div>
    </footer>
  );
}
