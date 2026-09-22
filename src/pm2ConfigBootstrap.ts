import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { resolveOrCreateTargetDir, resolveOrchestrationPath } from "./pm2Workspace";

const BOOTSTRAP_TEMPLATE = `/**
 * This file is empty scaffolding for a new PM2 Monitor workspace.
 *
 * To fill it in (a human or an AI assistant can do this):
 *  - "services": one entry per sibling repo that runs as a long-lived process
 *    (a frontend, a backend API, etc). Each needs a "name" matching (or
 *    matched from) its pm2 process name, a "folder" (the repo dir name,
 *    sibling to this workspace/ folder), and an optional "port".
 *  - "extraRepos": repos that are NOT running processes — e.g. a shared
 *    database/schema/client-library repo. "command" is optional; omit it
 *    for a repo with nothing to run yet (it will just show its name +
 *    current branch, with no action button).
 *  - "actions": optional workspace-level scripts (e.g. a hot/cold swap
 *    tool) exposed as a toolbar button. Leave the array empty if you don't
 *    have one yet — the button hides itself when there's nothing to run.
 *
 * See these filled-in examples for reference:
 *   /home/jeammm/tsfc/workspace/config/workspace.js
 *   /home/jeammm/ktc/workspace/config/workspace.js
 *
 * @typedef {Object} ServiceSpec
 * @property {string} name    - pm2 process display name to match (exact, or the
 *                               "<name>" token in a "<port> <name>[ suffix]" pm2 name)
 * @property {string} folder  - repo dir name, sibling to this workspace/ folder
 * @property {number} [port]
 * @property {string} [role]  - free-form tag, only used by this project's own
 *                               PM2 ecosystem-file generator, if it has one
 * @property {{label: string, run: string}} [inspect] - override for the "View Logs" action
 *
 * @typedef {Object} ExtraRepoSpec
 * @property {string} id
 * @property {string} label
 * @property {string} folder
 * @property {{label: string, run: string}} [command]
 *
 * @typedef {Object} ActionSpec
 * @property {string} id
 * @property {string} label
 * @property {string} run
 * @property {string} [icon]
 *
 * @typedef {Object} WorkspaceSpec
 * @property {1} version
 * @property {string} project
 * @property {ServiceSpec[]} services
 * @property {ExtraRepoSpec[]} extraRepos
 * @property {ActionSpec[]} actions
 */

/** @type {WorkspaceSpec} */
module.exports = {
  version: 1,
  project: "__PROJECT__",
  services: [],
  extraRepos: [],
  actions: [],
};
`;

export async function openOrCreateConfig(): Promise<void> {
  const existing = resolveOrchestrationPath();
  if (existing) {
    const filePath = path.join(existing, "config", "workspace.js");
    const doc = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(doc);
    return;
  }

  const targetDir = resolveOrCreateTargetDir();
  if (!targetDir) {
    void vscode.window.showErrorMessage(
      "PM2 Monitor: No folder open to create a config in.",
    );
    return;
  }

  const configDir = path.join(targetDir, "config");
  fs.mkdirSync(configDir, { recursive: true });

  const filePath = path.join(configDir, "workspace.js");
  if (!fs.existsSync(filePath)) {
    const projectGuess =
      path.basename(path.dirname(targetDir)) || path.basename(targetDir);
    const content = BOOTSTRAP_TEMPLATE.replace("__PROJECT__", projectGuess);
    fs.writeFileSync(filePath, content, "utf8");
  }

  const doc = await vscode.workspace.openTextDocument(filePath);
  await vscode.window.showTextDocument(doc);
}
