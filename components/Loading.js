export function Spinner({ className = "" }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

// Full-page loading state — replaces a bare "Loading..." text everywhere.
export function PageLoading({ label = "جارٍ التحميل..." }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-3 text-gray-400">
        <Spinner className="w-8 h-8" />
        <p className="text-sm">{label}</p>
      </div>
    </div>
  );
}

// Skeleton placeholder rows for a list that's still loading, so the page
// doesn't flash from blank to full — useful on slow connections where the
// fetch can take a couple of seconds.
export function SkeletonRows({ count = 3 }) {
  return (
    <div className="bg-white rounded-lg shadow divide-y overflow-hidden">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="p-4 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
          <div className="h-3 bg-gray-100 rounded w-2/3" />
        </div>
      ))}
    </div>
  );
}
