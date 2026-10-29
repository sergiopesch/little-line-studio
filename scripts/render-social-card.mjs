// Rebuild the sharing card from local brand artwork and the app's pinned font.
// This is an authoring command; production builds use the checked-in PNG.
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const data = async (path, type) => `data:${type};base64,${(await readFile(new URL(path, import.meta.url))).toString("base64")}`;
const [regular, heavy, pencil, flower, dog, bird] = await Promise.all([
  data("../node_modules/@fontsource/nunito/files/nunito-latin-400-normal.woff2", "font/woff2"),
  data("../node_modules/@fontsource/nunito/files/nunito-latin-900-normal.woff2", "font/woff2"),
  ...["pencil", "flower", "dog", "bird"].map(name => data(`../public/brand/${name}.webp`, "image/webp")),
]);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>Trazolino sharing card</title>
    <style>
      @font-face { font-family: Nunito; font-weight: 400; src: url("${regular}"); }
      @font-face { font-family: Nunito; font-weight: 900; src: url("${heavy}"); }
      * { box-sizing: border-box; }
      body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #fffdfa; color: #17202f; font-family: Nunito, sans-serif; }
      header { position: absolute; top: 46px; left: 72px; display: flex; align-items: center; gap: 22px; font-size: 32px; font-weight: 900; }
      header img { width: 52px; height: 40px; object-fit: contain; }
      h1 { position: absolute; top: 158px; left: 75px; margin: 0; font-size: 55px; line-height: 1.12; font-weight: 900; letter-spacing: -1px; }
      h1 span { border-bottom: 9px solid #f8d65d; }
      p { position: absolute; top: 310px; left: 75px; margin: 0; font-size: 27px; line-height: 1.4; color: #58616f; }
      footer { position: absolute; bottom: 66px; left: 75px; padding: 12px 19px; border-radius: 3px; background: #fff3c6; font-weight: 900; font-size: 20px; }
      .bird { position: absolute; width: 325px; top: 36px; right: 5px; }
      .flower { position: absolute; width: 290px; bottom: 45px; right: 245px; }
      .dog { position: absolute; width: 330px; bottom: 45px; right: 0; }
    </style></head><body>
    <header><img src="${pencil}" alt=""><span>Trazolino</span></header>
    <h1>Every drawing starts<br><span>with a little line.</span></h1>
    <p>A little guidance on screen.<br>A world of imagination on paper.</p>
    <img class="bird" src="${bird}" alt=""><img class="flower" src="${flower}" alt=""><img class="dog" src="${dog}" alt="">
    <footer>Draw together. Make it yours.</footer></body></html>`);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.decode()));
  });
  const output = new URL("../public/brand/social-card.png", import.meta.url);
  await writeFile(output, await page.screenshot());
  console.log(`Rendered ${output.pathname} (1200 × 630)`);
} finally {
  await browser.close();
}
