import * as path from "path";
import * as vscode from "vscode";
import { ActionSpec, ExtraRepoSpec, repoRootFromOrchestration } from "./pm2Services";
import { requireOrchestrationPath } from "./pm2Workspace";

function openTerminal(name: string, cwd: string, command: string): void {
  const terminal = vscode.window.createTerminal({ name, cwd });
  terminal.show();
  terminal.sendText(command, true);
}

export async function runActionInTerminal(action: ActionSpec): Promise<void> {
  const orchestrationPath = await requireOrchestrationPath();
  if (!orchestrationPath) {
    return;
  }

  openTerminal(action.label, orchestrationPath, action.run);
}

export function runExtraRepoCommandInTerminal(
  repo: ExtraRepoSpec,
  orchestrationPath: string,
): void {
  if (!repo.command) {
    return;
  }

  const repoPath = path.join(
    repoRootFromOrchestration(orchestrationPath),
    repo.folder,
  );
  openTerminal(repo.command.label, repoPath, repo.command.run);
}

export async function tailLogsInTerminal(
  pmId: number,
  processName: string,
  inspect?: { label: string; run: string },
  cwd?: string,
): Promise<void> {
  const orchestrationPath = await requireOrchestrationPath();
  if (!orchestrationPath) {
    return;
  }

  if (inspect) {
    openTerminal(inspect.label, cwd ?? orchestrationPath, inspect.run);
    return;
  }

  openTerminal(
    `PM2 logs: ${processName}`,
    orchestrationPath,
    `pm2 logs ${pmId}`,
  );
}
