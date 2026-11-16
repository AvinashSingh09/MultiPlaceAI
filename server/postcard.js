import sharp from "sharp";

// Photo rectangles in the 1200 × 1800 India templates.
const panels = [
  { left: 13, top: 17, width: 577, height: 742 },
  { left: 608, top: 17, width: 576, height: 742 },
  { left: 13, top: 791, width: 578, height: 741 },
  { left: 608, top: 791, width: 579, height: 742 },
];

export function postcardPrompt(people) {
  return [
    "Edit image 1, the four-panel travel postcard. Use image 2 only as the reference for the replacement face identities.",
    `Replace exactly ${people} ${people === 1 ? "face" : "faces"} in each of the four panels with the corresponding ${people === 1 ? "identity" : "identities"} from image 2.`,
    "Match faces left to right within each panel and use the same mapping across all four scenes. Preserve recognizable facial structure, skin tone, and distinctive features from the reference. Blend each face into the existing head angle, lighting, and expression of its template scene.",
    "Keep image 1's exact canvas framing, four-panel positions, divider widths, footer, and text. Keep the landmarks, backgrounds, clothing, hair, bodies, and poses in their original positions. Make changes only around the faces. Return the complete edited postcard.",
  ].join("\n");
}

export async function restorePostcardFrame(templateImage, editedImage) {
  const { width, height } = await sharp(templateImage).metadata();
  const aligned = await sharp(editedImage)
    .resize(width, height, { fit: "fill" })
    .png()
    .toBuffer();
  const layers = await Promise.all(panels.map(async (panel) => ({
    input: await sharp(aligned).extract(panel).png().toBuffer(),
    left: panel.left,
    top: panel.top,
  })));
  return sharp(templateImage).composite(layers).png().toBuffer();
}
