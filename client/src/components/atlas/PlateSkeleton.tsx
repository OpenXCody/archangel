import { cn } from '@/lib/utils';

/** The plate's place while the taxonomy is on its way: the same square, one quiet ring. */
export default function PlateSkeleton({ className }: { className?: string }) {
  return (
    <div aria-busy="true" aria-label="Loading" className={cn('flex aspect-square w-full items-center justify-center', className)}>
      <div className="h-[84%] w-[84%] animate-pulse rounded-full border-2 border-line" />
    </div>
  );
}
