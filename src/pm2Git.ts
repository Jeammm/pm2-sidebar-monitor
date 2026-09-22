import * as fs from "fs";
import * as path from "path";

const branchCache = new Map<string, string>();

export function clearBranchCache(): void {
  branchCache.clear();
}

export function getBranch(repoPath: string): string {
  const cached = branchCache.get(repoPath);
  if (cached !== undefined) {
    return cached;
  }

  const headPath = path.join(repoPath, ".git", "HEAD");
  if (!fs.existsSync(headPath)) {
    branchCache.set(repoPath, "(no git)");
    return "(no git)";
  }

  const head = fs.readFileSync(headPath, "utf8").trim();
  let branch: string;
  if (head.startsWith("ref:")) {
    branch = head.replace(/^ref: refs\/heads\//, "");
  } else {
    branch = head.slice(0, 7);
  }

  branchCache.set(repoPath, branch);
  return branch;
}
