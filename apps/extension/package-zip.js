const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const distDir = path.join(__dirname, "dist");
const outDir = path.join(__dirname, "..", "web", "public");
const outFile = path.join(outDir, "automate-extension.zip");

fs.mkdirSync(outDir, { recursive: true });

const script = `
import zipfile, os
src = ${JSON.stringify(distDir)}
dest = ${JSON.stringify(outFile)}
with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk(src):
        for f in files:
            full = os.path.join(root, f)
            rel = os.path.relpath(full, src)
            zf.write(full, rel)
print("Packaged", dest)
`;

execFileSync(process.env.PYTHON || "python", ["-c", script], { stdio: "inherit" });
