"use client";

import React, { useState, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import PostCard from "../PostCard";
import CornerFlourish from "@/components/shared/CornerFlourish";
import FilterSection from "../FilterSection";
import { Star, Shapes } from "lucide-react";
import {
  useFilterByCategoryQuery,
  useSearchPostsQuery,
  useFilterByTagQuery,
  useSortPostsQuery,
} from "@/lib/features/posts/postsApiSlice";

const CardSkeleton = () => (
  <div className="relative border-3 border-double bg-card flex flex-col gap-3 p-3 justify-between h-full animate-pulse">
    <CornerFlourish className="-top-1 -left-1" />
    <CornerFlourish className="-top-1 -right-1 rotate-90" />
    <CornerFlourish className="-bottom-1 -left-1 -rotate-90" />
    <CornerFlourish className="-bottom-1 -right-1 rotate-180" />

    <div className="flex flex-col gap-3">
      <div className="relative aspect-video border-3 border-double bg-background flex items-center justify-center">
        <span className="text-xs font-bold">Loading...</span>
      </div>
      <div className="h-5 w-16 bg-primary/20" />
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

const tabs = [
  { key: "serious", label: "Serious Projects", icon: Star },
  { key: "random", label: "Random Projects", icon: Shapes },
] as const;

type TabKey = (typeof tabs)[number]["key"];

export default function Projects() {
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<TabKey>("serious");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<"date" | "title">("date");
  const [sortOrder, setSortOrder] = useState<"ASC" | "DESC">("DESC");

  useEffect(() => {
    setPage(1);
  }, [activeTab, searchQuery, selectedTags, sortBy, sortOrder]);

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
    { cat: "projects", sub: activeTab, page },
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

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    setSearchQuery("");
    setSelectedTags([]);
  };

  return (
    <section className="p-3 lg:p-6 min-h-screen flex flex-col gap-6 bg-background text-foreground">
      <header className="relative border-3 border-double p-3 flex flex-col gap-3">
        <CornerFlourish className="-top-1 -left-1" />
        <CornerFlourish className="-top-1 -right-1 rotate-90" />
        <CornerFlourish className="-bottom-1 -left-1 -rotate-90" />
        <CornerFlourish className="-bottom-1 -right-1 rotate-180" />

        <div className=" text-primary">
          <h4 className="bg-primary text-primary-foreground font-bold p-1 w-fit uppercase">
            Projects :
          </h4>
        </div>
        <p className="border-l-3 border-double pl-3 text-xs font-bold">
          What I built. Some serious, some from the tutorial trenches.
        </p>
      </header>

      <div className="flex gap-3">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          const count = isActive && activeData ? activeData.total : "—";

          return (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={cn(
                "relative border-3 border-double p-3 flex items-center gap-2 transition-all flex-1",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-card hover:text-primary",
              )}
            >
              <CornerFlourish
                className={cn(
                  "-top-1 -left-1",
                  isActive ? "text-primary-foreground" : "text-primary",
                )}
              />
              <CornerFlourish
                className={cn(
                  "-bottom-1 -right-1 rotate-180",
                  isActive ? "text-primary-foreground" : "text-primary",
                )}
              />

              <tab.icon className="h-4 w-4" />
              <span className="text-sm font-bold uppercase">{tab.label}</span>
              <span
                className={cn(
                  "text-xs font-bold border-3 border-double px-2 py-0.5 ml-auto",
                  isActive
                    ? "border-primary-foreground text-primary-foreground"
                    : "border-primary text-primary",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

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

      {!isPageLoading && (
        <div className="flex justify-between items-center">
          <span className="text-xs font-bold border-3 border-double px-2 py-1 uppercase">
            {filteredPosts.length}{" "}
            {filteredPosts.length === 1 ? "project" : "projects"}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {isPageLoading
          ? Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)
          : filteredPosts.map((post) => <PostCard key={post.id} post={post} />)}
      </div>

      {!isPageLoading && filteredPosts.length === 0 && (
        <div className="p-3 border-3 border-double text-center flex flex-col gap-3 items-center font-bold">
          <p className="text-sm">No projects found.</p>
          <p className="text-xs">
            Try different keywords or switch to the other tab.
          </p>
        </div>
      )}

      {/* --- PAGINATION CONTROLS --- */}
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
