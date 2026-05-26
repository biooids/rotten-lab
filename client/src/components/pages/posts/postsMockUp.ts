// src/components/shared/postsMockUp.ts

export const posts = [
  // ==========================================
  // COMPUTER SCIENCE
  // ==========================================
  {
    id: "a1f9c3e2-7b44-4d91-8c1a-3e5b9f2d6c11",
    category: "computer-science",
    thumbnail: "https://picsum.photos/seed/cs1/600/400",
    postImages: [
      "https://picsum.photos/seed/cs1a/800/500",
      "https://picsum.photos/seed/cs1b/800/500",
      "https://picsum.photos/seed/cs1c/800/500",
    ],
    title: "Mastering JavaScript Closures",
    shortDescription: "Closures made simple and practical.",
    mainContent:
      "Closures allow functions to retain access to their lexical scope even after execution.",
    tags: ["JavaScript", "Closures", "Functions", "Frontend"],
    dateCreated: "2026-03-01",
    dateEdited: "2026-03-02",
    externalLink:
      "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Closures",
    githubLink: "https://github.com/example/js-closures",
  },
  {
    id: "b7d2a890-3c11-4fa2-9b77-5c8e1d4f9922",
    category: "computer-science",
    thumbnail: "https://picsum.photos/seed/cs2/600/400",
    postImages: [
      "https://picsum.photos/seed/cs2a/800/500",
      "https://picsum.photos/seed/cs2b/800/500",
    ],
    title: "Understanding REST APIs",
    shortDescription: "How APIs communicate over HTTP.",
    mainContent:
      "REST APIs use HTTP methods like GET and POST to exchange structured data.",
    tags: ["API", "REST", "HTTP", "Backend", "Web"],
    dateCreated: "2026-02-20",
    dateEdited: "2026-02-21",
    externalLink: "https://restfulapi.net/",
    githubLink: "https://github.com/example/rest-api",
  },
  {
    id: "c3e8f112-55a9-4e7c-b3a4-9d2e7b6f7733",
    category: "computer-science",
    thumbnail: "https://picsum.photos/seed/cs3/600/400",
    postImages: [
      "https://picsum.photos/seed/cs3a/800/500",
      "https://picsum.photos/seed/cs3b/800/500",
      "https://picsum.photos/seed/cs3c/800/500",
      "https://picsum.photos/seed/cs3d/800/500",
    ],
    title: "Intro to Docker",
    shortDescription: "Containerize your apps easily.",
    mainContent:
      "Docker packages applications with dependencies into containers for consistency across environments.",
    tags: ["Docker", "DevOps", "Containers", "Deployment"],
    dateCreated: "2026-01-10",
    dateEdited: "2026-01-12",
    externalLink: "https://docs.docker.com/",
    githubLink: "https://github.com/example/docker-intro",
  },
  {
    id: "e5f7d321-1a63-4c88-bb91-2c7f9e0d6655",
    category: "computer-science",
    thumbnail: "https://picsum.photos/seed/cs4/600/400",
    postImages: [
      "https://picsum.photos/seed/cs4a/800/500",
      "https://picsum.photos/seed/cs4b/800/500",
      "https://picsum.photos/seed/cs4c/800/500",
      "https://picsum.photos/seed/cs4d/800/500",
    ],
    title: "Git Branching Strategies",
    shortDescription: "Organize your workflow efficiently.",
    mainContent:
      "Branching allows teams to work independently without affecting the main codebase.",
    tags: ["Git", "Version Control", "Workflow", "Collaboration"],
    dateCreated: "2026-02-01",
    dateEdited: "2026-02-03",
    externalLink:
      "https://git-scm.com/book/en/v2/Git-Branching-Branches-in-a-Nutshell",
    githubLink: "https://github.com/example/git-branches",
  },

  // ==========================================
  // BIO-ENGINEERING
  // ==========================================
  {
    id: "f1a2b3c4-5d6e-7f8a-9b0c-1d2e3f4a5b6c",
    category: "bio-engineering",
    thumbnail: "https://picsum.photos/seed/bio1/600/400",
    postImages: [
      "https://picsum.photos/seed/bio1a/800/500",
      "https://picsum.photos/seed/bio1b/800/500",
    ],
    title: "CRISPR Gene Editing Explained",
    shortDescription: "How we can rewrite DNA sequences.",
    mainContent:
      "CRISPR-Cas9 is a revolutionary gene-editing tool that allows scientists to cut and modify DNA at precise locations. It uses a guide RNA to target specific sequences and Cas9 protein to make the cut.",
    tags: ["CRISPR", "Genetics", "DNA", "BioTech"],
    dateCreated: "2026-03-10",
    dateEdited: "2026-03-11",
    externalLink: "https://www.nature.com/articles/d41586-020-00001-0",
    githubLink: "",
  },
  {
    id: "d9a4b6c1-882e-4f0f-a2c9-6e4d8a1b5544",
    category: "bio-engineering",
    thumbnail: "https://picsum.photos/seed/bio2/600/400",
    postImages: [
      "https://picsum.photos/seed/bio2a/800/500",
      "https://picsum.photos/seed/bio2b/800/500",
      "https://picsum.photos/seed/bio2c/800/500",
    ],
    title: "Synthetic Biology: Building Life",
    shortDescription: "Designing biological systems from scratch.",
    mainContent:
      "Synthetic biology combines engineering principles with biology to design and construct new biological parts, devices, and systems not found in nature.",
    tags: ["Synthetic Biology", "BioEngineering", "DNA Synthesis"],
    dateCreated: "2026-02-15",
    dateEdited: "2026-02-16",
    externalLink: "https://www.genome.gov/genetics-glossary/Synthetic-Biology",
    githubLink: "",
  },
  {
    id: "g2b3c4d5-6e7f-8a9b-0c1d-2e3f4a5b6c7d",
    category: "bio-engineering",
    thumbnail: "https://picsum.photos/seed/bio3/600/400",
    postImages: [
      "https://picsum.photos/seed/bio3a/800/500",
      "https://picsum.photos/seed/bio3b/800/500",
    ],
    title: "Computational Biology: When Code Meets Cells",
    shortDescription: "Using algorithms to understand life.",
    mainContent:
      "Computational biology applies data analysis, mathematical modeling, and simulation to understand biological systems. From protein folding to population genetics, code is becoming essential in biology labs.",
    tags: [
      "Computational Biology",
      "Algorithms",
      "Bioinformatics",
      "Simulation",
    ],
    dateCreated: "2026-04-01",
    dateEdited: "2026-04-02",
    externalLink: "",
    githubLink: "https://github.com/example/bio-algorithms",
  },

  // ==========================================
  // PROJECTS - SERIOUS
  // ==========================================
  {
    id: "p1a2b3c4-5d6e-7f8a-9b0c-1d2e3f4a5b6d",
    category: "projects",
    subcategory: "serious",
    thumbnail: "https://picsum.photos/seed/proj1/600/400",
    postImages: [
      "https://picsum.photos/seed/proj1a/800/500",
      "https://picsum.photos/seed/proj1b/800/500",
      "https://picsum.photos/seed/proj1c/800/500",
    ],
    title: "ProfEdwards — AI Academic Platform",
    shortDescription: "AI-powered grading and document analysis.",
    mainContent:
      "ProfEdwards is an AI-powered academic app with a grading system and PDF parsing via Gemini API. Users can ask questions about uploaded documents. Features text-to-speech for lazy readers. Currently adding speech-to-text so AI can organize professor lectures into structured notes.",
    tags: ["AI", "Gemini API", "Next.js", "Education", "Full Stack"],
    dateCreated: "2026-01-20",
    dateEdited: "2026-04-15",
    externalLink: "",
    githubLink: "https://github.com/protocols-farmer/profedwards",
  },
  {
    id: "p2b3c4d5-6e7f-8a9b-0c1d-2e3f4a5b6c7e",
    category: "projects",
    subcategory: "serious",
    thumbnail: "https://picsum.photos/seed/proj2/600/400",
    postImages: [
      "https://picsum.photos/seed/proj2a/800/500",
      "https://picsum.photos/seed/proj2b/800/500",
    ],
    title: "Open Farm Land — Developer Community",
    shortDescription: "A mini community for builders.",
    mainContent:
      "Open Farm Land is a community platform with real-time chat, post sharing, project journey tracking, guides, articles, and blogs. Built with Next.js, PostgreSQL, and Socket.io for live features.",
    tags: ["Next.js", "PostgreSQL", "Socket.io", "Community", "Full Stack"],
    dateCreated: "2025-11-10",
    dateEdited: "2026-03-20",
    externalLink: "https://open-farm-land-farmer.vercel.app/",
    githubLink: "https://github.com/protocols-farmer/open-farm-land",
  },
  {
    id: "p3c4d5e6-7f8a-9b0c-1d2e-3f4a5b6c7d8f",
    category: "projects",
    subcategory: "serious",
    thumbnail: "https://picsum.photos/seed/proj3/600/400",
    postImages: [
      "https://picsum.photos/seed/proj3a/800/500",
      "https://picsum.photos/seed/proj3b/800/500",
      "https://picsum.photos/seed/proj3c/800/500",
      "https://picsum.photos/seed/proj3d/800/500",
    ],
    title: "Click Follow — Multiplayer Field",
    shortDescription: "Avatars that move by clicking, not joysticks.",
    mainContent:
      "Click Follow is a real-time multiplayer space where avatars move by clicking the screen instead of using a joystick. Includes live chat via Socket.io. Players can see each other move and interact in a shared field.",
    tags: ["Socket.io", "Multiplayer", "Canvas", "Real-time", "Game"],
    dateCreated: "2026-02-01",
    dateEdited: "2026-04-10",
    externalLink: "",
    githubLink: "https://github.com/protocols-farmer/click-follow",
  },
  {
    id: "p4d5e6f7-8a9b-0c1d-2e3f-4a5b6c7d8e9f",
    category: "projects",
    subcategory: "serious",
    thumbnail: "https://picsum.photos/seed/proj4/600/400",
    postImages: [
      "https://picsum.photos/seed/proj4a/800/500",
      "https://picsum.photos/seed/proj4b/800/500",
    ],
    title: "Live Shopping App (WIP)",
    shortDescription: "TikTok-like live shopping for products only.",
    mainContent:
      "Currently building a TikTok-inspired live shopping platform. No videos — just product listings and live streams. Profiles are product showcases. Built with Next.js, WebRTC for streaming, and PostgreSQL.",
    tags: ["Next.js", "WebRTC", "PostgreSQL", "E-commerce", "Streaming", "WIP"],
    dateCreated: "2026-04-01",
    dateEdited: "2026-05-05",
    externalLink: "",
    githubLink: "",
  },

  // ==========================================
  // PROJECTS - RANDOM
  // ==========================================
  {
    id: "r1e5f6a7-8b9c-0d1e-2f3a-4b5c6d7e8f9a",
    category: "projects",
    subcategory: "random",
    thumbnail: "https://picsum.photos/seed/rand1/600/400",
    postImages: [
      "https://picsum.photos/seed/rand1a/800/500",
      "https://picsum.photos/seed/rand1b/800/500",
    ],
    title: "Notes App (The Tutorial Hell One)",
    shortDescription: "My first ever app. Pure vanilla JS pain.",
    mainContent:
      "Built this notes app following a YouTube tutorial back when I thought it would impress college admission officers. CRUD operations, localStorage, and a lot of console.log debugging. It's basic but it's where I started.",
    tags: ["Vanilla JS", "HTML", "CSS", "Beginner", "Tutorial"],
    dateCreated: "2023-10-15",
    dateEdited: "2023-10-15",
    externalLink: "",
    githubLink: "https://github.com/protocols-farmer/notes-app",
  },
  {
    id: "r2f6a7b8-9c0d-1e2f-3a4b-5c6d7e8f9a0b",
    category: "projects",
    subcategory: "random",
    thumbnail: "https://picsum.photos/seed/rand2/600/400",
    postImages: ["https://picsum.photos/seed/rand2a/800/500"],
    title: "House Rent Website (React Clone)",
    shortDescription: "A YouTube React project I didn't understand.",
    mainContent:
      "Built a house rent listing website by blindly following a React tutorial. I didn't know what useState or props were. The UI looked decent though. Looking back, this project taught me that copying code without understanding is pointless.",
    tags: ["React", "YouTube Tutorial", "Beginner", "Frontend"],
    dateCreated: "2024-01-10",
    dateEdited: "2024-01-10",
    externalLink: "",
    githubLink: "https://github.com/protocols-farmer/house-rent",
  },
  {
    id: "r3a7b8c9-0d1e-2f3a-4b5c-6d7e8f9a0b1c",
    category: "projects",
    subcategory: "random",
    thumbnail: "https://picsum.photos/seed/rand3/600/400",
    postImages: [
      "https://picsum.photos/seed/rand3a/800/500",
      "https://picsum.photos/seed/rand3b/800/500",
      "https://picsum.photos/seed/rand3c/800/500",
    ],
    title: "Weather Dashboard (Express.js)",
    shortDescription: "My first backend API integration.",
    mainContent:
      "A weather dashboard that fetches data from OpenWeatherMap API. Built with Express.js and vanilla frontend. First time I understood what an API key was and why you shouldn't commit it to GitHub (learned that the hard way).",
    tags: ["Express.js", "API", "Node.js", "Beginner", "Backend"],
    dateCreated: "2024-03-20",
    dateEdited: "2024-03-22",
    externalLink: "",
    githubLink: "https://github.com/protocols-farmer/weather-dashboard",
  },
  {
    id: "r4b8c9d0-1e2f-3a4b-5c6d-7e8f9a0b1c2d",
    category: "projects",
    subcategory: "random",
    thumbnail: "https://picsum.photos/seed/rand4/600/400",
    postImages: [
      "https://picsum.photos/seed/rand4a/800/500",
      "https://picsum.photos/seed/rand4b/800/500",
    ],
    title: "Portfolio v1 — The Ugly One",
    shortDescription: "Every dev has one. This was mine.",
    mainContent:
      "My first portfolio site. Bright colors, terrible typography, no responsiveness. Built with raw HTML and CSS before I discovered Tailwind. It's still deployed somewhere on Vercel. I keep it as a reminder of progress.",
    tags: ["HTML", "CSS", "Portfolio", "Beginner", "Nostalgia"],
    dateCreated: "2023-12-01",
    dateEdited: "2023-12-01",
    externalLink: "https://old-portfolio-protocols.vercel.app",
    githubLink: "https://github.com/protocols-farmer/old-portfolio",
  },
];
