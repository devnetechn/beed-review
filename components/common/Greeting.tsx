"use client";

function timeOfDayGreeting(name: string | null) {
  const hour = new Date().getHours();
  const base = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return name ? `${base}, ${name}.` : `${base}.`;
}

export function Greeting({ name }: { name: string | null }) {
  return (
    <h1 className="text-2xl font-bold" suppressHydrationWarning>
      {timeOfDayGreeting(name)}
    </h1>
  );
}
