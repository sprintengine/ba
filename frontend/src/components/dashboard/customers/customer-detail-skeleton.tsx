import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** A Skeleton as a <span>: the header's title and description are an <h1> and a <p>, which can't hold a <div>. */
function InlineSkeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "block animate-shimmer rounded-md bg-[linear-gradient(90deg,var(--muted)_0%,var(--accent)_40%,var(--muted)_80%)] bg-size-[200%_100%]",
        className,
      )}
    />
  );
}

/** The customer page's shape while the customer loads. */
export function CustomerDetailSkeleton({ back }: { back: { href: string; label: string } }) {
  return (
    <PageContainer size="wide">
      <PageHeader
        back={back}
        title={
          <span className="flex items-center gap-3">
            <InlineSkeleton className="size-10 rounded-full" />
            <InlineSkeleton className="h-6 w-48" />
          </span>
        }
        description={<InlineSkeleton className="mt-1 h-4 w-64" />}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    </PageContainer>
  );
}
