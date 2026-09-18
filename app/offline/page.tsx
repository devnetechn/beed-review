export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold">You&apos;re offline</h1>
      <p className="text-sm text-neutral-500">
        Some features need an internet connection — search, AI research, the tutor, and quiz
        generation won&apos;t work until you&apos;re back online. Pages you&apos;ve already
        visited may still be available.
      </p>
      <a
        href="/"
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white"
      >
        Try again
      </a>
    </div>
  );
}
