import { PM2ProcessInfo } from "./pm2Client";

export type ProcessContext =
  | "running"
  | "stopped"
  | "errored"
  | "unknown";

export interface ProcessPresentation {
  pmId: number;
  name: string;
  status: string;
  contextValue: ProcessContext;
  label: string;
  metricsDescription: string;
  isHot: boolean;
}

export function formatMemory(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

export function getProcessContext(status: string): ProcessContext {
  switch (status) {
    case "online":
    case "launching":
      return "running";
    case "stopped":
    case "stopping":
      return "stopped";
    case "errored":
      return "errored";
    default:
      return "unknown";
  }
}

export function presentProcess(proc: PM2ProcessInfo): ProcessPresentation {
  const contextValue = getProcessContext(proc.status);
  return {
    pmId: proc.pmId,
    name: proc.name,
    status: proc.status,
    contextValue,
    label: proc.name,
    metricsDescription: `${proc.status} · ${formatMemory(proc.memoryBytes)} MB · ${proc.cpu.toFixed(1)}% CPU`,
    isHot: proc.name.includes("🔥"),
  };
}
