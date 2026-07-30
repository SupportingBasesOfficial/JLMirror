const shimmerStyle = {
  background: "linear-gradient(90deg, #10171C 0%, #1E2530 50%, #10171C 100%)",
  backgroundSize: "200% 100%",
  animation: "shimmer 1.5s infinite",
} as const;

export function DashboardSkeleton() {
  return (
    <div className="space-y-5" style={{ fontFamily: "'JetBrains Mono','Consolas',monospace" }}>
      {/* Summary cards skeleton */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-lg p-4" style={{ background: "#0D1218", border: "1px solid #1E2530" }}>
            <div className="flex items-center justify-between mb-3">
              <div className="h-2.5 w-12 rounded" style={shimmerStyle} />
              <div className="h-1.5 w-1.5 rounded-full" style={shimmerStyle} />
            </div>
            <div className="h-7 w-20 rounded" style={shimmerStyle} />
          </div>
        ))}
      </div>

      {/* Device cards skeleton */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="h-3 w-20 rounded" style={shimmerStyle} />
          <div className="h-6 w-48 rounded" style={shimmerStyle} />
        </div>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}>
          {[1, 2].map((i) => (
            <div key={i} className="rounded-lg p-4" style={{ background: "#0D1218", border: "1px solid #1E2530" }}>
              <div className="flex items-center justify-between mb-3">
                <div className="h-3 w-16 rounded" style={shimmerStyle} />
                <div className="h-3 w-12 rounded" style={shimmerStyle} />
              </div>
              <div className="h-4 w-40 rounded mb-2" style={shimmerStyle} />
              <div className="h-2.5 w-28 rounded mb-3" style={shimmerStyle} />
              <div className="flex gap-4 mb-3">
                <div className="flex-1">
                  <div className="h-2 w-8 rounded mb-1" style={shimmerStyle} />
                  <div className="h-1 w-full rounded" style={shimmerStyle} />
                </div>
                <div className="flex-1">
                  <div className="h-2 w-8 rounded mb-1" style={shimmerStyle} />
                  <div className="h-1 w-full rounded" style={shimmerStyle} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
