import { redirect } from "next/navigation";

export default function MyIndex() {
  redirect("/my/bookings");
}
