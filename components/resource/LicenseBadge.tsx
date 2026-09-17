import type { LicenseStatus } from "@/types/database";

const CONFIG: Record<LicenseStatus, { label: string; className: string }> = {
  OPEN_LICENSE: { label: "Open License", className: "bg-green-100 text-green-800" },
  PUBLIC_DOMAIN: { label: "Public Domain", className: "bg-green-100 text-green-800" },
  OPEN_ACCESS: { label: "Open Access", className: "bg-blue-100 text-blue-800" },
  LICENSE_UNCLEAR: { label: "License Unclear", className: "bg-amber-100 text-amber-800" },
  COPYRIGHTED: { label: "Copyrighted", className: "bg-neutral-200 text-neutral-700" },
  NOT_RECOMMENDED: { label: "Not Recommended", className: "bg-red-100 text-red-800" },
};

export function LicenseBadge({ status }: { status: LicenseStatus }) {
  const { label, className } = CONFIG[status];
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${className}`}>{label}</span>
  );
}
