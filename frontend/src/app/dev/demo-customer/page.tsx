import { CustomerDemo } from "@/components/marketing/demo/customer/customer-demo";
import { Gallery } from "./gallery";

/**
 * The landing page's customer demo on its own, in light or dark (`?mode=dark`), for checking it plays.
 * `?gallery=1` lays out every screen in a fixed state instead, to compare with the real pages.
 */
export default async function DemoCustomerPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; gallery?: string }>;
}) {
  const query = await searchParams;
  const mode = query.mode === "dark" ? "dark" : "light";
  return (
    <div data-mode={mode} className="min-h-dvh bg-background px-6 py-12 text-foreground">
      {query.gallery ? (
        <Gallery />
      ) : (
        <div className="mx-auto max-w-[440px]">
          <CustomerDemo />
        </div>
      )}
    </div>
  );
}
