// src/components/pages/posts/AllPosts.tsx
"use client";

import React, { useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import PostCard from "@/components/pages/posts/PostCard";
import CornerFlourish from "@/components/shared/CornerFlourish";
import {
  useGetPostsQuery,
  useSearchPostsQuery,
  useFilterByCategoryQuery,
  useFilterByTagQuery,
  useSortPostsQuery,
} from "@/lib/features/posts/postsApiSlice";
import {
  setSearchQuery,
  setCategory,
  setTag,
  setSort,
  setPage,
} from "@/lib/features/posts/postsSlice";
import { RootState } from "@/lib/store";
import FilterSection from "./FilterSection";

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

export default function AllPosts() {
  const dispatch = useDispatch();

  // --- READ STATE FROM REDUX ---
  const {
    searchQuery,
    activeCategory,
    activeSubcategory,
    activeTag,
    sortBy,
    sortOrder,
    page,
  } = useSelector((state: RootState) => state.posts);

  // --- DYNAMIC QUERY RESOLUTION ---
  // We fire the specific RTK hook based on the user's intent.
  const isSearch = Boolean(searchQuery);
  const isTag = Boolean(activeTag);
  const isCategory = activeCategory !== "all";
  const isSort = sortBy !== "date" || sortOrder !== "DESC";

  // Note: RTK Query handles skipping automatically when 'skip: true' is passed
  const {
    data: allData,
    isLoading: loadingAll,
    isFetching: fetchingAll,
  } = useGetPostsQuery(page, {
    skip: isSearch || isTag || isCategory || isSort,
  });

  const {
    data: searchData,
    isLoading: loadingSearch,
    isFetching: fetchingSearch,
  } = useSearchPostsQuery({ q: searchQuery, page }, { skip: !isSearch });

  const {
    data: categoryData,
    isLoading: loadingCategory,
    isFetching: fetchingCategory,
  } = useFilterByCategoryQuery(
    { cat: activeCategory, sub: activeSubcategory || undefined, page },
    { skip: !isCategory },
  );

  const {
    data: tagData,
    isLoading: loadingTag,
    isFetching: fetchingTag,
  } = useFilterByTagQuery({ tag: activeTag || "", page }, { skip: !isTag });

  const {
    data: sortData,
    isLoading: loadingSort,
    isFetching: fetchingSort,
  } = useSortPostsQuery(
    { by: sortBy, order: sortOrder, page },
    { skip: !isSort || isSearch || isTag || isCategory }, // Sort acts as fallback if no strict filter
  );

  // --- RESOLVE CURRENT DATA ---
  let activeData = allData;
  let isLoading = loadingAll || fetchingAll;

  if (isSearch) {
    activeData = searchData;
    isLoading = loadingSearch || fetchingSearch;
  } else if (isTag) {
    activeData = tagData;
    isLoading = loadingTag || fetchingTag;
  } else if (isCategory) {
    activeData = categoryData;
    isLoading = loadingCategory || fetchingCategory;
  } else if (isSort) {
    activeData = sortData;
    isLoading = loadingSort || fetchingSort;
  }

  const posts = activeData?.posts || [];

  // --- HANDLERS FOR FILTER SECTION ---
  const handleSearch = (value: string) => {
    dispatch(setSearchQuery(value));
  };

  const handleToggleTag = (tag: string) => {
    dispatch(setTag(activeTag === tag ? "" : tag));
  };

  const handleSetCategory = (cat: string) => {
    dispatch(setCategory({ cat: (cat as any) || "all", sub: null }));
  };

  const handleSetSubcategory = (sub: string) => {
    dispatch(
      setCategory({ cat: activeCategory as any, sub: (sub as any) || null }),
    );
  };

  const handleSetSortBy = (val: "date" | "title") => {
    dispatch(setSort({ by: val, order: sortOrder }));
  };

  const handleSetSortOrder = (val: "ASC" | "DESC") => {
    dispatch(setSort({ by: sortBy, order: val }));
  };

  // Hardcoded for UI rendering
  const allCategories = [
    "bio-engineering",
    "computer-science",
    "diary",
    "projects",
  ];

  // Note: To perfectly implement your specific route design, tags are currently aggregated from
  // the loaded posts. If you want ALL tags in the DB, we would need a dedicated `/api/v1/posts/tags` route.
  const allAvailableTags = useMemo(() => {
    const extractedTags = posts.flatMap((post) => post.tags);
    return Array.from(new Set(extractedTags)).sort();
  }, [posts]);

  return (
    <section className="p-3 lg:p-6 min-h-screen flex flex-col gap-6 bg-background text-foreground">
      {/* --- HEADER --- */}
      <header className="relative border-3 border-double p-3 flex flex-col gap-3">
        <CornerFlourish className="-top-1 -left-1" />
        <CornerFlourish className="-top-1 -right-1 rotate-90" />
        <CornerFlourish className="-bottom-1 -left-1 -rotate-90" />
        <CornerFlourish className="-bottom-1 -right-1 rotate-180" />

        <h4 className="bg-primary text-primary-foreground font-bold p-1 w-fit">
          All Posts :
        </h4>
        <p className="border-l-3 border-double pl-3">
          Every article and projects across all rooms.
        </p>
      </header>

      {/* --- REUSABLE FILTER SECTION --- */}
      <FilterSection
        searchQuery={searchQuery}
        setSearchQuery={handleSearch}
        selectedTags={activeTag ? [activeTag] : []}
        toggleTag={handleToggleTag}
        allAvailableTags={allAvailableTags}
        allCategories={allCategories}
        selectedCategory={activeCategory === "all" ? "" : activeCategory}
        setSelectedCategory={handleSetCategory}
        showCategoryFilter={true}
        showSubcategoryFilter={true}
        selectedSubcategory={activeSubcategory || ""}
        setSelectedSubcategory={handleSetSubcategory}
        sortBy={sortBy}
        setSortBy={handleSetSortBy}
        sortOrder={sortOrder}
        setSortOrder={handleSetSortOrder}
      />

      {/* --- GRID --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)
          : posts.map((post) => <PostCard key={post.id} post={post} />)}
      </div>

      {!isLoading && posts.length === 0 && (
        <div className="p-3 border-3 border-double text-center flex flex-col gap-3 items-center">
          <p className="text-sm font-bold">
            No posts found matching your search criteria.
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
              disabled={page === 1 || isLoading}
              onClick={() => dispatch(setPage(Math.max(1, page - 1)))}
              className="border-3 border-double px-3 py-1 text-xs font-bold hover:bg-primary hover:text-primary-foreground disabled:opacity-50 transition-colors"
            >
              Prev
            </button>
            <button
              disabled={page === activeData.totalPages || isLoading}
              onClick={() => dispatch(setPage(page + 1))}
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
