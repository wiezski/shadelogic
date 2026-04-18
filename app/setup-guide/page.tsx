"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Redirect to Settings page with Setup tab active
export default function SetupGuideRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/settings?tab=setup");
  }, [router]);
  return null;
}
