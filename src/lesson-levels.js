export const LEVELS = Object.freeze([
  {
    id: "basic",
    name: "Basic drawing",
    short: "Basic",
    description: "Little lines, curves and shapes.",
    image: "/brand/flower.webp",
  },
  {
    id: "intermediate",
    name: "Intermediate drawing",
    short: "Intermediate",
    description: "Connect shapes. Find new possibilities.",
    image: "/brand/dog.webp",
  },
  {
    id: "expert",
    name: "Expert drawing",
    short: "Expert",
    description: "Explore overlap, viewpoints and scenes.",
    image: "/brand/bird.webp",
  },
]);
export const getLevel = (id) => LEVELS.find((level) => level.id === id) ?? null;
