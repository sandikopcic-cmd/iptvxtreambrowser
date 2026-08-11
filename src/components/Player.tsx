import { ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const VideoPlayer = lazy(() => import("./VideoPlayer"));

function Skeleton() {
  return (
    <div className="aspect-video w-full animate-pulse rounded-xl border border-border bg-card" />
  );
}

export function Player(props: { src: string; title?: string; poster?: string | null }) {
  return (
    <ClientOnly fallback={<Skeleton />}>
      <Suspense fallback={<Skeleton />}>
        <VideoPlayer {...props} />
      </Suspense>
    </ClientOnly>
  );
}
