This is just a simple project I had AI make for Ralph.
I want to know where Ralph was at.


# Ralph Loop Monitor 🔄

A terminal UI dashboard for monitoring `ralph.sh` loop execution in real-time.

## Features

- **Real-time monitoring** of stream-json output from ralph.sh
- **Token usage tracking** (input, output, cache hits)
- **Tool call visualization** with success/failure rates
- **Activity log** showing all tool executions
- **Error tracking** with dedicated error panel
- **Tool distribution chart** showing which tools are used most

## Installation

```bash
npm install
```

## Usage

### 1. Pipe mode (recommended)
Run ralph.sh and pipe its output to the monitor:

```bash
./ralph.sh 2>&1 | npm start
```

### 2. File watch mode
Monitor an existing or growing log file:

```bash
npm start -- --file ./output.log
```

### 3. Run mode
Let the wrapper start ralph.sh for you:

```bash
npm start -- --run plan 5
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `q` / `Esc` / `Ctrl+C` | Exit |
| `c` | Clear logs |

## Dashboard Panels

```
┌─────────────────┬─────────────────┬─────────────────┐
│  📊 Loop Status │  🎯 Token Usage │ 🔧 Tool Distrib │
│                 │                 │                 │
├─────────────────┴─────────────────┴─────────────────┤
│  🛠️  Recent Tool Calls    │  📜 Activity Log       │
│                           │                        │
├───────────────────────────┴────────────────────────┤
│  ⚠️  Errors & Warnings                             │
│                                                    │
└────────────────────────────────────────────────────┘
```

- **Loop Status**: Current iteration, runtime, model, tool success rate
- **Token Usage**: Input/output tokens, cache hit rate
- **Tool Distribution**: Bar chart of most-used tools
- **Recent Tool Calls**: Table of last 10 tool executions with timing
- **Activity Log**: Real-time stream of all events
- **Errors & Warnings**: Dedicated panel for failures

## How it works

The monitor parses the `--output-format=stream-json` output from Claude CLI:

```json
{"type":"assistant","message":{"model":"claude-sonnet-4-5-20250929",...}}
{"type":"user","message":{"role":"user","content":[{"tool_use_id":"...","type":"tool_result",...}]}}
```

It extracts:
- Tool calls and their results
- Token usage from each message
- Model being used
- Session information
- Errors and failures


Check out Geoffrey Huntley, creator of this.
https://github.com/ghuntley/how-to-ralph-wiggum
https://ghuntley.com/