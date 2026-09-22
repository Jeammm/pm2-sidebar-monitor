import * as path from "path";

export interface ServiceSpec {
  name: string;
  folder: string;
  port?: number;
  role?: string;
  inspect?: { label: string; run: string };
}

export interface ExtraRepoSpec {
  id: string;
  label: string;
  folder: string;
  command?: { label: string; run: string };
}

export interface ActionSpec {
  id: string;
  label: string;
  run: string;
  icon?: string;
}

export interface WorkspaceSpec {
  version: number;
  project: string;
  services: ServiceSpec[];
  extraRepos: ExtraRepoSpec[];
  actions: ActionSpec[];
}

export function repoRootFromOrchestration(orchestrationPath: string): string {
  return path.join(orchestrationPath, "..");
}

function specPath(orchestrationPath: string): string {
  return path.join(orchestrationPath, "config", "workspace.js");
}

export function loadWorkspaceSpec(orchestrationPath: string): WorkspaceSpec {
  const file = specPath(orchestrationPath);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const resolved = require.resolve(file);
  // Bust require's cache so edits to config/workspace.js are picked up on refresh,
  // without requiring an extension host reload.
  delete require.cache[resolved];
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const raw = require(resolved) as Partial<WorkspaceSpec>;
  return {
    version: raw.version ?? 1,
    project: raw.project ?? "",
    services: raw.services ?? [],
    extraRepos: raw.extraRepos ?? [],
    actions: raw.actions ?? [],
  };
}

export function loadServices(orchestrationPath: string): ServiceSpec[] {
  return loadWorkspaceSpec(orchestrationPath).services;
}

/**
 * Matches a raw pm2 process name against the service list. Tries an exact
 * name match first (e.g. ktc's un-prefixed "ktc-crm-bff"), then falls back
 * to tsfc's "<port> <name>[ suffix]" convention (e.g. "8000 core 🔥").
 */
export function matchService(
  processName: string,
  services: ServiceSpec[],
): ServiceSpec | undefined {
  const exact = services.find((s) => s.name === processName);
  if (exact) {
    return exact;
  }

  const match = /^(\d+)\s+(\S+)/.exec(processName);
  if (!match) {
    return undefined;
  }

  const port = Number.parseInt(match[1], 10);
  const name = match[2];
  // No port-only fallback: two projects can legitimately use the same port
  // (e.g. tsfc's "fe" and ktc's "ktc-crm-web" both on 3000). Matching by
  // port alone would let one project's process bleed into another's tree.
  return services.find((s) => s.port === port && s.name === name);
}

export function serviceRepoPath(
  processName: string,
  orchestrationPath: string,
): string | undefined {
  const service = matchService(processName, loadServices(orchestrationPath));
  if (!service) {
    return undefined;
  }

  return path.join(
    repoRootFromOrchestration(orchestrationPath),
    service.folder,
  );
}

export function extraRepoPaths(
  orchestrationPath: string,
): { spec: ExtraRepoSpec; path: string }[] {
  const spec = loadWorkspaceSpec(orchestrationPath);
  const repoRoot = repoRootFromOrchestration(orchestrationPath);
  return spec.extraRepos.map((repo) => ({
    spec: repo,
    path: path.join(repoRoot, repo.folder),
  }));
}
