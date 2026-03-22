import { SystemMetrics } from '@/utils/types';
import { IOSMonitor, NetworkSample } from './types';

export class DarwinMonitor implements IOSMonitor {
  buildCommand(): string {
    return `
echo "===CPU_MEM_START===";
top -l 1 -n 0 2>/dev/null | grep -E 'CPU usage|PhysMem';
echo "===CPU_MEM_END===";
echo "===CPU_CORES_START===";
sysctl -n hw.ncpu;
echo "===CPU_CORES_END===";
echo "===UPTIME_START===";
uptime;
echo "===UPTIME_END===";
echo "===PROCESSES_START===";
ps -eo pid,%cpu,%mem,rss,comm -m | head -11;
echo "===PROCESSES_END===";
echo "===DISKS_START===";
df -h | grep '^/dev/';
echo "===DISKS_END===";
echo "===NETWORK_START===";
netstat -ib | grep -E 'en0\\s' | head -1;
echo "===NETWORK_END===";
echo "===SWAP_START===";
sysctl -n vm.swapusage 2>/dev/null || echo "total = 0.00M  used = 0.00M  free = 0.00M";
echo "===SWAP_END===";
`.trim();
  }

  parseMetrics(output: string, metrics: SystemMetrics): NetworkSample | null {
    this.parseCpuCores(output, metrics);
    this.parseCpuMem(output, metrics);
    this.parseSwap(output, metrics);
    this.parseUptime(output, metrics);
    this.parseProcesses(output, metrics);
    this.parseDisks(output, metrics);
    return this.parseNetwork(output, metrics);
  }

  private parseCpuCores(output: string, metrics: SystemMetrics): void {
    const match = output.match(/===CPU_CORES_START===([\s\S]*?)===CPU_CORES_END===/);
    if (match) {
      const cores = parseInt(match[1].trim());
      if (!isNaN(cores)) {
        metrics.cpuCores = cores;
      }
    }
  }

  private parseCpuMem(output: string, metrics: SystemMetrics): void {
    const match = output.match(/===CPU_MEM_START===([\s\S]*?)===CPU_MEM_END===/);
    if (!match) return;
    const section = match[1];

    // CPU usage: 23.70% user, 58.73% sys, 17.55% idle
    const cpuLine = section.match(/CPU usage:\s*([\d.]+)%\s*user,\s*([\d.]+)%\s*sys,\s*([\d.]+)%\s*idle/);
    if (cpuLine) {
      metrics.cpu = Math.round(100 - parseFloat(cpuLine[3]));
    }

    // PhysMem: 15G used (4398M wired, 6830M compressor), 117M unused.
    const memLine = section.match(/PhysMem:\s*([\d.]+)([GM])\s*used\b.*?,\s*([\d.]+)([GM])\s*unused/);
    if (memLine) {
      const usedVal = parseFloat(memLine[1]);
      const usedUnit = memLine[2];
      const freeVal = parseFloat(memLine[3]);
      const freeUnit = memLine[4];
      const usedMB = usedUnit === 'G' ? usedVal * 1024 : usedVal;
      const freeMB = freeUnit === 'G' ? freeVal * 1024 : freeVal;
      const totalMB = usedMB + freeMB;
      if (totalMB > 0) {
        metrics.memPercent = Math.round((usedMB / totalMB) * 100);
        metrics.mem = metrics.memPercent;
        metrics.memUsed = totalMB >= 1024 ? `${(usedMB / 1024).toFixed(1)}G` : `${usedMB.toFixed(0)}M`;
        metrics.memTotal = totalMB >= 1024 ? `${(totalMB / 1024).toFixed(1)}G` : `${totalMB.toFixed(0)}M`;
      }
    }
  }

  private parseSwap(output: string, metrics: SystemMetrics): void {
    // total = 41984.00M  used = 40429.31M  free = 1554.69M
    const match = output.match(/===SWAP_START===([\s\S]*?)===SWAP_END===/);
    if (!match) return;
    const swapLine = match[1].match(/total\s*=\s*([\d.]+)([MG])\s+used\s*=\s*([\d.]+)([MG])\s+free\s*=\s*([\d.]+)([MG])/);
    if (swapLine) {
      const totalVal = parseFloat(swapLine[1]);
      const totalUnit = swapLine[2];
      const usedVal = parseFloat(swapLine[3]);
      const usedUnit = swapLine[4];
      const totalMB = totalUnit === 'G' ? totalVal * 1024 : totalVal;
      const usedMB = usedUnit === 'G' ? usedVal * 1024 : usedVal;
      if (totalMB > 0) {
        metrics.swapPercent = Math.round((usedMB / totalMB) * 100);
        metrics.swap = metrics.swapPercent;
        metrics.swapUsed = totalMB >= 1024 ? `${(usedMB / 1024).toFixed(1)}G` : `${usedMB.toFixed(0)}M`;
        metrics.swapTotal = totalMB >= 1024 ? `${(totalMB / 1024).toFixed(1)}G` : `${totalMB.toFixed(0)}M`;
      }
    }
  }

  private parseUptime(output: string, metrics: SystemMetrics): void {
    const match = output.match(/===UPTIME_START===([\s\S]*?)===UPTIME_END===/);
    if (!match) return;
    const line = match[1].trim();

    const uptimeResult = line.match(/up\s+(?:(\d+)\s+days?,\s+)?(?:(\d+):(\d+))?/);
    if (uptimeResult) {
      const days = uptimeResult[1] ? parseInt(uptimeResult[1]) : 0;
      const hours = uptimeResult[2] ? parseInt(uptimeResult[2]) : 0;
      const minutes = uptimeResult[3] ? parseInt(uptimeResult[3]) : 0;
      metrics.uptime = days > 0 ? `${days}d ${hours}h` : `${hours}:${minutes.toString().padStart(2, '0')}`;
    }

    // macOS: "load averages:" (带 s)
    const loadMatch = line.match(/load averages?:\s*([\d.]+),?\s*([\d.]+),?\s*([\d.]+)/);
    if (loadMatch) {
      metrics.load = `${loadMatch[1]}, ${loadMatch[2]}, ${loadMatch[3]}`;
    }
  }

  private parseProcesses(output: string, metrics: SystemMetrics): void {
    const match = output.match(/===PROCESSES_START===([\s\S]*?)===PROCESSES_END===/);
    if (!match) return;
    const lines = match[1].trim().split('\n');

    for (let i = 1; i < lines.length && i < 11; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // ps -eo pid,%cpu,%mem,rss,comm 格式: PID %CPU %MEM RSS COMMAND
      // RSS 单位是 KB
      const parts = line.split(/\s+/);
      if (parts.length >= 5) {
        const memMB = (parseInt(parts[3]) / 1024).toFixed(1);
        const command = parts.slice(4).join(' ');
        metrics.processes.push({
          pid: parts[0],
          mem: `${memMB}M`,
          cpu: parseFloat(parts[1]).toFixed(1),
          name: command,
        });
      }
    }
  }

  private parseDisks(output: string, metrics: SystemMetrics): void {
    const match = output.match(/===DISKS_START===([\s\S]*?)===DISKS_END===/);
    if (!match) return;
    const lines = match[1].trim().split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;
      // macOS: Filesystem Size Used Avail Capacity iused ifree %iused Mounted_on (9列)
      const parts = line.split(/\s+/);
      if (parts.length >= 9 && parts[7].includes('%')) {
        metrics.disks.push({
          path: parts.slice(8).join(' '),
          total: parts[1],
          used: parts[2],
          percent: parseInt(parts[4].replace('%', '')) || 0,
        });
      }
    }
  }

  private parseNetwork(output: string, metrics: SystemMetrics): NetworkSample | null {
    const match = output.match(/===NETWORK_START===([\s\S]*?)===NETWORK_END===/);
    if (!match) return null;
    const parts = match[1].trim().split(/\s+/);

    // netstat -ib 格式: en0 1500 <Link#N> MAC Ipkts Ierrs Ibytes Opkts Oerrs Obytes Coll
    if (parts.length >= 10) {
      return {
        interfaceName: parts[0],
        rxBytes: parseInt(parts[6]) || 0,
        txBytes: parseInt(parts[9]) || 0,
      };
    }
    return null;
  }
}
