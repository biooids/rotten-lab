//src/components/pages/about/AboutMe.tsx
"use client";

import CornerFlourish from "@/components/shared/CornerFlourish";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import HomeProjects from "@/components/pages/home/HomeProjects";
import AboutDiary from "@/components/pages/about/AboutDiary";

const timeline = [
  {
    date: "Aug 2023",
    label: "High School Ends",
    detail:
      "Physics, Chemistry, Biology. Finished curious about computers and biology. A-level planted the seed.",
  },
  {
    date: "2023–2024",
    label: "Self-Taught Dev Begins",
    detail:
      "HTML, CSS, JS, Node.js, Express.js. Built note apps, a React house rent site (didn't even know React). Thought it would impress admission officers.",
  },
  {
    date: "2023–2025",
    label: "The College Rejection Era",
    detail:
      "Common App, 20+ rejections. Re-applied in 2024. 3 half-scholarships I couldn't afford. Applied for bio+computer research dreams. Rejected again April 1, 2025.",
  },
  {
    date: "Late 2025",
    label: "ALU Admission, No Aid",
    detail:
      "Admitted to ALU Rwanda. Deferred for May intake. Country denied financial aid—after I found a vulnerability on their aid site. They fixed it, gave nothing. Still a vulnerability exists.",
  },
  {
    date: "May 2026",
    label: "Now: ALU Student",
    detail:
      "Bachelor's in Entrepreneurial Leadership (they refused Software Engineering—no math background). Math test in June to qualify for the field I deserve.",
  },
];

export default function AboutPage() {
  return (
    <section className="p-3 lg:p-6 min-h-screen border-3 border-double flex flex-col gap-6">
      {/* Header */}
      <div className="relative border-3 border-double p-3 flex flex-col gap-3">
        <CornerFlourish className="-top-1 -left-1" />
        <CornerFlourish className="-top-1 -right-1 rotate-90" />
        <CornerFlourish className="-bottom-1 -left-1 -rotate-90" />
        <CornerFlourish className="-bottom-1 -right-1 rotate-180" />

        <h1 className="bg-primary text-primary-foreground font-bold p-1 w-fit">
          About Me
        </h1>
        <div className="border-l-3 border-double pl-3">
          <p className="text-sm font-bold">
            This is not a polished story. It's my actual life—rejections,
            obsessions, and all.
          </p>
        </div>
      </div>

      {/* The Raw Story */}
      <div className="relative border-3 border-double p-3 flex flex-col gap-3">
        <CornerFlourish className="-top-1 -left-1" />
        <CornerFlourish className="-bottom-1 -right-1 rotate-180" />

        <h4 className="bg-primary text-primary-foreground font-bold p-1 w-fit">
          The Journey (Unfiltered)
        </h4>

        <div className="border-l-3 border-double pl-3 flex flex-col gap-6">
          {timeline.map((entry, i) => (
            <div key={i} className="flex flex-col gap-1">
              <span className="text-primary font-bold text-xs">
                {entry.date}
              </span>
              <span className="text-sm font-bold">{entry.label}</span>
              <p className="text-xs">{entry.detail}</p>
            </div>
          ))}
        </div>
      </div>

      {/* What I Actually Believe */}
      <div className="relative border-3 border-double p-3 flex flex-col gap-3">
        <CornerFlourish className="-top-1 -left-1" />
        <CornerFlourish className="-bottom-1 -right-1 rotate-180" />

        <h4 className="bg-primary text-primary-foreground font-bold p-1 w-fit">
          What I'm Chasing
        </h4>

        <div className="border-l-3 border-double pl-3 flex flex-col gap-3">
          <p className="text-sm font-bold">
            I want to be a researcher in bio+computer integrated systems. Sounds
            sci-fi. I'm down bad for that.
          </p>
          <p className="text-xs">
            Right now, I'm a full-fledged web developer by necessity. MERN stack
            + PostgreSQL + Next.js. I'm learning math on the way. A job means
            financial freedom for my research obsession. That's the real plan.
          </p>
        </div>
      </div>

      {/* Projects Born from This Chaos (Live Database Component) */}
      <HomeProjects />

      {/* Bottom - The Vulnerability */}
      <div className="relative border-3 border-double p-3 flex flex-col gap-3">
        <CornerFlourish className="-top-1 -left-1" />
        <CornerFlourish className="-bottom-1 -right-1 rotate-180" />

        <h4 className="bg-primary text-primary-foreground font-bold p-1 w-fit">
          The Truth
        </h4>

        <div className="border-l-3 border-double pl-3">
          <p className="text-xs">
            I found a vulnerability on my country's financial aid website. They
            fixed it without giving me anything. They give aid to people who
            contributed nothing. They didn't fix it well. I'm still here.
          </p>
        </div>
      </div>

      {/* CTA */}
      <div className="flex gap-3 flex-wrap">
        <Button
          asChild
          variant="outline"
          className="border-3 border-double rounded-none"
        >
          <Link href="/contact">Contact Me</Link>
        </Button>
        <Button
          asChild
          variant="outline"
          className="border-3 border-double rounded-none"
        >
          <Link href="/computer">See My Work</Link>
        </Button>
      </div>

      {/* Complete Paginated Diary Component */}
      <div className="mt-6 border-t-3 border-double pt-6">
        <AboutDiary />
      </div>
    </section>
  );
}
