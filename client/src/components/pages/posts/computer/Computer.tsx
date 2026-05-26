//src/components/pages/posts/computer/Computer.tsx
"use client";

import React, { useState, useMemo, useEffect } from "react";
import PostCard from "../PostCard";
import CornerFlourish from "@/components/shared/CornerFlourish";
import FilterSection from "../FilterSection";
import { Monitor } from "lucide-react";
import {
  useFilterByCategoryQuery,
  useSearchPostsQuery,
  useFilterByTagQuery,
  useSortPostsQuery,
} from "@/lib/features/posts/postsApiSlice";

const CardSkeleton = () => (
  <div className="border-3 border-double bg-card flex flex-col gap-3 p-3 justify-between animate-pulse">
    <div className="flex flex-col gap-3">
      <div className="relative aspect-video border-3 border-double bg-background flex items-center justify-center">
        <span className="text-xs font-bold">Loading...</span>
      </div>
      <div className="flex gap-1">
        <div className="w-10 h-10 border-3 border-double bg-background" />
        <div className="flex flex-col gap-1 justify-center">
          <div className="h-3 w-24 bg-primary/20" />
          <div className="h-2 w-16 bg-primary/10" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="h-4 w-3/4 bg-primary/20" />
        <div className="h-2.5 w-full bg-primary/10" />
        <div className="h-2.5 w-5/6 bg-primary/10" />
      </div>
      <div className="flex flex-wrap gap-1">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="border-3 border-double bg-background h-6 w-12"
          />
        ))}
      </div>
    </div>
    <div className="w-full h-10 border-3 border-double bg-background" />
  </div>
);

const EmptyState = () => (
  <div className="p-3 border-3 border-double text-center flex flex-col gap-3 items-center">
    <p className="text-sm font-bold ">No posts found matching your search.</p>
    <p className="text-xs font-bold ">
      Try different keywords or clear the filters.
    </p>
  </div>
);

export default function Computer() {
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<"date" | "title">("date");
  const [sortOrder, setSortOrder] = useState<"ASC" | "DESC">("DESC");

  useEffect(() => {
    setPage(1);
  }, [searchQuery, selectedTags, sortBy, sortOrder]);

  // --- DYNAMIC QUERY RESOLUTION ---
  const isSearch = Boolean(searchQuery);
  const activeTag = selectedTags[0] || "";
  const isTag = Boolean(activeTag);
  const isSort = sortBy !== "date" || sortOrder !== "DESC";

  const {
    data: catData,
    isLoading: loadingCat,
    isFetching: fetchingCat,
  } = useFilterByCategoryQuery(
    { cat: "computer-science", page },
    { skip: isSearch || isTag || isSort },
  );

  const {
    data: searchData,
    isLoading: loadingSearch,
    isFetching: fetchingSearch,
  } = useSearchPostsQuery({ q: searchQuery, page }, { skip: !isSearch });

  const {
    data: tagData,
    isLoading: loadingTag,
    isFetching: fetchingTag,
  } = useFilterByTagQuery({ tag: activeTag, page }, { skip: !isTag });

  const {
    data: sortData,
    isLoading: loadingSort,
    isFetching: fetchingSort,
  } = useSortPostsQuery(
    { by: sortBy, order: sortOrder, page },
    { skip: !isSort || isSearch || isTag },
  );

  let activeData = catData;
  let isPageLoading = loadingCat || fetchingCat;

  if (isSearch) {
    activeData = searchData;
    isPageLoading = loadingSearch || fetchingSearch;
  } else if (isTag) {
    activeData = tagData;
    isPageLoading = loadingTag || fetchingTag;
  } else if (isSort) {
    activeData = sortData;
    isPageLoading = loadingSort || fetchingSort;
  }

  const filteredPosts = activeData?.posts || [];

  const allAvailableTags = useMemo(() => {
    const tags = filteredPosts.flatMap((post) => post.tags);
    return Array.from(new Set(tags)).sort();
  }, [filteredPosts]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => (prev[0] === tag ? [] : [tag]));
  };

  return (
    <section className="p-3 lg:p-6 min-h-screen flex flex-col gap-6 bg-background text-foreground">
      {/* --- HEADER --- */}
      <header className="relative border-3 border-double p-3 flex flex-col gap-3">
        <CornerFlourish className="-top-1 -left-1" />
        <CornerFlourish className="-top-1 -right-1 rotate-90" />
        <CornerFlourish className="-bottom-1 -left-1 -rotate-90" />
        <CornerFlourish className="-bottom-1 -right-1 rotate-180" />

        <div className="text-primary">
          <h4 className="bg-primary text-primary-foreground font-bold p-1 w-fit ">
            Computer Science :
          </h4>
        </div>
        <p className="border-l-3 border-double pl-3 font-bold text-xs">
          A collection of technical articles and logs.
        </p>
      </header>

      {/* --- FILTERS --- */}
      <FilterSection
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        selectedTags={selectedTags}
        toggleTag={toggleTag}
        allAvailableTags={allAvailableTags}
        sortBy={sortBy}
        setSortBy={setSortBy}
        sortOrder={sortOrder}
        setSortOrder={setSortOrder}
      />

      {/* --- POST COUNT --- */}
      {!isPageLoading && (
        <div className="flex justify-between items-center">
          <span className="text-xs font-bold border-3 border-double px-2 py-1 ">
            {filteredPosts.length}{" "}
            {filteredPosts.length === 1 ? "post" : "posts"}
          </span>
        </div>
      )}

      {/* --- GRID --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {isPageLoading
          ? Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)
          : filteredPosts.map((post) => <PostCard key={post.id} post={post} />)}
      </div>

      {/* --- EMPTY --- */}
      {!isPageLoading && filteredPosts.length === 0 && <EmptyState />}

      {/* --- ADDED: PAGINATION CONTROLS --- */}
      {activeData && activeData.totalPages > 1 && (
        <div className="flex items-center justify-between border-3 border-double p-3 mt-4">
          <p className="text-xs font-bold opacity-70">
            Showing Page {activeData.page} of {activeData.totalPages} (
            {activeData.total} total posts)
          </p>
          <div className="flex gap-2">
            <button
              disabled={page === 1 || isPageLoading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="border-3 border-double px-3 py-1 text-xs font-bold hover:bg-primary hover:text-primary-foreground disabled:opacity-50 transition-colors"
            >
              Prev
            </button>
            <button
              disabled={page === activeData.totalPages || isPageLoading}
              onClick={() => setPage((p) => p + 1)}
              className="border-3 border-double px-3 py-1 text-xs font-bold hover:bg-primary hover:text-primary-foreground disabled:opacity-50 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
