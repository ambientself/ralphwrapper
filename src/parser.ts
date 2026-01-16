import type { StreamMessage, ParsedEvent, LoopStats, AssistantMessage, UserMessage } from './types.js';

export class StreamParser {
  private buffer = '';
  private stats: LoopStats;
  private pendingToolCalls: Map<string, { name: string; startTime: Date }> = new Map();

  constructor() {
    this.stats = this.createInitialStats();
  }

  private createInitialStats(): LoopStats {
    return {
      iteration: 0,
      startTime: new Date(),
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheReadTokens: 0,
      totalCacheCreationTokens: 0,
      toolCalls: [],
      errors: [],
      currentModel: 'unknown',
      sessionId: '',
      lastActivity: new Date(),
    };
  }

  reset(): void {
    this.buffer = '';
    this.stats = this.createInitialStats();
    this.pendingToolCalls.clear();
  }

  getStats(): LoopStats {
    return { ...this.stats };
  }

  parseLine(line: string): ParsedEvent | null {
    const trimmed = line.trim();
    if (!trimmed) return null;

    // Check for loop marker
    const loopMatch = trimmed.match(/={10,}\s*LOOP\s*(\d+)\s*={10,}/);
    if (loopMatch) {
      this.stats.iteration = parseInt(loopMatch[1], 10);
      return {
        type: 'loop_marker',
        data: { iteration: this.stats.iteration },
        raw: line,
        timestamp: new Date(),
      };
    }

    // Try to parse JSON
    try {
      const json = JSON.parse(trimmed) as StreamMessage;
      return this.processMessage(json, line);
    } catch {
      // Not JSON, might be regular output
      return {
        type: 'unknown',
        data: { text: trimmed },
        raw: line,
        timestamp: new Date(),
      };
    }
  }

  private processMessage(msg: StreamMessage, raw: string): ParsedEvent {
    this.stats.lastActivity = new Date();

    if (msg.type === 'assistant') {
      return this.processAssistantMessage(msg, raw);
    } else if (msg.type === 'user') {
      return this.processUserMessage(msg, raw);
    }

    return {
      type: 'unknown',
      data: msg,
      raw,
      timestamp: new Date(),
    };
  }

  private processAssistantMessage(msg: AssistantMessage, raw: string): ParsedEvent {
    // Update stats from usage
    if (msg.message.usage) {
      this.stats.totalInputTokens += msg.message.usage.input_tokens || 0;
      this.stats.totalOutputTokens += msg.message.usage.output_tokens || 0;
      this.stats.totalCacheReadTokens += msg.message.usage.cache_read_input_tokens || 0;
      this.stats.totalCacheCreationTokens += msg.message.usage.cache_creation_input_tokens || 0;
    }

    // Update model and session
    this.stats.currentModel = msg.message.model || this.stats.currentModel;
    this.stats.sessionId = msg.session_id || this.stats.sessionId;

    // Check for tool uses
    const toolUses = msg.message.content?.filter(c => c.type === 'tool_use') || [];
    
    for (const tool of toolUses) {
      if (tool.type === 'tool_use') {
        this.pendingToolCalls.set(tool.id, {
          name: tool.name,
          startTime: new Date(),
        });
      }
    }

    if (toolUses.length > 0) {
      const tool = toolUses[0];
      if (tool.type === 'tool_use') {
        return {
          type: 'tool_call',
          data: {
            name: tool.name,
            input: tool.input,
            id: tool.id,
            model: msg.message.model,
          },
          raw,
          timestamp: new Date(),
        };
      }
    }

    // Check for text content
    const textContent = msg.message.content?.filter(c => c.type === 'text') || [];
    if (textContent.length > 0) {
      return {
        type: 'text',
        data: {
          text: textContent.map(t => (t as { text: string }).text).join('\n'),
          model: msg.message.model,
        },
        raw,
        timestamp: new Date(),
      };
    }

    return {
      type: 'unknown',
      data: msg,
      raw,
      timestamp: new Date(),
    };
  }

  private processUserMessage(msg: UserMessage, raw: string): ParsedEvent {
    const results = msg.message.content || [];
    
    for (const result of results) {
      if (result.type === 'tool_result') {
        const pending = this.pendingToolCalls.get(result.tool_use_id);
        const duration = pending ? Date.now() - pending.startTime.getTime() : undefined;
        
        this.stats.toolCalls.push({
          name: pending?.name || 'unknown',
          timestamp: new Date(),
          success: !result.is_error,
          duration,
        });

        if (result.is_error) {
          this.stats.errors.push(result.content.slice(0, 200));
        }

        // Track git commits/pushes
        if (!result.is_error && result.content) {
          const content = result.content.toLowerCase();
          if (content.includes('git push') || content.includes('git commit')) {
            this.stats.lastCommitTime = new Date();
          }
        }

        this.pendingToolCalls.delete(result.tool_use_id);

        return {
          type: 'tool_result',
          data: {
            toolName: pending?.name,
            success: !result.is_error,
            content: result.content,
            duration,
            stdout: msg.tool_use_result?.stdout,
            stderr: msg.tool_use_result?.stderr,
          },
          raw,
          timestamp: new Date(),
        };
      }
    }

    return {
      type: 'unknown',
      data: msg,
      raw,
      timestamp: new Date(),
    };
  }

  parseChunk(chunk: string): ParsedEvent[] {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    
    // Keep the last incomplete line in buffer
    this.buffer = lines.pop() || '';
    
    const events: ParsedEvent[] = [];
    for (const line of lines) {
      const event = this.parseLine(line);
      if (event) {
        events.push(event);
      }
    }
    
    return events;
  }
}
