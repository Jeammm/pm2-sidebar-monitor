import * as path from "path";
import * as vscode from "vscode";
import {
  disconnect,
  formatPm2Error,
  restartProcess,
  startProcess,
  stopProcess,
} from "./pm2Client";
import { openOrCreateConfig } from "./pm2ConfigBootstrap";
import {
  PM2DataProvider,
  PM2ExtraRepoItem,
  PM2ProcessItem,
  PM2TreeItem,
} from "./pm2DataProvider";
import { loadWorkspaceSpec, repoRootFromOrchestration } from "./pm2Services";
import { resolveOrchestrationPath } from "./pm2Workspace";
import {
  runActionInTerminal,
  runExtraRepoCommandInTerminal,
  tailLogsInTerminal,
} from "./pm2Terminal";

const POLL_INTERVAL_MS = 5000;

let pollTimer: ReturnType<typeof setInterval> | undefined;
let dataProvider: PM2DataProvider | undefined;

function startPoll(provider: PM2DataProvider): void {
  if (pollTimer) {
    return;
  }
  pollTimer = setInterval(() => {
    provider.refresh();
    refreshHasActionsContext();
  }, POLL_INTERVAL_MS);
}

function stopPoll(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = undefined;
  }
}

function refreshHasActionsContext(): void {
  const orchestrationPath = resolveOrchestrationPath();
  const actions = orchestrationPath
    ? loadWorkspaceSpec(orchestrationPath).actions
    : [];
  void vscode.commands.executeCommand(
    "setContext",
    "pm2Monitor.hasActions",
    actions.length > 0,
  );
}

function getProcessItem(
  item: PM2TreeItem | undefined,
): PM2ProcessItem | undefined {
  if (
    !item ||
    !(item instanceof PM2ProcessItem) ||
    item.contextValue === "empty" ||
    item.contextValue === "unavailable" ||
    item.contextValue === "detail"
  ) {
    return undefined;
  }
  return item;
}

async function runProcessAction(
  item: PM2TreeItem | undefined,
  action: (pmId: number) => Promise<void>,
  successVerb: string,
  failureVerb: string,
  provider: PM2DataProvider,
): Promise<void> {
  const processItem = getProcessItem(item);
  if (!processItem) {
    void vscode.window.showErrorMessage(
      "PM2 Monitor: No valid process selected.",
    );
    return;
  }

  try {
    await action(processItem.pmId);
    void vscode.window.showInformationMessage(
      `PM2 Monitor: ${successVerb} "${processItem.processName}".`,
    );
  } catch (err) {
    void vscode.window.showErrorMessage(
      `PM2 Monitor: Failed to ${failureVerb} "${processItem.processName}" — ${formatPm2Error(err)}`,
    );
  } finally {
    provider.refresh();
  }
}

async function runConfiguredAction(): Promise<void> {
  const orchestrationPath = resolveOrchestrationPath();
  if (!orchestrationPath) {
    void vscode.window.showErrorMessage(
      "PM2 Monitor: Could not find config/workspace.js — click Config to create one.",
    );
    return;
  }

  const { actions } = loadWorkspaceSpec(orchestrationPath);
  if (actions.length === 0) {
    void vscode.window.showInformationMessage(
      "PM2 Monitor: No workspace actions configured.",
    );
    return;
  }

  if (actions.length === 1) {
    await runActionInTerminal(actions[0]);
    return;
  }

  const picked = await vscode.window.showQuickPick(
    actions.map((a) => ({ label: a.label, action: a })),
    { placeHolder: "Choose a workspace action to run" },
  );
  if (picked) {
    await runActionInTerminal(picked.action);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new PM2DataProvider();
  dataProvider = provider;

  const treeView = vscode.window.createTreeView("pm2-sidebar-monitor", {
    treeDataProvider: provider,
  });

  refreshHasActionsContext();

  context.subscriptions.push(
    treeView,
    treeView.onDidChangeVisibility((e) => {
      if (e.visible) {
        startPoll(provider);
        provider.refresh();
        refreshHasActionsContext();
      } else {
        stopPoll();
      }
    }),
    vscode.commands.registerCommand("pm2-monitor.refresh", () => {
      provider.refresh();
      refreshHasActionsContext();
    }),
    vscode.commands.registerCommand("pm2-monitor.runAction", () => {
      void runConfiguredAction();
    }),
    vscode.commands.registerCommand(
      "pm2-monitor.runExtraRepoCommand",
      (item: PM2ExtraRepoItem) => {
        const orchestrationPath = resolveOrchestrationPath();
        if (!orchestrationPath) {
          void vscode.window.showErrorMessage(
            "PM2 Monitor: Could not find config/workspace.js.",
          );
          return;
        }
        runExtraRepoCommandInTerminal(item.repoSpec, orchestrationPath);
      },
    ),
    vscode.commands.registerCommand("pm2-monitor.openConfig", async () => {
      await openOrCreateConfig();
      provider.refresh();
      refreshHasActionsContext();
    }),
    vscode.commands.registerCommand(
      "pm2-monitor.start",
      (item: PM2ProcessItem) =>
        runProcessAction(item, startProcess, "Started", "start", provider),
    ),
    vscode.commands.registerCommand(
      "pm2-monitor.stop",
      (item: PM2ProcessItem) =>
        runProcessAction(item, stopProcess, "Stopped", "stop", provider),
    ),
    vscode.commands.registerCommand(
      "pm2-monitor.restart",
      (item: PM2ProcessItem) =>
        runProcessAction(item, restartProcess, "Restarted", "restart", provider),
    ),
    vscode.commands.registerCommand(
      "pm2-monitor.logs",
      (item: PM2ProcessItem) => {
        const processItem = getProcessItem(item);
        if (!processItem) {
          void vscode.window.showErrorMessage(
            "PM2 Monitor: No valid process selected.",
          );
          return;
        }

        const inspect = processItem.serviceSpec?.inspect;
        let cwd: string | undefined;
        if (inspect && processItem.serviceSpec) {
          const orchestrationPath = resolveOrchestrationPath();
          if (orchestrationPath) {
            cwd = path.join(
              repoRootFromOrchestration(orchestrationPath),
              processItem.serviceSpec.folder,
            );
          }
        }

        void tailLogsInTerminal(
          processItem.pmId,
          processItem.processName,
          inspect,
          cwd,
        );
      },
    ),
  );

  if (treeView.visible) {
    startPoll(provider);
    provider.refresh();
  }
}

export async function deactivate(): Promise<void> {
  stopPoll();
  dataProvider = undefined;
  await disconnect();
}
