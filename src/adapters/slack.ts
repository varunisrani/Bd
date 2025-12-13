/**
 * Slack platform adapter using Bolt SDK with Socket Mode
 * Handles message sending with 4000 character limit splitting
 */
import { App, LogLevel } from '@slack/bolt';
import { IPlatformAdapter } from '../types';

const MAX_LENGTH = 4000;

interface SlackMessageEvent {
  channel: string;
  thread_ts?: string;
  ts: string;
  text?: string;
  user?: string;
}

export class SlackAdapter implements IPlatformAdapter {
  private app: App;
  private streamingMode: 'stream' | 'batch';

  constructor(
    botToken: string,
    appToken: string,
    mode: 'stream' | 'batch' = 'stream'
  ) {
    this.app = new App({
      token: botToken,
      appToken: appToken,
      socketMode: true,
      logLevel: LogLevel.INFO,
    });
    this.streamingMode = mode;
    console.log(`[Slack] Adapter initialized (mode: ${mode}, socket mode enabled)`);
  }

  /**
   * Send a message to a Slack channel/thread
   * Automatically splits messages longer than 4000 characters
   *
   * @param conversationId Format: "channel_id" or "channel_id:thread_ts"
   */
  async sendMessage(conversationId: string, message: string): Promise<void> {
    const { channel, threadTs } = this.parseConversationId(conversationId);

    if (message.length <= MAX_LENGTH) {
      await this.app.client.chat.postMessage({
        channel,
        text: message,
        thread_ts: threadTs,
      });
    } else {
      // Split long messages by lines to preserve formatting
      const lines = message.split('\n');
      let chunk = '';

      for (const line of lines) {
        // Reserve 100 chars for safety margin
        if (chunk.length + line.length + 1 > MAX_LENGTH - 100) {
          if (chunk) {
            await this.app.client.chat.postMessage({
              channel,
              text: chunk,
              thread_ts: threadTs,
            });
          }
          chunk = line;
        } else {
          chunk += (chunk ? '\n' : '') + line;
        }
      }

      // Send remaining chunk
      if (chunk) {
        await this.app.client.chat.postMessage({
          channel,
          text: chunk,
          thread_ts: threadTs,
        });
      }
    }
  }

  /**
   * Parse conversation ID into channel and thread_ts
   * Format: "channel_id" or "channel_id:thread_ts"
   */
  private parseConversationId(conversationId: string): {
    channel: string;
    threadTs?: string;
  } {
    const parts = conversationId.split(':');
    return {
      channel: parts[0],
      threadTs: parts[1] || undefined,
    };
  }

  /**
   * Get the Bolt app instance for event binding
   */
  getApp(): App {
    return this.app;
  }

  /**
   * Get the configured streaming mode
   */
  getStreamingMode(): 'stream' | 'batch' {
    return this.streamingMode;
  }

  /**
   * Get platform type
   */
  getPlatformType(): string {
    return 'slack';
  }

  /**
   * Extract conversation ID from Slack message event
   * Uses just the channel ID for conversation persistence across messages
   * (Single-developer tool - all messages in a channel share context)
   *
   * @param event Slack message event
   * @returns Conversation ID (just channel_id)
   */
  getConversationId(event: SlackMessageEvent): string {
    return event.channel;
  }

  /**
   * Start the Slack app (Socket Mode connection)
   */
  async start(): Promise<void> {
    await this.app.start();
    console.log('[Slack] Bot started (Socket Mode)');
  }

  /**
   * Stop the Slack app gracefully
   */
  stop(): void {
    this.app.stop().catch((error: Error) => {
      console.error('[Slack] Error stopping app:', error);
    });
    console.log('[Slack] Bot stopped');
  }
}
