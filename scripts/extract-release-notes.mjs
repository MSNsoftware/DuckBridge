import fs from "node:fs";
import path from "node:path";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const tag = (arg("tag") || process.env.GITHUB_REF_NAME || "").replace(/^v/, "").trim();
const changelogPath = path.resolve("CHANGELOG.md");

if (!fs.existsSync(changelogPath)) {
  console.log("No CHANGELOG.md found.");
  process.exit(0);
}

const content = fs.readFileSync(changelogPath, "utf8");
const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const regex = new RegExp(`##\\s*\\[?v?${escapedTag}\\]?[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, "i");
const match = content.match(regex);

if (match && match[1].trim()) {
  const notes = match[1].trim();
  fs.writeFileSync("RELEASE_NOTES.md", notes + "\n", "utf8");
  console.log(`Extracted release notes for ${tag} into RELEASE_NOTES.md`);
} else {
  console.log(`No specific release notes found in CHANGELOG.md for version ${tag}.`);
  fs.writeFileSync("RELEASE_NOTES.md", `Release v${tag}\n`, "utf8");
}
