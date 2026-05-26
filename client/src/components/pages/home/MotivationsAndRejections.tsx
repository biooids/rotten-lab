//src/components/pages/home/MotivationsAndRejections.tsx
"use client";
import CornerFlourish from "@/components/shared/CornerFlourish";

const rejections = [
  {
    collegeName: "Stanford University",
    year: 2020,
    reason: "Lack of extracurricular activities and low GPA.",
    rejectionTimes: 3,
    theirWebsite: "https://www.stanford.edu/",
  },
  {
    collegeName: "Massachusetts Institute of Technology (MIT)",
    year: 2021,
    reason:
      "Insufficient standardized test scores and lack of research experience.",
    rejectionTimes: 2,
    theirWebsite: "https://www.mit.edu/",
  },
  {
    collegeName: "Harvard University",
    year: 2022,
    reason:
      "Lack of research experience and lack of extracurricular activities.",
    rejectionTimes: 1,
    theirWebsite: "https://www.harvard.edu/",
  },
];

function MotivationsAndRejections() {
  return (
    <div className="relative border-3 border-double  p-3 flex flex-col gap-3">
      <CornerFlourish className="-top-1 -left-1" />
      <CornerFlourish className="-top-1 -right-1 rotate-90" />
      <CornerFlourish className="-bottom-1 -left-1 -rotate-90" />
      <CornerFlourish className="-bottom-1 -right-1 rotate-180" />

      <h4 className="bg-primary text-primary-foreground font-bold p-1 w-fit">
        Motivation :
      </h4>

      <p className=" border-l-3 border-double pl-3 flex flex-col gap-3">
        I grew up in a farming village, low income family offcourse but i loved
        nature there so i loved plants and organisms got my first phone where i
        used to play video games finding my self into a backend developer. I got
        like 75+ college refection with in 3 application periods yes i got
        reject from some of the top colleges bellow bro but notherless ic an
        teach my self stuff any ways
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {rejections.map((rejection) => {
          return (
            <div
              key={rejection.collegeName}
              className="border-3 border-double  p-3 bg-card flex flex-col gap-5 justify-between"
            >
              <div className="flex justify-between font-bold text-xs ">
                <h4 className="text-primary">{rejection.collegeName}</h4>
                <span>{rejection.year}</span>
              </div>

              <p className="text-xs">{rejection.reason}</p>

              <div className=" flex justify-between text-xs">
                <span className="text-primary font-bold">
                  Rejections: {rejection.rejectionTimes}
                </span>
                <a
                  href={rejection.theirWebsite}
                  className="hover:text-primary underline"
                >
                  Visit Website
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
export default MotivationsAndRejections;
