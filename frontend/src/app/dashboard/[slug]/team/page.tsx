import { redirect } from "next/navigation";

/** Who can sign in now sits with who gets booked; old links land on that part of the page. */
export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/dashboard/${slug}/resources?r=sign-in`);
}
