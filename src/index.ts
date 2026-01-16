import { spawn } from 'child_process';
import { createReadStream, existsSync, watchFile, unwatchFile, statSync } from 'fs';
import { createInterface } from 'readline';
import { StreamParser } from './parser.js';
import { Dashboard } from './dashboard.js';

const USAGE = `
Ralph Loop Monitor - Terminal UI for monitoring ralph.sh

Usage:
  npm start                     # Watch stdin for stream-json output
  npm start -- --file <path>    # Watch a log file
  npm start -- --run [args]     # Run ralph.sh and monitor it
  npm start -- --help           # Show this help

Examples:
  ./ralph.sh 2>&1 | npm start
  npm start -- --file ./output.log
  npm start -- --run plan 5

Keys:
  q, Esc, Ctrl+C  Exit
  c               Clear logs
`;

const MAX_FILE_SIZE_MB = 100;
const WARN_FILE_SIZE_MB = 50;

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(USAGE);
    process.exit(0);
  }

  const parser = new StreamParser();
  const dashboard = new Dashboard();
  
  let updateInterval: NodeJS.Timeout;

  // Periodic stats update
  updateInterval = setInterval(() => {
    dashboard.updateStats(parser.getStats());
  }, 500);

  const cleanup = () => {
    clearInterval(updateInterval);
    dashboard.destroy();
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  const processLine = (line: string) => {
    const event = parser.parseLine(line);
    if (event) {
      dashboard.logEvent(event);
      dashboard.updateStats(parser.getStats());
    }
  };

  const fileIndex = args.indexOf('--file');
  const runIndex = args.indexOf('--run');

  if (fileIndex !== -1) {
    // Watch file mode
    const filePath = args[fileIndex + 1];
    if (!filePath) {
      console.error('Error: --file requires a path argument');
      process.exit(1);
    }

    if (!existsSync(filePath)) {
      console.error(`Error: File not found: ${filePath}`);
      process.exit(1);
    }

    dashboard.logMessage(`Watching file: ${filePath}`, 'info');
    
    // Read existing content
    let position = 0;
    let lastSizeWarning = 0;
    
    const readFromPosition = () => {
      const stat = statSync(filePath);
      const sizeMB = stat.size / (1024 * 1024);
      
      // Warn about file size
      if (sizeMB > WARN_FILE_SIZE_MB && (sizeMB - lastSizeWarning) > 10) {
        dashboard.logMessage(`Log file is ${sizeMB.toFixed(1)}MB - consider rotating`, 'warn');
        lastSizeWarning = sizeMB;
      }
      
      if (sizeMB > MAX_FILE_SIZE_MB) {
        dashboard.logMessage(`Log file exceeds ${MAX_FILE_SIZE_MB}MB - performance may degrade`, 'error');
      }
      
      if (stat.size > position) {
        const stream = createReadStream(filePath, { start: position });
        const rl = createInterface({ input: stream });
        
        rl.on('line', processLine);
        rl.on('close', () => {
          position = stat.size;
        });
      }
    };

    // Initial read
    readFromPosition();

    // Watch for changes
    watchFile(filePath, { interval: 100 }, () => {
      readFromPosition();
    });

    process.on('exit', () => {
      unwatchFile(filePath);
    });

  } else if (runIndex !== -1) {
    // Run ralph.sh mode
    const ralphArgs = args.slice(runIndex + 1);
    const ralphPath = './ralph.sh';

    if (!existsSync(ralphPath)) {
      dashboard.logMessage('ralph.sh not found in current directory', 'error');
      dashboard.logMessage('Make sure you run this from the directory containing ralph.sh', 'warn');
    }

    dashboard.logMessage(`Starting ralph.sh ${ralphArgs.join(' ')}`, 'info');

    const child = spawn(ralphPath, ralphArgs, {
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: true,
    });

    const stdoutRl = createInterface({ input: child.stdout });
    const stderrRl = createInterface({ input: child.stderr });

    stdoutRl.on('line', processLine);
    stderrRl.on('line', (line) => {
      dashboard.logMessage(line, 'warn');
    });

    child.on('error', (err) => {
      dashboard.logMessage(`Failed to start ralph.sh: ${err.message}`, 'error');
    });

    child.on('exit', (code) => {
      dashboard.logMessage(`ralph.sh exited with code ${code}`, code === 0 ? 'info' : 'error');
    });

  } else {
    // Stdin mode (pipe mode)
    dashboard.logMessage('Reading from stdin... (pipe ralph.sh output here)', 'info');
    
    const rl = createInterface({
      input: process.stdin,
      terminal: false,
    });

    rl.on('line', processLine);
    
    rl.on('close', () => {
      dashboard.logMessage('Input stream closed', 'info');
    });
  }

  dashboard.render();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
