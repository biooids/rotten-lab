//src/components/pages/home/HomeAbout.tsx
"use client";
import CornerFlourish from "@/components/shared/CornerFlourish";

function HomeAbout() {
  return (
    <div className="relative border-3 border-double  p-3 flex flex-col gap-3">
      <CornerFlourish className="-top-1 -left-1" />
      <CornerFlourish className="-top-1 -right-1 rotate-90" />
      <CornerFlourish className="-bottom-1 -left-1 -rotate-90" />
      <CornerFlourish className="-bottom-1 -right-1 rotate-180" />

      <h4 className="bg-primary text-primary-foreground font-bold p-1 w-fit">
        About me :
      </h4>

      <p className=" border-l-3 border-double pl-3">
        I just like doing teachign my self stuff and doing some random research.
        And also creating things bruhhhhhh the beauty fo autism.
      </p>
    </div>
  );
}
export default HomeAbout;
