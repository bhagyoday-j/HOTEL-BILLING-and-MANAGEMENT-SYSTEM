export function ComingSoonPage({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-paper-elevated/50 px-6 text-center">
      <h1 className="font-display text-4xl text-forest-deep">{title}</h1>
      <p className="mt-3 max-w-md text-sm text-ink-muted">
        This module is scaffolded and will be implemented in {phase}. Navigation and permissions are
        already wired into the application shell.
      </p>
    </div>
  );
}
