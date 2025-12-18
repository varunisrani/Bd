# Plan: Creating New Claude Agent SDK Projects with Platform Connections

This guide explains how to reuse the Bd repository architecture to create new TypeScript Claude Agent SDK agents connected to Slack (or other platforms).

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Your New Agent                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Platform Layer          Core Layer           AI Layer         │
│   ┌─────────────┐      ┌─────────────┐     ┌─────────────┐     │
│   │ SlackAdapter│      │ Orchestrator│     │ ClaudeClient│     │
│   │ (reusable)  │ ──── │ (customize) │ ─── │ (reusable)  │     │
│   └─────────────┘      └─────────────┘     └─────────────┘     │
│         │                     │                   │             │
│   IPlatformAdapter      handleMessage()    IAssistantClient    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Reusable Files from Bd Repo

### 1. Copy These Files Directly (No Changes Needed)

| File | Purpose | Why Reusable |
|------|---------|--------------|
| `src/adapters/slack.ts` | Slack Socket Mode connection | Generic Slack handling, message splitting |
| `src/clients/claude.ts` | Claude Agent SDK wrapper | Generic async generator for streaming |
| `src/types/index.ts` | TypeScript interfaces | `IPlatformAdapter`, `IAssistantClient`, `MessageChunk` |

### 2. Customize These Files

| File | Purpose | What to Change |
|------|---------|----------------|
| `src/index.ts` | Entry point | Remove unused platforms, simplify wiring |
| `src/orchestrator/orchestrator.ts` | Message routing | Customize for your agent's logic |

### 3. Optional (Only if Needed)

| File | Purpose | When to Include |
|------|---------|-----------------|
| `src/db/*` | PostgreSQL persistence | If you need conversation/session persistence |
| `src/handlers/command-handler.ts` | Slash commands | If you need /commands |
| `src/adapters/telegram.ts` | Telegram support | If adding Telegram |
| `src/adapters/github.ts` | GitHub webhooks | If adding GitHub |

---

## Step-by-Step: Create New Agent

### Step 1: Initialize Project

```bash
mkdir my-claude-slack-agent
cd my-claude-slack-agent
npm init -y

# Copy tsconfig.json from Bd
cp /path/to/Bd/tsconfig.json .
```

### Step 2: Install Dependencies

```bash
# Minimum required
npm install @anthropic-ai/claude-agent-sdk @slack/bolt dotenv

# Dev dependencies
npm install -D typescript @types/node tsx

# Optional: If using database persistence
npm install pg
npm install -D @types/pg
```

### Step 3: Create Directory Structure

```bash
mkdir -p src/{adapters,clients,types}
```

### Step 4: Copy Reusable Files

```bash
# From Bd repo, copy these files:
cp /path/to/Bd/src/adapters/slack.ts src/adapters/
cp /path/to/Bd/src/clients/claude.ts src/clients/
cp /path/to/Bd/src/types/index.ts src/types/
```

### Step 5: Create Simplified Entry Point

Create `src/index.ts`:

```typescript
/**
 * My Claude Slack Agent - Entry Point
 */
import 'dotenv/config';
import { SlackAdapter } from './adapters/slack';
import { ClaudeClient } from './clients/claude';

async function main(): Promise<void> {
  console.log('[App] Starting My Claude Slack Agent');

  // Validate environment
  if (!process.env.SLACK_BOT_TOKEN || !process.env.SLACK_APP_TOKEN) {
    console.error('[App] Missing SLACK_BOT_TOKEN or SLACK_APP_TOKEN');
    process.exit(1);
  }

  // Initialize adapters
  const slack = new SlackAdapter(
    process.env.SLACK_BOT_TOKEN,
    process.env.SLACK_APP_TOKEN,
    'stream' // or 'batch'
  );

  const claude = new ClaudeClient();

  // Handle incoming messages
  slack.getApp().message(async ({ event }) => {
    if (event.subtype) return; // Ignore edits, deletes

    const conversationId = slack.getConversationId(event);
    const message = event.text || '';

    console.log(`[App] Received: ${message}`);

    // Stream Claude response back to Slack
    const cwd = process.env.WORKSPACE_PATH || process.cwd();

    try {
      for await (const chunk of claude.sendQuery(message, cwd)) {
        if (chunk.type === 'assistant' && chunk.content) {
          await slack.sendMessage(conversationId, chunk.content);
        } else if (chunk.type === 'tool' && chunk.toolName) {
          // Optionally show tool usage
          await slack.sendMessage(conversationId, `🔧 Using: ${chunk.toolName}`);
        }
      }
    } catch (error) {
      console.error('[App] Error:', error);
      await slack.sendMessage(conversationId, '⚠️ An error occurred');
    }
  });

  await slack.start();
  console.log('[App] Agent is ready!');

  // Graceful shutdown
  process.once('SIGINT', () => {
    slack.stop();
    process.exit(0);
  });
}

main().catch(console.error);
```

### Step 6: Environment Setup

Create `.env`:

```env
# Slack credentials (from api.slack.com)
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-token

# Claude credentials (from console.anthropic.com)
CLAUDE_API_KEY=sk-ant-your-key

# Working directory for Claude to operate in
WORKSPACE_PATH=/path/to/your/codebase
```

### Step 7: Run

```bash
npx tsx src/index.ts
```

---

## Interface Contracts (Key to Reusability)

### IPlatformAdapter (src/types/index.ts:49-74)

Any platform adapter must implement:

```typescript
interface IPlatformAdapter {
  sendMessage(conversationId: string, message: string): Promise<void>;
  getStreamingMode(): 'stream' | 'batch';
  getPlatformType(): string;
  start(): Promise<void>;
  stop(): void;
}
```

### IAssistantClient (src/types/index.ts:93-106)

Any AI client must implement:

```typescript
interface IAssistantClient {
  sendQuery(
    prompt: string,
    cwd: string,
    resumeSessionId?: string
  ): AsyncGenerator<MessageChunk>;
  getType(): string;
}
```

### MessageChunk (src/types/index.ts:79-87)

Streaming chunks from AI:

```typescript
interface MessageChunk {
  type: 'assistant' | 'result' | 'system' | 'tool' | 'thinking';
  content?: string;
  sessionId?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
}
```

---

## Customization Patterns

### Pattern 1: Add Custom Message Processing

```typescript
// In your entry point, before sending to Claude:
slack.getApp().message(async ({ event }) => {
  let message = event.text || '';

  // Custom preprocessing
  if (message.startsWith('!review')) {
    message = `Please review this code:\n${message.slice(7)}`;
  }

  // Send to Claude...
});
```

### Pattern 2: Add Session Persistence

Copy from Bd:
- `src/db/connection.ts`
- `src/db/sessions.ts`
- `migrations/001_initial_schema.sql`

Then wrap Claude calls with session tracking.

### Pattern 3: Add Slash Commands

Copy `src/handlers/command-handler.ts` and route commands before AI:

```typescript
if (message.startsWith('/')) {
  const result = await handleCommand(message);
  await slack.sendMessage(conversationId, result.message);
  return;
}
// Otherwise send to Claude...
```

### Pattern 4: Add Another Platform (e.g., Telegram)

1. Copy `src/adapters/telegram.ts`
2. Install `telegraf`: `npm install telegraf`
3. Add to entry point alongside Slack

---

## Slack App Configuration Checklist

1. **Create App**: api.slack.com → Create New App → From Scratch

2. **Enable Socket Mode**:
   - Settings → Socket Mode → Enable
   - Generate App-Level Token → Save as `SLACK_APP_TOKEN`

3. **Bot Token Scopes** (OAuth & Permissions):
   ```
   chat:write         # Send messages
   channels:history   # Read channel messages
   groups:history     # Read private channel messages
   im:history         # Read DMs
   mpim:history       # Read group DMs
   app_mentions:read  # Read @mentions
   ```

4. **Event Subscriptions**:
   - Enable Events
   - Subscribe to bot events:
     - `message.channels`
     - `message.groups`
     - `message.im`
     - `message.mpim`
     - `app_mention`

5. **Install to Workspace**:
   - Copy Bot User OAuth Token → Save as `SLACK_BOT_TOKEN`

---

## File Reference Map

```
Bd Repository                          Your New Agent
─────────────────────────────────────────────────────────────────
src/adapters/slack.ts          ──►     src/adapters/slack.ts     (copy)
src/clients/claude.ts          ──►     src/clients/claude.ts     (copy)
src/types/index.ts             ──►     src/types/index.ts        (copy)
src/index.ts                   ──►     src/index.ts              (simplify)
src/orchestrator/orchestrator.ts ──►   (inline or customize)

Optional:
src/adapters/telegram.ts       ──►     src/adapters/telegram.ts  (if needed)
src/adapters/github.ts         ──►     src/adapters/github.ts    (if needed)
src/db/*                       ──►     src/db/*                  (if persistence)
src/handlers/command-handler.ts ──►    src/handlers/*            (if commands)
```

---

## Quick Start Template

For the fastest setup, run:

```bash
# Clone Bd as template
git clone https://github.com/your/Bd.git my-new-agent
cd my-new-agent

# Remove what you don't need
rm -rf src/adapters/telegram.ts src/adapters/github.ts
rm -rf src/db src/handlers src/utils

# Simplify src/index.ts to just Slack + Claude
# Edit .env with your credentials
# Run
npx tsx src/index.ts
```

---

## Summary

| Task | Action |
|------|--------|
| **New Slack+Claude agent** | Copy `slack.ts`, `claude.ts`, `types/index.ts`, write simple `index.ts` |
| **Add persistence** | Copy `src/db/*`, run migrations |
| **Add commands** | Copy `command-handler.ts`, route `/` messages |
| **Add platform** | Copy adapter, install SDK, wire in `index.ts` |
| **Customize AI behavior** | Modify how you call `claude.sendQuery()` |

The key insight: **Interfaces make everything swappable**. As long as you implement `IPlatformAdapter` or `IAssistantClient`, the orchestration logic works unchanged.
