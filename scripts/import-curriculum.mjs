import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const ids = {
  basic: [
    "cat",
    "sun",
    "rainbow",
    "balloon",
    "flower",
    "apple",
    "fish",
    "ladybird",
    "ice-cream",
    "mushroom",
  ],
  intermediate: [
    "dog",
    "turtle",
    "butterfly",
    "owl",
    "sailboat",
    "rocket",
    "house",
    "train",
    "cactus",
    "robot",
  ],
  expert: [
    "bird",
    "fox",
    "elephant",
    "rabbit",
    "cup",
    "fruit-bowl",
    "tree-path",
    "castle",
    "lighthouse",
    "coral",
  ],
};
const shortTitles = {
  intermediate: [
    "Sitting dog",
    "Turtle",
    "Butterfly",
    "Owl",
    "Sailboat",
    "Space rocket",
    "House and garden",
    "Toy locomotive",
    "Potted cactus",
    "Friendly robot",
  ],
};
const clean = (value = "") =>
  value.replace(/\*\*/g, "").replace(/[“”]/g, "").trim();
function field(body, name) {
  const match = body.match(
    new RegExp(`^\\*\\*(?:${name})[^*\\n]*\\*\\*:?\\s*(.*)$`, "im"),
  );
  const value = match?.[1] ?? "";
  // Adult reference/safety notes following a quoted utterance are not narration.
  return clean(
    value.startsWith("“") ? value.slice(1, value.indexOf("”")) : value,
  );
}
const catalogue = {};
for (const [level, lessonIds] of Object.entries(ids)) {
  const text = readFileSync(
    `${root}research/curriculum/${level}-drawing.md`,
    "utf8",
  );
  const headings = [...text.matchAll(/^## (.+)$/gm)];
  const sections = headings.flatMap((heading, index) => {
    if (!/^\d+\. /.test(heading[1]) && !heading[1].startsWith("intermediate-"))
      return [];
    const body = text.slice(
      heading.index + heading[0].length,
      headings[index + 1]?.index ?? text.length,
    );
    const title = heading[1]
      .replace(/^\d+\. /, "")
      .replace(/^intermediate-[\w-]+ — /, "");
    const actions = body.split("\n").flatMap((row) => {
      if (!/^\| \d+(?:[.\s])/.test(row)) return [];
      const cells = row.split("|").slice(1, -1).map(clean);
      const number = Number(cells[0].match(/^\d+/)[0]);
      const instruction =
        cells.length === 2 ? cells[0].replace(/^\d+\. /, "") : cells[1];
      const optional = /optional/i.test(cells[0] + " " + instruction);
      return [
        {
          number,
          instruction: instruction
            .replace(/\s*Optional(?: pretend detail)?\.?\s*/gi, "")
            .replace(/^:\s*/, "")
            .trim(),
          hint: cells.at(-1),
          optional,
        },
      ];
    });
    if (actions.some((action, index) => action.number !== index + 1))
      throw new Error(`Action order: ${title}`);
    return [
      {
        title,
        level,
        objective: field(body, "Objective"),
        prepare: field(body, "Preparation"),
        observe: field(body, "Observation"),
        explore: field(body, "Exploration|Creative exploration"),
        parentNote: field(body, "Parent scaffold"),
        simplify: field(body, "Simplification"),
        transfer: field(body, "Later transfer"),
        actions,
      },
    ];
  });
  if (sections.length !== 10) throw new Error(`${level} must have ten lessons`);
  sections.forEach((section, index) => {
    const id = lessonIds[index];
    if (
      !section.objective ||
      !section.prepare ||
      !section.observe ||
      !section.explore ||
      !section.actions.length
    )
      throw new Error(`Incomplete script: ${id}`);
    catalogue[id] = {
      id,
      ...section,
      title: shortTitles[level]?.[index] ?? section.title,
    };
  });
}
writeFileSync(
  `${root}src/curriculum-scripts.json`,
  `${JSON.stringify(catalogue, null, 2)}\n`,
);
console.log(
  `Imported ${Object.keys(catalogue).length} complete lesson scripts.`,
);
