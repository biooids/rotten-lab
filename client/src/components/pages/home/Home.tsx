//src/components/pages/home/Home.tsx
"use client";

import BioAndSkills from "./BioAndSkills";
import HomeAbout from "./HomeAbout";
import HomeProjects from "./HomeProjects";
import MotivationsAndRejections from "./MotivationsAndRejections";

function Home() {
  return (
    <section className="p-3 lg:p-6 min-h-screen border-3 border-double flex flex-col gap-6">
      <div>
        <h1 className="font-bold">Rotten lab</h1>
        <p>I share what's with in my lab</p>
      </div>

      <BioAndSkills />
      <HomeAbout />
      <HomeProjects />
      <MotivationsAndRejections />
    </section>
  );
}

export default Home;
