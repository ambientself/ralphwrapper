export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface ToolUse {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface AssistantMessage {
  type: 'assistant';
  message: {
    model: string;
    id: string;
    role: 'assistant';
    content: Array<ToolUse | { type: 'text'; text: string }>;
    usage: TokenUsage;
    stop_reason: string | null;
  };
  session_id: string;
  uuid: string;
}

export interface ToolResult {
  stdout?: string;
  stderr?: string;
  interrupted?: boolean;
}

export interface UserMessage {
  type: 'user';
  message: {
    role: 'user';
    content: Array<{
      tool_use_id: string;
      type: 'tool_result';
      content: string;
      is_error: boolean;
    }>;
  };
  session_id: string;
  uuid: string;
  tool_use_result?: ToolResult;
}

export type StreamMessage = AssistantMessage | UserMessage;

export interface FileOperation {
  path: string;
  operation: 'create' | 'edit' | 'read' | 'delete';
  timestamp: Date;
}

export interface ModelSwitch {
  from: string;
  to: string;
  timestamp: Date;
}

export interface SubagentLaunch {
  description: string;
  subagentType: string;
  model: string;
  timestamp: Date;
  prompt?: string;
}

export interface LoopStats {
  iteration: number;
  startTime: Date;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
  toolCalls: Array<{
    name: string;
    timestamp: Date;
    success: boolean;
    duration?: number;
  }>;
  errors: string[];
  currentModel: string;
  sessionId: string;
  lastActivity: Date;
  fileOperations: FileOperation[];
  modelSwitches: ModelSwitch[];
  sessionChanges: number;
  estimatedCost: number;
  lastCommitTime: Date | null;
  subagents: SubagentLaunch[];
}

export interface ParsedEvent {
  type: 'tool_call' | 'tool_result' | 'text' | 'loop_marker' | 'error' | 'unknown';
  data: unknown;
  raw: string;
  timestamp: Date;
}
