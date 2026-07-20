const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const watch = process.argv.includes("--watch");
const outdir = path.join(__dirname, "dist");

fs.mkdirSync(outdir, { recursive: true });
fs.copyFileSync(path.join(__dirname, "manifest.json"), path.join(outdir, "manifest.json"));
fs.copyFileSync(path.join(__dirname, "popup.html"), path.join(outdir, "popup.html"));

const buildOptions = {
  entryPoints: [
    path.join(__dirname, "src/background.ts"),
    path.join(__dirname, "src/content.ts"),
    path.join(__dirname, "src/popup.ts"),
    path.join(__dirname, "src/themeBridge.ts"),
  ],
  bundle: true,
  outdir,
  format: "iife",
  target: "chrome110",
  logLevel: "info",
};

async function run() {
  if (watch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log("Watching for changes...");
  } else {
    await esbuild.build(buildOptions);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
