import Link from "next/link";
import { DeadEndMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/** An address for a place we don't list: the search is what they came for, so it says that and offers it. */
export default function PlaceNotFound() {
  return (
    <EmptyState
      size="lg"
      headingLevel={1}
      icon={<DeadEndMark />}
      title="We don’t list that place yet"
      description="Try another town or city, or browse everywhere we do."
      action={
        <Button asChild variant="primary">
          <Link href="/explore">Search all of Ireland</Link>
        </Button>
      }
    />
  );
}
