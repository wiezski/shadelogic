import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Window Treatment Sun & Heat Calculator",
  description:
    "Find out which window treatments will actually work for your windows. Tell us the direction, the problem you’re solving, and your preference — get a recommendation in 30 seconds.",
  openGraph: {
    title: "Window Treatment Sun & Heat Calculator",
    description:
      "Free tool. What should you actually put on your windows? Answer 5 questions and get a personalized recommendation.",
    type: "website",
    url: "https://zeroremake.com/sun-calculator",
  },
  twitter: {
    card: "summary_large_image",
    title: "Window Treatment Sun & Heat Calculator",
    description:
      "Free. 30 seconds. The right product for your exact windows.",
  },
  alternates: { canonical: "https://zeroremake.com/sun-calculator" },
};

export default function SunCalcLayout({ children }: { children: React.ReactNode }) {
  return children;
}
