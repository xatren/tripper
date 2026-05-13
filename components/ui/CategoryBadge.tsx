import { CATEGORY_COLORS, CATEGORY_ICONS, CATEGORY_LABELS } from '@/types';
import type { PinCategory } from '@/types';
import { cn } from '@/lib/utils';

interface CategoryBadgeProps {
  category: PinCategory;
  size?: 'sm' | 'md';
  className?: string;
}

export function CategoryBadge({ category, size = 'md', className }: CategoryBadgeProps) {
  const color = CATEGORY_COLORS[category];
  const icon = CATEGORY_ICONS[category];
  const label = CATEGORY_LABELS[category];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium',
        size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1',
        className
      )}
      style={{
        backgroundColor: `${color}20`,
        color,
        border: `1px solid ${color}40`,
      }}
    >
      <span className={size === 'sm' ? 'text-xs' : 'text-sm'}>{icon}</span>
      {label}
    </span>
  );
}
