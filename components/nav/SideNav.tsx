"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, BookOpen, ListChecks, MessageCircle } from "lucide-react";

const ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/search", label: "Search", icon: Search },
  { href: "/library", label: "Library", icon: BookOpen },
  { href: "/quiz", label: "Quiz", icon: ListChecks },
  { href: "/tutor", label: "Tutor", icon: MessageCircle },
];

export function SideNav() {
  const pathname = usePathname();

  return (
    <nav className="hidden w-56 shrink-0 flex-col gap-1 border-r border-neutral-200 p-4 md:flex">
      <div className="mb-4 px-2 text-lg font-semibold">BEEd Review</div>
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm ${
              active ? "bg-neutral-100 font-medium text-neutral-900" : "text-neutral-500"
            }`}
          >
            <Icon size={18} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
