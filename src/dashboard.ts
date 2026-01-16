import blessed from 'blessed';
import contrib from 'blessed-contrib';
import type { LoopStats, ParsedEvent } from './types.js';

export class Dashboard {
  private screen: blessed.Widgets.Screen;
  private grid: contrib.grid;
  private statsBox: blessed.Widgets.BoxElement;
  private tokensBox: blessed.Widgets.BoxElement;
  private toolsTable: contrib.Widgets.TableElement;
  private activityLog: contrib.Widgets.LogElement;
  private errorsLog: contrib.Widgets.LogElement;
  private toolCountChart: contrib.Widgets.BarElement;
  private toolCounts: Map<string, number> = new Map();

  constructor() {
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'Ralph Loop Monitor',
    });

    this.grid = new contrib.grid({
      rows: 12,
      cols: 12,
      screen: this.screen,
    });

    // Stats box (top left)
    this.statsBox = this.grid.set(0, 0, 3, 4, blessed.box, {
      label: ' 📊 Loop Status ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' },
        label: { fg: 'white', bold: true },
      },
      padding: { left: 1, right: 1 },
    });

    // Tokens box (top middle)
    this.tokensBox = this.grid.set(0, 4, 3, 4, blessed.box, {
      label: ' 🎯 Token Usage ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'yellow' },
        label: { fg: 'white', bold: true },
      },
      padding: { left: 1, right: 1 },
    });

    // Tool count chart (top right)
    this.toolCountChart = this.grid.set(0, 8, 3, 4, contrib.bar, {
      label: ' 🔧 Tool Distribution ',
      barWidth: 6,
      barSpacing: 1,
      xOffset: 0,
      maxHeight: 10,
      style: {
        border: { fg: 'green' },
      },
    });

    // Recent tools table (middle left)
    this.toolsTable = this.grid.set(3, 0, 4, 6, contrib.table, {
      label: ' 🛠️  Recent Tool Calls ',
      keys: true,
      interactive: false,
      columnSpacing: 2,
      columnWidth: [20, 10, 12, 10],
      style: {
        border: { fg: 'blue' },
        header: { fg: 'cyan', bold: true },
        cell: { fg: 'white' },
      },
    });

    // Activity log (middle right)
    this.activityLog = this.grid.set(3, 6, 4, 6, contrib.log, {
      label: ' 📜 Activity Log ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'magenta' },
        fg: 'white',
      },
      scrollback: 100,
      scrollbar: {
        ch: ' ',
        style: { bg: 'blue' },
      },
    });

    // Errors log (bottom)
    this.errorsLog = this.grid.set(7, 0, 5, 12, contrib.log, {
      label: ' ⚠️  Errors & Warnings ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'red' },
        fg: 'yellow',
      },
      scrollback: 50,
      scrollbar: {
        ch: ' ',
        style: { bg: 'red' },
      },
    });

    // Key bindings
    this.screen.key(['escape', 'q', 'C-c'], () => {
      process.exit(0);
    });

    this.screen.key(['c'], () => {
      this.activityLog.setContent('');
      this.errorsLog.setContent('');
      this.screen.render();
    });
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }

  private formatNumber(n: number): string {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
  }

  private getElapsedTime(startTime: Date): string {
    const elapsed = Date.now() - startTime.getTime();
    const seconds = Math.floor(elapsed / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  updateStats(stats: LoopStats): void {
    const elapsed = this.getElapsedTime(stats.startTime);
    const successCount = stats.toolCalls.filter(t => t.success).length;
    const errorCount = stats.toolCalls.filter(t => !t.success).length;
    const successRate = stats.toolCalls.length > 0 
      ? ((successCount / stats.toolCalls.length) * 100).toFixed(1)
      : '100';

    const lastCommit = stats.lastCommitTime 
      ? this.getElapsedTime(stats.lastCommitTime) + ' ago'
      : 'none';

    this.statsBox.setContent(
      `{bold}Iteration:{/bold} {green-fg}${stats.iteration}{/green-fg}\n` +
      `{bold}Runtime:{/bold}   ${elapsed}\n` +
      `{bold}Model:{/bold}     {cyan-fg}${stats.currentModel.split('-').slice(0, 2).join('-')}{/cyan-fg}\n` +
      `{bold}Tools:{/bold}     {green-fg}${successCount}{/green-fg} ✓ / {red-fg}${errorCount}{/red-fg} ✗ (${successRate}%)\n` +
      `{bold}Last Commit:{/bold} {magenta-fg}${lastCommit}{/magenta-fg}`
    );

    const totalTokens = stats.totalInputTokens + stats.totalOutputTokens;
    const cacheHitRate = stats.totalInputTokens > 0 
      ? ((stats.totalCacheReadTokens / (stats.totalInputTokens + stats.totalCacheReadTokens)) * 100).toFixed(1)
      : '0';

    this.tokensBox.setContent(
      `{bold}Input:{/bold}    {yellow-fg}${this.formatNumber(stats.totalInputTokens)}{/yellow-fg}\n` +
      `{bold}Output:{/bold}   {green-fg}${this.formatNumber(stats.totalOutputTokens)}{/green-fg}\n` +
      `{bold}Total:{/bold}    {cyan-fg}${this.formatNumber(totalTokens)}{/cyan-fg}\n` +
      `{bold}Cache:{/bold}    ${cacheHitRate}% hit rate`
    );

    // Update tools table with recent calls
    const recentTools = stats.toolCalls.slice(-10).reverse();
    const tableData = recentTools.map(t => [
      t.name.slice(0, 18),
      t.success ? '{green-fg}✓{/green-fg}' : '{red-fg}✗{/red-fg}',
      t.duration ? this.formatDuration(t.duration) : '-',
      t.timestamp.toLocaleTimeString(),
    ]);

    this.toolsTable.setData({
      headers: ['Tool', 'Status', 'Duration', 'Time'],
      data: tableData,
    });

    // Update tool distribution chart
    const toolNames = Array.from(this.toolCounts.keys()).slice(0, 6);
    const toolValues = toolNames.map(name => this.toolCounts.get(name) || 0);
    
    if (toolNames.length > 0) {
      this.toolCountChart.setData({
        titles: toolNames.map(n => n.slice(0, 6)),
        data: toolValues,
      });
    }

    this.screen.render();
  }

  logEvent(event: ParsedEvent): void {
    const time = event.timestamp.toLocaleTimeString();
    
    switch (event.type) {
      case 'tool_call': {
        const data = event.data as { name: string; input?: Record<string, unknown> };
        const name = data.name;
        this.toolCounts.set(name, (this.toolCounts.get(name) || 0) + 1);
        
        let detail = '';
        if (data.input) {
          if ('command' in data.input) {
            detail = `: ${String(data.input.command).slice(0, 40)}...`;
          } else if ('description' in data.input) {
            detail = `: ${String(data.input.description).slice(0, 40)}`;
          }
        }
        this.activityLog.log(`{cyan-fg}[${time}]{/cyan-fg} 🔧 {bold}${name}{/bold}${detail}`);
        break;
      }
      
      case 'tool_result': {
        const data = event.data as { toolName?: string; success: boolean; duration?: number };
        const status = data.success ? '{green-fg}✓{/green-fg}' : '{red-fg}✗{/red-fg}';
        const duration = data.duration ? ` (${this.formatDuration(data.duration)})` : '';
        this.activityLog.log(`{gray-fg}[${time}]{/gray-fg}    ${status} ${data.toolName || 'unknown'}${duration}`);
        
        if (!data.success) {
          const resultData = event.data as { content?: string };
          this.errorsLog.log(`{red-fg}[${time}]{/red-fg} Tool failed: ${data.toolName}\n  ${resultData.content?.slice(0, 200) || 'Unknown error'}`);
        }
        break;
      }
      
      case 'loop_marker': {
        const data = event.data as { iteration: number };
        this.activityLog.log(`{yellow-fg}[${time}]{/yellow-fg} ═══════════ {bold}LOOP ${data.iteration}{/bold} ═══════════`);
        break;
      }
      
      case 'text': {
        const data = event.data as { text: string };
        const preview = data.text.slice(0, 80).replace(/\n/g, ' ');
        this.activityLog.log(`{magenta-fg}[${time}]{/magenta-fg} 💬 ${preview}...`);
        break;
      }
      
      case 'error': {
        const data = event.data as { message?: string };
        this.errorsLog.log(`{red-fg}[${time}]{/red-fg} ⚠️  ${data.message || 'Unknown error'}`);
        break;
      }
    }
    
    this.screen.render();
  }

  logMessage(message: string, type: 'info' | 'warn' | 'error' = 'info'): void {
    const time = new Date().toLocaleTimeString();
    const colors = {
      info: 'cyan',
      warn: 'yellow', 
      error: 'red',
    };
    const icons = {
      info: 'ℹ️',
      warn: '⚠️',
      error: '❌',
    };
    
    if (type === 'error') {
      this.errorsLog.log(`{${colors[type]}-fg}[${time}]{/${colors[type]}-fg} ${icons[type]} ${message}`);
    } else {
      this.activityLog.log(`{${colors[type]}-fg}[${time}]{/${colors[type]}-fg} ${icons[type]} ${message}`);
    }
    this.screen.render();
  }

  render(): void {
    this.screen.render();
  }

  destroy(): void {
    this.screen.destroy();
  }
}
