import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webDir = path.join(root, "www");
const webFiles = [
  "index.html",
  "style.css",
  "supabase-config.js",
  "musicbrainz.js",
  "artapi.js",
  "booksapi.js",
  "script.js"
];

await rm(webDir, { recursive: true, force: true });
await mkdir(webDir, { recursive: true });

for (const file of webFiles) {
  await cp(path.join(root, file), path.join(webDir, file));
}

await build({
  entryPoints: [path.join(root, "scripts", "native-bridge.js")],
  bundle: true,
  platform: "browser",
  target: ["es2020"],
  outfile: path.join(webDir, "coucou-native.js")
});

const indexPath = path.join(webDir, "index.html");
const html = await readFile(indexPath, "utf8");
if (!html.includes("</body>")) {
  throw new Error("Cannot stage the app: index.html has no closing body tag.");
}
await writeFile(
  indexPath,
  html.replace("</body>", '       <script src="coucou-native.js"></script>\n</body>'),
  "utf8"
);
