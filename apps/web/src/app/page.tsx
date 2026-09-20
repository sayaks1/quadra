"use client";

import dynamic from "next/dynamic";

const AppShell = dynamic(
  () => import("@/components/AppShell").then((m) => m.AppShell),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-screen items-center justify-center bg-field text-[14.5px] text-stone">
        Loading Quadra…
      </div>
    ),
  },
);

export default function HomePage() {
  return <AppShell />;
}
