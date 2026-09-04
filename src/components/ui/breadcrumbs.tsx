import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

type BreadcrumbItem = {
  label: string;
  href?: string;
};

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="flex items-center gap-1.5 text-sm mb-4 min-w-0">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5 min-w-0">
          {i > 0 && <ChevronRight size={14} className="text-gray-300 shrink-0" />}
          {item.href ? (
            <Link href={item.href} className="text-gray-500 hover:text-blue-600 transition-colors truncate">
              {item.label}
            </Link>
          ) : (
            <span className="text-gray-700 font-medium truncate">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
