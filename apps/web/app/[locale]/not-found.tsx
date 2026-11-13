import type { Metadata } from "next";
import NotFoundView from "@/components/layout/NotFoundView";

export const metadata: Metadata = { title: "404", robots: { index: false, follow: true } };

export default function NotFound() {
  return <NotFoundView />;
}
