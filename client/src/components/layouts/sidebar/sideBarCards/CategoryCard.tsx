"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Monitor,
  Dna,
  Files,
  FlaskConical,
  Star,
  Shapes,
  Loader2,
} from "lucide-react";
import { useGetPostsQuery } from "@/lib/features/posts/postsApiSlice";

export default function CategoryCard() {
  const pathname = usePathname();

  // Fetch real data from backend
  const { data, isLoading } = useGetPostsQuery();
  const posts = data?.posts || [];

  // Logic defined inside to access the fetched 'posts'
  const categories = [
    {
      title: "All posts",
      icon: Files,
      href: "/posts/all-posts",
      count: posts.length,
      detail: "simple",
    },
    {
      title: "Computer Science",
      icon: Monitor,
      href: "/posts/computer-science",
      count: posts.filter((p) => p.category === "computer-science").length,
      detail: "simple",
    },
    {
      title: "Bio-engineering",
      icon: Dna,
      href: "/posts/bio-engineering",
      count: posts.filter((p) => p.category === "bio-engineering").length,
      detail: "simple",
    },
    {
      title: "Projects",
      icon: FlaskConical,
      href: "/posts/projects",
      count: posts.filter((p) => p.category === "projects").length,
      detail: {
        serious: posts.filter(
          (p) => p.category === "projects" && p.subcategory === "serious",
        ).length,
        random: posts.filter(
          (p) => p.category === "projects" && p.subcategory === "random",
        ).length,
      },
    },
    {
      title: "Diary",
      icon: Dna,
      href: "/posts/diary",
      count: posts.filter((p) => p.category === "diary").length,
      detail: "simple",
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {categories.map((cat, i) => {
        const isActive = pathname === cat.href;

        return (
          <Link
            href={cat.href}
            key={i}
            className={cn(
              " border-3 border-double hover:bg-card/70  transition-all duration-300 p-3 flex flex-col gap-3 ",
              isActive && "bg-card  ",
            )}
          >
            <div className="flex gap-1 items-center  text-primary ">
              <span className="border-3 border-double p-1">
                <cat.icon className="h-5 w-5" />
              </span>
              <h3>{cat.title}</h3>
            </div>

            <div className="p-3 border-3 border-double text-xs">
              {isLoading ? (
                <div className="flex items-center justify-center gap-2 py-1">
                  <span className="animate-pulse">Syncing...</span>
                </div>
              ) : typeof cat.detail === "string" ? (
                <div className="flex justify-between">
                  <div className="flex gap-1 items-center text-primary">
                    <Files className="h-3 w-3" />
                    <span>Posts :</span>
                  </div>
                  <span className="font-bold">{cat.count}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between">
                    <div className="flex gap-1 items-center text-primary">
                      <Star className="h-3 w-3" />
                      <span>Serious :</span>
                    </div>
                    <span className="font-bold">{cat.detail.serious}</span>
                  </div>

                  <div className="flex justify-between mt-1">
                    <div className="flex gap-1 items-center text-primary">
                      <Shapes className="h-3 w-3" />
                      <span>Random :</span>
                    </div>
                    <span className="font-bold">{cat.detail.random}</span>
                  </div>
                </>
              )}
            </div>

            <Button
              variant="outline"
              className="border-3 border-double rounded-none "
            >
              Enter Room
            </Button>
          </Link>
        );
      })}
    </div>
  );
}
