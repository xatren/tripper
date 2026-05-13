import { cn } from '@/lib/utils';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export function GlassCard({ children, className, onClick }: GlassCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-white/5 backdrop-blur-md border border-white/10 rounded-xl',
        onClick && 'cursor-pointer hover:bg-white/8 transition-colors',
        className
      )}
    >
      {children}
    </div>
  );
}
