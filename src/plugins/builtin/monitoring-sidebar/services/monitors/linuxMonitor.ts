import { SystemMetrics } from '@/utils/types';
import { IOSMonitor, NetworkSample } from './types';

export class LinuxMonitor implements IOSMonitor {
  buildCommand(): string {
    return `
echo "===CPU_MEM_START===";
top -bn1 | head -5 | tr -d '\a';
echo "===CPU_MEM_END===";
echo "===CPU_CORES_START===";
nproc;
echo "===CPU_CORES_END===";
echo "===UPTIME_START===";
uptime;
echo "===UPTIME_END===";
echo "===PROCESSES_START===";
ps aux --sort=-%mem | head -11 | tr -d '\a';
echo "===PROCESSES_END===";
echo "===DISKS_START===";
df -h | grep -E '^/dev/|^tmpfs';
echo "===DISKS_END===";
echo "===NETWORK_START===";
cat /proc/net/dev | grep -E 'eth0|ens|eno|enp' | head -1;
echo "===NETWORK_END===";
`.trim();
  }

  parseMetrics(output: string, metrics: SystemMetrics): NetworkSample | null {
    this.parseCpuCores(output, metrics);
    this.parseCpuMem(output, metrics);
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

    // CPU: %Cpu(s):  2.3 us,  0.7 sy,  0.0 ni, 96.7 id
    const cpuLine = section.match(/%Cpu\(s\):\s*([\d.]+)\s*us,\s*([\d.]+)\s*sy,\s*([\d.]+)\s*ni,\s*([\d.]+)\s*id/);
    if (cpuLine) {
      metrics.cpu = Math.round(100 - parseFloat(cpuLine[4]));
    }

    // 内存 - 支持 KiB、MiB 和 GiB 格式，处理缩写 totl=total
    let memLine = section.match(/KiB Mem\s*:?\s*([\d,.]+)\s*tot[al]*,\s*([\d,.]+)\s*free,\s*([\d,.]+)\s*used/i);
    let isGiB = false;
    if (!memLine) {
      memLine = section.match(/MiB Mem\s*:?\s*([\d,.]+)\s*tot[al]*,\s*([\d,.]+)\s*free,\s*([\d,.]+)\s*used/i);
    }
    if (!memLine) {
      memLine = section.match(/GiB Mem\s*:?\s*([\d,.]+)\s*tot[al]*,\s*([\d,.]+)\s*free,\s*([\d,.]+)\s*used/i);
      isGiB = true;
    }
    if (memLine) {
      const cleanNum = (s: string) => parseFloat(s.replace(/,/g, ''));
      const totalMem = cleanNum(memLine[1]);
      const usedMem = cleanNum(memLine[3]);

      if (!isGiB && totalMem > 1024 * 1024) {
        isGiB = true;
      }

      if (totalMem > 0) {
        metrics.memPercent = Math.round((usedMem / totalMem) * 100);
        metrics.mem = metrics.memPercent;

        if (isGiB) {
          metrics.memUsed = `${(usedMem / 1024 / 1024).toFixed(1)}G`;
          metrics.memTotal = `${(totalMem / 1024 / 1024).toFixed(1)}G`;
        } else if (totalMem > 1024) {
          metrics.memUsed = `${(usedMem / 1024).toFixed(1)}G`;
          metrics.memTotal = `${(totalMem / 1024).toFixed(1)}G`;
        } else {
          metrics.memUsed = `${usedMem.toFixed(0)}M`;
          metrics.memTotal = `${totalMem.toFixed(0)}M`;
        }
      }
    }

    // Swap - 支持 KiB、MiB、GiB 格式
    let swapLine = section.match(/KiB Swp\s*:?\s*([\d,.]+)\s*tot[al]*,\s*([\d,.]+)\s*free,\s*([\d,.]+)\s*used/i);
    if (!swapLine) {
      swapLine = section.match(/MiB Swp\s*:?\s*([\d,.]+)\s*tot[al]*,\s*([\d,.]+)\s*free,\s*([\d,.]+)\s*used/i);
    }
    if (!swapLine) {
      swapLine = section.match(/GiB Swp\s*:?\s*([\d,.]+)\s*tot[al]*,\s*([\d,.]+)\s*free,\s*([\d,.]+)\s*used/i);
      isGiB = true;
    }
    if (!swapLine) {
      swapLine = section.match(/MiB Swp\s*:?\s*([\d,.]+)\s*tot[al]*,\s*([\d,.]+)\s*free,\s*([\d,.]+)\s*used\./i);
    }
    if (swapLine) {
      const cleanNum = (s: string) => parseFloat(s.replace(/,/g, ''));
      const totalSwap = cleanNum(swapLine[1]);
      const usedSwap = cleanNum(swapLine[3]);
      if (totalSwap > 0) {
        metrics.swapPercent = Math.round((usedSwap / totalSwap) * 100);
        metrics.swap = metrics.swapPercent;

        if (isGiB) {
          metrics.swapUsed = `${usedSwap.toFixed(1)}G`;
          metrics.swapTotal = `${totalSwap.toFixed(1)}G`;
        } else if (totalSwap > 1024) {
          metrics.swapUsed = `${(usedSwap / 1024).toFixed(1)}G`;
          metrics.swapTotal = `${(totalSwap / 1024).toFixed(1)}G`;
        } else {
          metrics.swapUsed = `${usedSwap.toFixed(0)}M`;
          metrics.swapTotal = `${totalSwap.toFixed(0)}M`;
        }
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

    const loadMatch = line.match(/load average:\s*([\d.]+),?\s*([\d.]+),?\s*([\d.]+)/);
    if (loadMatch) {
      metrics.load = `${loadMatch[1]}, ${loadMatch[2]}, ${loadMatch[3]}`;
    }
  }

  private parseProcesses(output: string, metrics: SystemMetrics): void {
    const match = output.match(/===PROCESSES_START===([\s\S]*?)===PROCESSES_END===/);
    if (!match) return;
    const lines = match[1].trim().split('\n');

    // 跳过标题行
    for (let i = 1; i < lines.length && i < 11; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // ps aux 格式: USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND
      const parts = line.split(/\s+/);
      if (parts.length >= 11) {
        const memMB = (parseInt(parts[4]) / 1024).toFixed(1);
        const command = parts.slice(10).join(' ');
        metrics.processes.push({
          pid: parts[1],
          mem: `${memMB}M`,
          cpu: parseFloat(parts[2]).toFixed(1),
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
      // Linux: Filesystem Size Used Avail Use% Mounted_on (6列)
      const parts = line.split(/\s+/);
      if (parts.length >= 6) {
        metrics.disks.push({
          path: parts.slice(5).join(' '),
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

    // /proc/net/dev 格式: eth0: rxBytes rxPackets ... txBytes txPackets ...
    if (parts.length >= 10 && parts[0].includes(':')) {
      return {
        interfaceName: parts[0].replace(':', ''),
        rxBytes: parseInt(parts[1]) || 0,
        txBytes: parseInt(parts[9]) || 0,
      };
    }
    return null;
  }
}
