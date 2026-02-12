import os from "node:os";

export type CpuSnapshot = {
  idle: number;
  total: number;
};

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

const roundOneDecimal = (value: number) => Math.round(value * 10) / 10;

const getCpuSnapshot = (): CpuSnapshot => {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;

  for (const cpu of cpus) {
    idle += cpu.times.idle;
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle;
  }

  return { idle, total };
};

export const sampleCpuUsagePercent = (previous: CpuSnapshot | null) => {
  const current = getCpuSnapshot();

  if (!previous) {
    const usage = current.total > 0 ? (1 - current.idle / current.total) * 100 : 0;
    return {
      percent: clampPercent(roundOneDecimal(usage)),
      snapshot: current
    };
  }

  const totalDiff = current.total - previous.total;
  const idleDiff = current.idle - previous.idle;
  const usage = totalDiff > 0 ? (1 - idleDiff / totalDiff) * 100 : 0;

  return {
    percent: clampPercent(roundOneDecimal(usage)),
    snapshot: current
  };
};

export const getMemoryUsagePercent = () => {
  const total = os.totalmem();
  if (total <= 0) return 0;
  const used = total - os.freemem();
  return clampPercent(roundOneDecimal((used / total) * 100));
};
