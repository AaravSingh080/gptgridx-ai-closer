import fs from "fs";
import path from "path";

export function loadKnowledge(filePath) {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  return fs.readFileSync(resolvedPath, "utf8");
}