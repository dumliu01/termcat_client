import { SystemMetrics } from '@/utils/types';
import { IOSMonitor, NetworkSample } from './types';

/**
 * Windows 监控器（预留）
 * TODO: 使用 PowerShell 命令实现 Windows 系统监控
 */
export class WindowsMonitor implements IOSMonitor {
  buildCommand(): string {
    // PowerShell 命令获取系统信息
    return `
echo "===CPU_MEM_START===";
powershell -Command "Get-CimInstance Win32_Processor | Select-Object -ExpandProperty LoadPercentage";
powershell -Command "$os = Get-CimInstance Win32_OperatingSystem; Write-Output \\"TotalMem=$($os.TotalVisibleMemorySize)KB UsedMem=$(($os.TotalVisibleMemorySize - $os.FreePhysicalMemory))KB\\"";
echo "===CPU_MEM_END===";
echo "===CPU_CORES_START===";
powershell -Command "(Get-CimInstance Win32_Processor).NumberOfLogicalProcessors";
echo "===CPU_CORES_END===";
echo "===UPTIME_START===";
powershell -Command "$boot = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime; $span = (Get-Date) - $boot; Write-Output \\"up $($span.Days) days, $($span.Hours):$($span.Minutes.ToString('D2'))\\"";
echo "===UPTIME_END===";
echo "===PROCESSES_START===";
powershell -Command "Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 10 | ForEach-Object { Write-Output \\"$($_.Id) $([math]::Round($_.WorkingSet64/1MB,1))M $([math]::Round($_.CPU,1)) $($_.ProcessName)\\" }";
echo "===PROCESSES_END===";
echo "===DISKS_START===";
powershell -Command "Get-CimInstance Win32_LogicalDisk -Filter \\"DriveType=3\\" | ForEach-Object { $used = $_.Size - $_.FreeSpace; $pct = [math]::Round($used/$_.Size*100); Write-Output \\"$($_.DeviceID) $([math]::Round($_.Size/1GB,1))G $([math]::Round($used/1GB,1))G $($pct)%\\" }";
echo "===DISKS_END===";
`.trim();
  }

  parseMetrics(output: string, metrics: SystemMetrics): NetworkSample | null {
    this.parseCpuCores(output, metrics);
    this.parseCpuMem(output, metrics);
    this.parseUptime(output, metrics);
    this.parseProcesses(output, metrics);
    this.parseDisks(output, metrics);
    return null; // TODO: Windows 网络监控
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

    // CPU: 直接是百分比数字
    const cpuLine = section.match(/^(\d+)\s*$/m);
    if (cpuLine) {
      metrics.cpu = parseInt(cpuLine[1]);
    }

    // Memory: TotalMem=8388608KB UsedMem=4194304KB
    const memLine = section.match(/TotalMem=(\d+)KB\s+UsedMem=(\d+)KB/);
    if (memLine) {
      const totalKB = parseInt(memLine[1]);
      const usedKB = parseInt(memLine[2]);
      if (totalKB > 0) {
        metrics.memPercent = Math.round((usedKB / totalKB) * 100);
        metrics.mem = metrics.memPercent;
        metrics.memUsed = `${(usedKB / 1024 / 1024).toFixed(1)}G`;
        metrics.memTotal = `${(totalKB / 1024 / 1024).toFixed(1)}G`;
      }
    }
  }

  private parseUptime(output: string, metrics: SystemMetrics): void {
    const match = output.match(/===UPTIME_START===([\s\S]*?)===UPTIME_END===/);
    if (!match) return;
    const line = match[1].trim();

    const uptimeResult = line.match(/up\s+(\d+)\s+days?,\s+(\d+):(\d+)/);
    if (uptimeResult) {
      const days = parseInt(uptimeResult[1]);
      const hours = parseInt(uptimeResult[2]);
      const minutes = parseInt(uptimeResult[3]);
      metrics.uptime = days > 0 ? `${days}d ${hours}h` : `${hours}:${minutes.toString().padStart(2, '0')}`;
    }
  }

  private parseProcesses(output: string, metrics: SystemMetrics): void {
    const match = output.match(/===PROCESSES_START===([\s\S]*?)===PROCESSES_END===/);
    if (!match) return;
    const lines = match[1].trim().split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;
      // 格式: PID MemMB CPU ProcessName
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 4) {
        const name = parts.slice(3).join(' ');
        metrics.processes.push({
          pid: parts[0],
          mem: parts[1],
          cpu: parts[2],
          name: name,
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
      // 格式: C: 100.0G 50.0G 50%
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 4) {
        metrics.disks.push({
          path: parts[0],
          total: parts[1],
          used: parts[2],
          percent: parseInt(parts[3].replace('%', '')) || 0,
        });
      }
    }
  }
}
