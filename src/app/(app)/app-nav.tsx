"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/auth/actions";
import type { Session } from "@/lib/auth/session";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/jobs", label: "Jobs" },
  { href: "/candidates", label: "Candidates" },
  { href: "/interviews", label: "Interviews" },
  { href: "/offers", label: "Offers" },
  { href: "/approvals", label: "Approvals" },
  { href: "/talent-pools", label: "Pools" },
  { href: "/settings", label: "Settings" },
];

export function AppNav({ session }: { session: Session }) {
  const pathname = usePathname();

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-4 sm:gap-8">
          <Link href="/dashboard" className="flex shrink-0 items-center gap-2">
            <Image
              src="/images/eligeo-icon-only.svg"
              alt="Eligeo"
              width={28}
              height={28}
              className="rounded-md"
            />
            <span className="hidden text-lg font-semibold tracking-tight sm:inline">
              Eligeo
            </span>
          </Link>
          {/* M3: overflow-x-auto lets nav scroll on small screens without wrapping */}
          <nav className="-mx-1 flex items-center gap-0.5 overflow-x-auto px-1 sm:gap-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          {/* M3: hide role/plan metadata on small screens */}
          <span className="hidden text-xs text-muted-foreground sm:block">
            {session.orgRole} · {session.plan}
          </span>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted sm:px-3 sm:text-sm"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
