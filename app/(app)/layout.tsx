import { SideNav } from "@/components/nav/SideNav";
import { BottomNav } from "@/components/nav/BottomNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-4xl md:border-x md:border-neutral-200">
      <SideNav />
      <div className="flex-1 pb-16 md:pb-0">
        <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
