import type { Metadata } from "next";
import ReliabilityView from "@/components/ReliabilityView";

export const metadata: Metadata = {
  title: "Crosscheck · How we know when it's wrong",
  description: "A real recorded failure, how it was caught, and how conclusions move when the evidence changes. Read from recorded eval runs.",
};

export default function ReliabilityPage() {
  return <ReliabilityView />;
}
