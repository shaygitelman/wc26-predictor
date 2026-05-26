export default function EditProfileLoading() {
  return (
    <div className="flex flex-col min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">

      {/* Header */}
      <header className="sticky top-0 z-40 flex items-center h-14 px-4 gap-3 bg-surface/90 backdrop-blur-md border-b border-border/80">
        <div className="size-9 rounded-full bg-muted animate-pulse" />
        <div className="h-5 w-28 bg-muted rounded-lg animate-pulse" />
      </header>

      <div className="flex flex-col gap-5 p-4">

        {/* Avatar preview */}
        <div className="flex flex-col items-center gap-2 pt-3 pb-1">
          <div className="size-20 rounded-full bg-muted animate-pulse" />
          <div className="h-3 w-32 bg-muted rounded animate-pulse" />
        </div>

        {/* Avatar picker */}
        <div>
          <div className="h-3 w-14 bg-muted rounded mb-3 animate-pulse" />
          <div className="bg-card rounded-2xl border border-border p-4">
            <div className="grid grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="size-[60px] rounded-full bg-muted mx-auto animate-pulse"
                  style={{ animationDelay: `${i * 40}ms` }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Profile info */}
        <div>
          <div className="h-3 w-20 bg-muted rounded mb-3 animate-pulse" />
          <div className="flex flex-col gap-3">
            <div className="bg-card rounded-2xl border border-border px-4 py-4">
              <div className="h-3 w-16 bg-muted rounded mb-3 animate-pulse" />
              <div className="h-11 bg-muted rounded-xl animate-pulse" />
            </div>
            <div className="bg-card rounded-2xl border border-border px-4 py-4">
              <div className="h-3 w-8 bg-muted rounded mb-3 animate-pulse" />
              <div className="h-[84px] bg-muted rounded-xl animate-pulse" />
            </div>
          </div>
        </div>

        {/* Save button */}
        <div className="h-14 bg-muted rounded-2xl animate-pulse" />

      </div>
    </div>
  )
}
