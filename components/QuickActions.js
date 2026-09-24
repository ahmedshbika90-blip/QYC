import Link from "next/link";

export default function QuickActions({ actions }) {
  return (
    <div className="grid grid-cols-2 gap-2 mb-4">
      {actions.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className="flex items-center justify-center gap-2 bg-gray-900 text-white rounded-lg h-14 text-base font-medium active:bg-gray-700"
        >
          {a.label}
        </Link>
      ))}
    </div>
  );
}
