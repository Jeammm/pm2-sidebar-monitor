import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

const SPEC_FILE = path.join("config", "workspace.js");

function candidatePaths(): string[] {
  const candidates: string[] = [];
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    candidates.push(folder.uri.fsPath);
    candidates.push(path.join(folder.uri.fsPath, "workspace"));
  }
  return candidates;
}

/** All workspace/ folders (across every open root) that have a config/workspace.js. */
export function resolveOrchestrationPaths(): string[] {
  const configured = vscode.workspace
    .getConfiguration("pm2-monitor")
    .get<string>("orchestrationPath")
    ?.trim();

  const found: string[] = [];

  if (configured && fs.existsSync(path.join(configured, SPEC_FILE))) {
    found.push(configured);
  }

  for (const candidate of candidatePaths()) {
    if (
      fs.existsSync(path.join(candidate, SPEC_FILE)) &&
      !found.includes(candidate)
    ) {
      found.push(candidate);
    }
  }

  return found;
}

export function resolveOrchestrationPath(): string | undefined {
  return resolveOrchestrationPaths()[0];
}

export async function requireOrchestrationPath(): Promise<string | undefined> {
  const orchestrationPath = resolveOrchestrationPath();
  if (orchestrationPath) {
    return orchestrationPath;
  }

  await vscode.window.showErrorMessage(
    "PM2 Monitor: Could not find config/workspace.js — open the project's workspace/ folder, click Config to create one, or set pm2-monitor.orchestrationPath.",
  );
  return undefined;
}

/**
 * Resolves where a new config/workspace.js should be created when none exists yet.
 * Prefers the configured orchestrationPath, then a folder literally named
 * "workspace" (or one that already has a config/ dir) among the open workspace
 * folders, else targets <firstWorkspaceFolder>/workspace.
 */
export function resolveOrCreateTargetDir(): string | undefined {
  const configured = vscode.workspace
    .getConfiguration("pm2-monitor")
    .get<string>("orchestrationPath")
    ?.trim();
  if (configured) {
    return configured;
  }

  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    return undefined;
  }

  const root = folder.uri.fsPath;
  if (
    path.basename(root) === "workspace" ||
    fs.existsSync(path.join(root, "config"))
  ) {
    return root;
  }

  return path.join(root, "workspace");
}
