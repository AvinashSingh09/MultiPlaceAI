const indiaPlaces = ["Jaipur", "Srinagar", "Alappuzha", "Agra"];

export const templates = [
  {
    id: "world-tour",
    name: "Men’s India template",
    collection: "India travel collection",
    file: "India-1.png",
    people: 3,
    scenes: 4,
    places: indiaPlaces,
  },
  {
    id: "world-tour-2",
    name: "Women’s India template",
    collection: "India travel collection",
    file: "India-2.png",
    people: 3,
    scenes: 4,
    places: indiaPlaces,
  },
  {
    id: "india-solo-men",
    name: "Men’s India template",
    collection: "India travel collection",
    file: "India-Solo-Men.png",
    people: 1,
    scenes: 4,
    places: indiaPlaces,
  },
  {
    id: "india-solo-women",
    name: "Women’s India template",
    collection: "India travel collection",
    file: "India-Solo-Women.png",
    people: 1,
    scenes: 4,
    places: indiaPlaces,
  },
  {
    id: "india-duo-men",
    name: "Men’s India template",
    collection: "India travel collection",
    file: "India-Duo-Men.png",
    people: 2,
    scenes: 4,
    places: indiaPlaces,
  },
  {
    id: "india-duo-women",
    name: "Women’s India template",
    collection: "India travel collection",
    file: "India-Duo-Women.png",
    people: 2,
    scenes: 4,
    places: indiaPlaces,
  },
];
export function ghibliPrompt() {
  return `Transform the input photo into a richly hand-painted Japanese animated-film illustration with a warm, whimsical fantasy atmosphere. Preserve every person's identity, facial structure, expression, pose, clothing, group arrangement, and the original scene composition. Use expressive but recognizable faces, soft watercolor backgrounds, organic linework, gentle natural lighting, lush color, and detailed cel-painted textures. Keep all people present and do not add text, borders, logos, or extra characters. Return only the finished illustration.`;
}

