const indiaPlaces = ["Jaipur", "Srinagar", "Alappuzha", "Agra"];

export const templates = [
  {
    id: "world-tour",
    name: "Across India",
    collection: "India travel collection",
    file: "India-1.png",
    people: 3,
    scenes: 4,
    places: indiaPlaces,
  },
  {
    id: "world-tour-2",
    name: "Across India — II",
    collection: "India travel collection",
    file: "India-2.png",
    people: 3,
    scenes: 4,
    places: indiaPlaces,
  },
];
export function ghibliPrompt() {
  return `Transform the input photo into a richly hand-painted Japanese animated-film illustration with a warm, whimsical fantasy atmosphere. Preserve every person's identity, facial structure, expression, pose, clothing, group arrangement, and the original scene composition. Use expressive but recognizable faces, soft watercolor backgrounds, organic linework, gentle natural lighting, lush color, and detailed cel-painted textures. Keep all people present and do not add text, borders, logos, or extra characters. Return only the finished illustration.`;
}

