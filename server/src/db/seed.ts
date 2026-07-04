// src/db/seed.ts
import { pool } from "./psql.js";
import argon2 from "argon2";

const DUMMY_PASSWORD = "password123";

// Fixed the "ttps" typos from your prompt to proper "https"
const AVATAR_URL =
  "https://res.cloudinary.com/dhr9zmb3i/image/upload/v1782114895/avatar-fallback_jnzqae.jpg";
const THUMBNAIL_URL =
  "https://res.cloudinary.com/dhr9zmb3i/image/upload/v1781627389/1_jktnha.png";
const POST_IMAGES = [
  "https://res.cloudinary.com/dhr9zmb3i/image/upload/v1782114895/avatar-fallback_jnzqae.jpg",
  "https://res.cloudinary.com/dhr9zmb3i/image/upload/v1782114895/avatar-fallback_jnzqae.jpg",
  "https://res.cloudinary.com/dhr9zmb3i/image/upload/v1782114895/avatar-fallback_jnzqae.jpg",
];

async function seed() {
  console.log("🌱 Starting expanded database seeding...");

  try {
    console.log("🔐 Hashing dummy passwords...");
    const hash = await argon2.hash(DUMMY_PASSWORD);

    console.log("🧹 Sweeping old data...");
    await pool.query("DELETE FROM posts;");
    await pool.query("DELETE FROM users;");

    console.log("👤 Creating 10 distinct users...");
    const userQueries = [
      ["superadmin", "Supreme Overlord", "super_admin"],
      ["admin_user", "System Administrator", "admin"],
      ["alice_bio", "Bio-Engineer Researcher", "user"],
      ["bob_coder", "Backend Developer", "user"],
      ["charlie_ai", "AI Machine Learning", "user"],
      ["diana_design", "UI/UX Specialist", "user"],
      ["eve_hacker", "Cybersecurity Analyst", "user"],
      ["frank_rnd", "R&D Director", "user"],
      ["grace_devops", "Infrastructure Guru", "user"],
      ["hank_hardware", "Robotics Engineer", "user"],
    ];

    const insertedUsers: { id: string; username: string }[] = [];
    for (const [username, profileTitle, role] of userQueries) {
      const result = await pool.query(
        `INSERT INTO users (username, profile_title, password_hash, role, avatar_url)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, username;`,
        [username, profileTitle, hash, role, AVATAR_URL],
      );
      insertedUsers.push(result.rows[0]);
    }

    // Helper to grab a random user ID for varied authorship
    const getRandomUserId = () =>
      insertedUsers[Math.floor(Math.random() * insertedUsers.length)]!.id;

    console.log("📝 Preparing massive post data load...");

    // Your provided data + expanded entries, strictly meeting char lengths
    const postData = [
      // BIO-ENGINEERING
      {
        title: "Living Muscle Robotics",
        shortDesc: "Exploring muscle-powered robotic systems.",
        content:
          "Bio-engineering opens new ways to build efficient machines. Living muscle could replace traditional mechanical actuators in future robots, providing a level of elasticity that synthetic motors just cannot replicate efficiently.",
        category: "bio-engineering",
        sub: null,
        github: null,
        tags: ["robotics", "biology"],
      },
      {
        title: "Artificial Tendons",
        shortDesc: "Designing stronger flexible connectors.",
        content:
          "Artificial tendons can improve robotic movement and durability. Their flexibility allows smoother and more natural motion. We are currently testing Kevlar-weaved bioplastics to mimic the tensile strength of human ligaments.",
        category: "bio-engineering",
        sub: null,
        github: null,
        tags: ["materials", "robotics"],
      },
      {
        title: "Growing Biological Tissues",
        shortDesc: "The future of engineered lab-grown tissues.",
        content:
          "Lab-grown tissues continue to advance modern bio-engineering. These technologies may support robotics and medical innovation alike. Scaling production outside of petri dishes remains our biggest current bottleneck.",
        category: "bio-engineering",
        sub: null,
        github: null,
        tags: ["tissue", "research"],
      },
      {
        title: "Research Notes: Neural Interfaces",
        shortDesc: "Connecting organic tissue to hardware.",
        content:
          "Reading scientific papers sparks new project ideas. Connecting different fields often leads to innovation. Today's deep dive was into non-invasive neural interfaces reading motor cortex signals through the scalp.",
        category: "bio-engineering",
        sub: null,
        github: null,
        tags: ["neural", "bci"],
      },

      // COMPUTER-SCIENCE
      {
        title: "Programming Habits",
        shortDesc: "Small daily habits improve coding skills.",
        content:
          "Writing code every day builds confidence and experience. Consistency matters more than occasional bursts of motivation. Setting aside just 45 uninterrupted minutes every morning has transformed my output.",
        category: "computer-science",
        sub: null,
        github: null,
        tags: ["productivity", "habits"],
      },
      {
        title: "Understanding Algorithms",
        shortDesc: "Why deep algorithmic knowledge matters.",
        content:
          "Efficient algorithms solve problems faster and with fewer resources. Learning them makes every developer stronger. Don't rely on brute force when a simple hash map or binary search can reduce time complexity drastically.",
        category: "computer-science",
        sub: null,
        github: null,
        tags: ["algorithms", "dsa"],
      },
      {
        title: "System Design Basics",
        shortDesc: "Thinking beyond individual programs.",
        content:
          "Scalable systems require careful planning from the beginning. Architecture decisions influence long-term success. It is significantly harder to break a monolith into microservices than it is to plan domains correctly on day one.",
        category: "computer-science",
        sub: null,
        github: null,
        tags: ["architecture", "design"],
      },
      {
        title: "Memory Management",
        shortDesc: "Making applications more memory efficient.",
        content:
          "Good memory usage improves speed and reliability. Understanding allocation helps prevent unnecessary bugs. Garbage collection in higher-level languages often masks underlying memory leaks until production systems crash.",
        category: "computer-science",
        sub: null,
        github: null,
        tags: ["memory", "c++"],
      },
      {
        title: "Operating System Notes",
        shortDesc: "Learning how computers actually work.",
        content:
          "Operating systems coordinate hardware and software efficiently. Studying them improves every programmer's foundation. Understanding process scheduling and deadlocks translates directly to writing better concurrent web servers.",
        category: "computer-science",
        sub: null,
        github: null,
        tags: ["os", "linux"],
      },
      {
        title: "Compiler Curiosity",
        shortDesc: "Understanding how code becomes software.",
        content:
          "Compilers transform human-readable code into machine instructions. Learning their internals improves programming intuition. Generating Abstract Syntax Trees (ASTs) is a beautiful mix of linguistics and logic.",
        category: "computer-science",
        sub: null,
        github: null,
        tags: ["compilers", "ast"],
      },

      // PROJECTS (Must assign subcategory. "serious" MUST have github)
      {
        title: "Building My Portfolio",
        shortDesc: "Creating projects that matter to me.",
        content:
          "Each completed project teaches valuable lessons. Shipping real software is better than endless planning. This portfolio was built using Node.js, PostgreSQL, and deployed automatically via GitHub actions.",
        category: "projects",
        sub: "serious",
        github: "https://github.com/rotten-lab/portfolio",
        tags: ["web", "showcase"],
      },
      {
        title: "Company Website Rebuild",
        shortDesc: "Designing a clean online web presence.",
        content:
          "A simple website communicates ideas more effectively. Every page should focus on clarity and performance. We stripped out 40% of the old JavaScript payload and moved to static generation.",
        category: "projects",
        sub: "serious",
        github: "https://github.com/rotten-lab/company-site",
        tags: ["frontend", "react"],
      },
      {
        title: "Robotics Prototype Core",
        shortDesc: "Starting the first prototype build.",
        content:
          "Every prototype uncovers new engineering challenges. Small experiments eventually become real products. The chassis is currently 3D printed out of PLA, but we will transition to carbon fiber next month.",
        category: "projects",
        sub: "random",
        github: null,
        tags: ["hardware", "3d-printing"],
      },
      {
        title: "Building an API",
        shortDesc: "Creating reliable scalable backend services.",
        content:
          "Well-designed APIs simplify communication between applications. Documentation is just as important as implementation. We implemented rate limiting and JWT rotation from scratch for maximum security.",
        category: "projects",
        sub: "serious",
        github: "https://github.com/rotten-lab/core-api",
        tags: ["backend", "api"],
      },
      {
        title: "Open Source Scanner Progress",
        shortDesc: "Sharing code analysis tools with everyone.",
        content:
          "Publishing projects encourages collaboration and feedback. Open-source communities accelerate learning. Our AI-based vulnerability scanner successfully identified 3 critical CVEs on its first real-world test run.",
        category: "projects",
        sub: "serious",
        github: "https://github.com/rotten-lab/nuclear-scanner",
        tags: ["security", "ai"],
      },
      {
        title: "Prototype Reflection: Cat Generator",
        shortDesc: "Looking back at early designs and API usage.",
        content:
          "Early versions reveal how much a project has evolved. Every iteration brings better ideas and stronger engineering. Pulling 10,000 cat images via a public API taught me a lot about network retry logic and timeout handling.",
        category: "projects",
        sub: "random",
        github: null,
        tags: ["api", "fun"],
      },

      // DIARY
      {
        title: "Today's Progress",
        shortDesc: "A productive development session today.",
        content:
          "Today I completed small improvements that move the project forward. Progress feels slow until you look back after several weeks. Finally fixed that elusive race condition in the authentication middleware.",
        category: "diary",
        sub: null,
        github: null,
        tags: ["daily", "wins"],
      },
      {
        title: "Learning from Failure",
        shortDesc: "Mistakes become valuable experience.",
        content:
          "Every failed experiment teaches something valuable. Documenting failures prevents repeating the same mistakes. I accidentally dropped the production database today—thankfully, point-in-time recovery saved my job.",
        category: "diary",
        sub: null,
        github: null,
        tags: ["lessons", "fail"],
      },
      {
        title: "Late Night Coding",
        shortDesc: "Quiet hours bring deep work and focus.",
        content:
          "Working late helped me solve a difficult programming problem. Fresh ideas often appear after persistent effort. The silence of the house allows me to hold complex architectural diagrams in my head without interruption.",
        category: "diary",
        sub: null,
        github: null,
        tags: ["focus", "night"],
      },
      {
        title: "Future Vision & Goals",
        shortDesc: "Thinking about long-term technical goals.",
        content:
          "Building durable technology remains my biggest motivation. Long-term thinking shapes better daily decisions. I want to shift my focus entirely toward bio-computational hybrids over the next five years.",
        category: "diary",
        sub: null,
        github: null,
        tags: ["planning", "career"],
      },
      {
        title: "Staying Consistent",
        shortDesc: "Progress achieved strictly through discipline.",
        content:
          "Consistency beats motivation in every ambitious project. Small daily improvements create meaningful results over time. I've maintained a 100-day commit streak without burning out by setting a hard stop at 6 PM.",
        category: "diary",
        sub: null,
        github: null,
        tags: ["discipline", "mindset"],
      },
    ];

    console.log(`🚀 Inserting ${postData.length} posts into the database...`);

    for (const data of postData) {
      await pool.query(
        `INSERT INTO posts (
          author_id, category, subcategory, thumbnail, post_images, 
          title, short_description, main_content, tags, github_link
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          getRandomUserId(),
          data.category,
          data.sub,
          THUMBNAIL_URL,
          POST_IMAGES,
          data.title,
          data.shortDesc,
          data.content,
          data.tags,
          data.github,
        ],
      );
    }

    console.log("✅ Database seeded successfully with massive data payload!");
    console.log(
      "🔑 You can now log in to ANY of the 10 accounts using password: password123",
    );
    console.log(
      "   Example Accounts: superadmin, admin_user, alice_bio, eve_hacker",
    );
  } catch (error) {
    console.error("❌ Error during seeding:", error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

seed();
