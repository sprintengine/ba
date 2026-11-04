import type { Metadata } from "next";
import { KitchenSink } from "./kitchen-sink";

export const metadata: Metadata = { title: "Design system", robots: { index: false } };

export default function DevUiPage() {
  return <KitchenSink />;
}
