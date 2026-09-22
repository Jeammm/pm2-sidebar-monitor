import * as path from "path";
import * as vscode from "vscode";
import { formatPm2Error, listProcesses, PM2ProcessInfo } from "./pm2Client";
import { clearBranchCache, getBranch } from "./pm2Git";
import { presentProcess } from "./pm2ProcessUtils";
import {
  ExtraRepoSpec,
  extraRepoPaths,
  loadServices,
  matchService,
  repoRootFromOrchestration,
  ServiceSpec,
} from "./pm2Services";
import { resolveOrchestrationPath } from "./pm2Workspace";

const UNAVAILABLE_LABEL = "PM2 unavailable — is the daemon running?";
const NO_WORKSPACE_LABEL = "No PM2 workspace found — click Config to create one";
const SECTION_DIVIDER = "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";

export class PM2ProcessDetailItem extends vscode.TreeItem {
  constructor(branch: string, metricsDescription: string, parentId: string) {
    super(branch, vscode.TreeItemCollapsibleState.None);
    this.description = metricsDescription;
    this.contextValue = "detail";
    this.iconPath = new vscode.ThemeIcon("git-branch");
    this.id = `${parentId}:detail`;
  }
}

export class PM2ProcessItem extends vscode.TreeItem {
  readonly detailItem: PM2ProcessDetailItem;

  constructor(
    public readonly pmId: number,
    public readonly processName: string,
    public readonly status: string,
    label: string,
    contextValue: string,
    description: string,
    detailItem: PM2ProcessDetailItem,
    public readonly serviceSpec?: ServiceSpec,
  ) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = contextValue;
    this.description = description;
    this.id = `${pmId}:${processName}`;
    this.detailItem = detailItem;
  }
}

export class PM2SectionDividerItem extends vscode.TreeItem {
  constructor(id: string) {
    super(SECTION_DIVIDER, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "section-divider";
    this.id = id;
  }
}

export class PM2ExtraRepoDetailItem extends vscode.TreeItem {
  constructor(branch: string, parentId: string) {
    super(branch, vscode.TreeItemCollapsibleState.None);
    this.description = "current branch";
    this.contextValue = "detail";
    this.iconPath = new vscode.ThemeIcon(
      "git-branch",
      new vscode.ThemeColor("charts.purple"),
    );
    this.id = `${parentId}:detail`;
  }
}

export class PM2ExtraRepoItem extends vscode.TreeItem {
  readonly detailItem: PM2ExtraRepoDetailItem;

  constructor(
    public readonly repoSpec: ExtraRepoSpec,
    branch: string,
  ) {
    super(repoSpec.label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = repoSpec.command ? "extra-repo" : "extra-repo-readonly";
    this.id = `extra-repo:${repoSpec.id}`;
    this.iconPath = new vscode.ThemeIcon(
      "database",
      new vscode.ThemeColor("charts.purple"),
    );
    this.detailItem = new PM2ExtraRepoDetailItem(branch, this.id);
  }
}

export class PM2InfoItem extends vscode.TreeItem {
  constructor(label: string, icon: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "info";
    this.iconPath = new vscode.ThemeIcon(icon);
  }
}

export type PM2TreeItem =
  | PM2ProcessItem
  | PM2ProcessDetailItem
  | PM2ExtraRepoItem
  | PM2ExtraRepoDetailItem
  | PM2SectionDividerItem
  | PM2InfoItem;

function statusIcon(contextValue: string): vscode.ThemeIcon {
  switch (contextValue) {
    case "running":
      return new vscode.ThemeIcon(
        "circle-filled",
        new vscode.ThemeColor("charts.green"),
      );
    case "stopped":
      return new vscode.ThemeIcon(
        "circle-outline",
        new vscode.ThemeColor("charts.red"),
      );
    case "errored":
      return new vscode.ThemeIcon(
        "error",
        new vscode.ThemeColor("charts.orange"),
      );
    default:
      return new vscode.ThemeIcon("question");
  }
}

function resolveBranchFor(folderPath: string | undefined): string {
  if (!folderPath) {
    return "(unknown)";
  }
  return getBranch(folderPath);
}

function toProcessItem(
  proc: PM2ProcessInfo,
  repoPath: string | undefined,
  service: ServiceSpec,
): PM2ProcessItem {
  const presentation = presentProcess(proc);
  const parentId = `${presentation.pmId}:${presentation.name}`;
  const branch = resolveBranchFor(repoPath);
  const detailItem = new PM2ProcessDetailItem(
    branch,
    presentation.metricsDescription,
    parentId,
  );

  // tsfc's pm2 names already embed "<port> <name>"; ktc's don't — prefer the
  // spec's port for a consistent display without requiring a rename on ktc's side.
  const alreadyPrefixed = /^\d+\s/.test(presentation.name);
  const displayLabel =
    !alreadyPrefixed && service.port
      ? `${service.port} ${presentation.name}`
      : presentation.label;

  const item = new PM2ProcessItem(
    presentation.pmId,
    presentation.name,
    presentation.status,
    displayLabel,
    presentation.contextValue,
    presentation.isHot ? "HOT" : "",
    detailItem,
    service,
  );
  item.iconPath = statusIcon(presentation.contextValue);
  return item;
}

function unavailableItem(): PM2ProcessItem {
  const detailItem = new PM2ProcessDetailItem("", "", "unavailable");
  const item = new PM2ProcessItem(
    -1,
    UNAVAILABLE_LABEL,
    "unavailable",
    UNAVAILABLE_LABEL,
    "unavailable",
    "",
    detailItem,
  );
  item.iconPath = new vscode.ThemeIcon("warning");
  item.collapsibleState = vscode.TreeItemCollapsibleState.None;
  return item;
}

function emptyItem(label: string): PM2ProcessItem {
  const empty = new PM2ProcessItem(
    -1,
    "(no processes)",
    "empty",
    label,
    "empty",
    "",
    new PM2ProcessDetailItem("", "", "empty"),
  );
  empty.iconPath = new vscode.ThemeIcon("info");
  empty.collapsibleState = vscode.TreeItemCollapsibleState.None;
  return empty;
}

export class PM2DataProvider implements vscode.TreeDataProvider<PM2TreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    PM2TreeItem | undefined | null | void
  >();

  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private refreshGeneration = 0;
  private lastErrorMessage: string | undefined;
  private lastErrorShownAt = 0;

  refresh(): void {
    clearBranchCache();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: PM2TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: PM2TreeItem): Promise<PM2TreeItem[]> {
    if (
      element instanceof PM2ProcessDetailItem ||
      element instanceof PM2ExtraRepoDetailItem ||
      element instanceof PM2SectionDividerItem ||
      element instanceof PM2InfoItem
    ) {
      return [];
    }

    if (element instanceof PM2ExtraRepoItem) {
      return [element.detailItem];
    }

    if (element instanceof PM2ProcessItem) {
      if (
        element.contextValue === "empty" ||
        element.contextValue === "unavailable"
      ) {
        return [];
      }
      return [element.detailItem];
    }

    const orchestrationPath = resolveOrchestrationPath();
    if (!orchestrationPath) {
      // Quiet, no toast — this is the common case of an unrelated folder open.
      return [new PM2InfoItem(NO_WORKSPACE_LABEL, "info")];
    }

    const services = loadServices(orchestrationPath);
    const extraRepoItems = extraRepoPaths(orchestrationPath).map(
      ({ spec, path: repoPath }) =>
        new PM2ExtraRepoItem(spec, resolveBranchFor(repoPath)),
    );
    const divider =
      extraRepoItems.length > 0
        ? [new PM2SectionDividerItem("divider:extra-repos")]
        : [];

    const generation = ++this.refreshGeneration;

    try {
      const allProcesses = await listProcesses();
      if (generation !== this.refreshGeneration) {
        return [];
      }

      this.lastErrorMessage = undefined;

      const matched = allProcesses
        .map((proc) => ({ proc, service: matchService(proc.name, services) }))
        .filter(
          (entry): entry is { proc: PM2ProcessInfo; service: ServiceSpec } =>
            entry.service !== undefined,
        );

      matched.sort((a, b) => {
        const portA = a.service.port ?? Number.MAX_SAFE_INTEGER;
        const portB = b.service.port ?? Number.MAX_SAFE_INTEGER;
        return portA - portB || a.service.name.localeCompare(b.service.name);
      });

      if (matched.length === 0) {
        return [
          emptyItem("(no PM2 processes for this workspace)"),
          ...divider,
          ...extraRepoItems,
        ];
      }

      const repoRoot = repoRootFromOrchestration(orchestrationPath);
      const items = matched.map(({ proc, service }) =>
        toProcessItem(proc, path.join(repoRoot, service.folder), service),
      );

      return [...items, ...divider, ...extraRepoItems];
    } catch (err) {
      if (generation !== this.refreshGeneration) {
        return [];
      }

      const message = formatPm2Error(err);
      this.maybeShowError(message);
      return [unavailableItem(), ...divider, ...extraRepoItems];
    }
  }

  private maybeShowError(message: string): void {
    const now = Date.now();
    if (
      message === this.lastErrorMessage &&
      now - this.lastErrorShownAt < 10_000
    ) {
      return;
    }

    this.lastErrorMessage = message;
    this.lastErrorShownAt = now;
    void vscode.window.showErrorMessage(`PM2 Monitor: ${message}`);
  }
}
