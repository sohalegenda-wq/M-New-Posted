import { useEffect, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useUI, api, type Post } from "../lib";
import { Empty, ErrorState, Skeleton } from "./common";
import { PostCard } from "./Post";
export function Feed({
  path,
  emptyTitle,
  emptyText,
}: {
  path: string;
  emptyTitle?: string;
  emptyText?: string;
}) {
  const { t, user } = useUI();
  const touch = useRef(0);
  const sentinel = useRef<HTMLDivElement>(null);
  const query = useInfiniteQuery({
    queryKey: ["feed", path, { viewer: user?.id ?? "anonymous" }],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api<{ items: Post[]; next: string | null }>(
        `${path}${path.includes("?") ? "&" : "?"}${pageParam ? `cursor=${encodeURIComponent(pageParam)}` : ""}`,
      ),
    getNextPageParam: (last) => last.next ?? undefined,
    retry: 1,
  });
  useEffect(() => {
    const element = sentinel.current;
    if (!element || !query.hasNextPage) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !query.isFetchingNextPage)
          void query.fetchNextPage();
      },
      { rootMargin: "250px" },
    );
    obs.observe(element);
    return () => obs.disconnect();
  }, [query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage]);
  const posts =
    query.data?.pages
      .flatMap((p) => p.items)
      .filter((p, i, all) => all.findIndex((v) => v.id === p.id) === i) ?? [];
  if (query.isPending)
    return (
      <>
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </>
    );
  if (query.error && !posts.length)
    return (
      <ErrorState error={query.error} retry={() => void query.refetch()} />
    );
  return (
    <div
      onTouchStart={(e) => {
        touch.current = e.touches[0].clientY;
      }}
      onTouchEnd={(e) => {
        if (
          window.scrollY < 20 &&
          e.changedTouches[0].clientY - touch.current > 110
        )
          void query.refetch();
      }}
    >
      {posts.map((p) => (
        <PostCard key={p.id} post={p} />
      ))}
      {!posts.length && <Empty title={emptyTitle} text={emptyText} />}
      <div ref={sentinel} className="load-more">
        {query.isFetchingNextPage ? (
          <Skeleton />
        ) : query.hasNextPage ? (
          <button
            className="text-button"
            onClick={() => void query.fetchNextPage()}
          >
            {t("Показать ещё")}
          </button>
        ) : posts.length > 0 ? (
          <span>
            YOU’RE ALL CAUGHT UP <span>✦</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}
