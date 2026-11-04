import { OG_SIZE, renderOgCard } from "@/components/marketing/og-card";

export const alt = "bookanything: online booking for appointment businesses. 0% platform fee on payments.";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function OpenGraphImage() {
  return renderOgCard({
    title: "Let your clients book themselves in.",
    subtitle: "Online booking for appointment businesses. 0% platform fee on payments.",
    chips: ["Physios", "Car washes", "Music teachers", "GP practices"],
  });
}
