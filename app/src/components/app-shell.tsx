"use client";

import Link from "next/link";
import { shortAddress } from "@/lib/format";
import { useAppRuntime } from "@/lib/runtime";
import type { PropsWithChildren } from "react";

interface AppShellProps extends PropsWithChildren {
  title: string;
  summary: string;
  eyebrow?: string;
  caption?: string;
}

export function AppShell({
  title,
  summary,
  eyebrow = "Token swap workspace",
  caption,
  children,
}: AppShellProps) {
  const { network } = useAppRuntime();

  return (
    <main className="page-shell">
      <div className="app-shell">
        <section className="hero">
          <div className="nav-row">
            <div className="inline-links">
              <span className="eyebrow">{eyebrow}</span>
              <span className="tag">{network.label}</span>
              <span className="tag">{shortAddress(network.programId, 6)}</span>
            </div>
            <nav className="nav-links">
              <Link className="nav-link" href="/">
                Groups
              </Link>
              <Link className="nav-link" href="/create">
                Create group
              </Link>
              <Link className="nav-link" href="/docs">
                Docs
              </Link>
            </nav>
          </div>
          <div className="stack">
            <h1 className="hero-title">{title}</h1>
            <p className="hero-copy">{summary}</p>
            {caption ? <p className="help-copy">{caption}</p> : null}
          </div>
        </section>
        {children}
      </div>
    </main>
  );
}
