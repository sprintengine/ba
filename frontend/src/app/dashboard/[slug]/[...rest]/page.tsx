import { notFound } from "next/navigation";

/** Any other path under a business: the not-found page in the dashboard's own shell, not the site-wide one. */
export default function UnknownDashboardPage() {
  notFound();
}
