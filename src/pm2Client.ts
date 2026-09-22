import pm2 from "pm2";

export interface PM2ProcessInfo {
  pmId: number;
  name: string;
  status: string;
  memoryBytes: number;
  cpu: number;
}

let connected = false;

function promisify<T>(
  fn: (cb: (err: Error | null, result?: T) => void) => void,
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    fn((err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
}

function promisifyProcessAction(
  processId: number | string,
  action: "restart" | "stop",
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cb = (err: Error | null) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    };

    if (action === "restart") {
      pm2.restart(processId, cb);
    } else {
      pm2.stop(processId, cb);
    }
  });
}

export function formatPm2Error(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (
    message.includes("ECONNREFUSED") ||
    message.includes("connect EPERM") ||
    message.includes("PM2 daemon")
  ) {
    return "PM2 daemon is not running. Start it with `npm run dev` from the workspace.";
  }
  return message;
}

export async function connect(): Promise<void> {
  if (connected) {
    return;
  }
  await promisify<void>((cb) => pm2.connect(cb));
  connected = true;
}

export async function disconnect(): Promise<void> {
  if (!connected) {
    return;
  }
  pm2.disconnect();
  connected = false;
}

function mapProcess(proc: pm2.ProcessDescription): PM2ProcessInfo {
  return {
    pmId: proc.pm_id ?? 0,
    name: proc.name ?? "unknown",
    status: proc.pm2_env?.status ?? "unknown",
    memoryBytes: proc.monit?.memory ?? 0,
    cpu: proc.monit?.cpu ?? 0,
  };
}

export async function listProcesses(): Promise<PM2ProcessInfo[]> {
  await connect();
  const list = await promisify<pm2.ProcessDescription[]>((cb) => pm2.list(cb));
  return (list ?? [])
    .map(mapProcess)
    .filter((p) => p.name !== "unknown")
    .sort((a, b) => {
      const portA = Number.parseInt(a.name, 10) || 0;
      const portB = Number.parseInt(b.name, 10) || 0;
      return portA - portB || a.name.localeCompare(b.name);
    });
}

export async function startProcess(pmId: number): Promise<void> {
  await connect();
  await promisifyProcessAction(pmId, "restart");
}

export async function stopProcess(pmId: number): Promise<void> {
  await connect();
  await promisifyProcessAction(pmId, "stop");
}

export async function restartProcess(pmId: number): Promise<void> {
  await connect();
  await promisifyProcessAction(pmId, "restart");
}
