/**
 * Unit tests for Slack adapter
 */
import { SlackAdapter } from './slack';

// Mock the Slack Bolt App
jest.mock('@slack/bolt', () => ({
  App: jest.fn().mockImplementation(() => ({
    client: {
      chat: {
        postMessage: jest.fn().mockResolvedValue({ ok: true }),
      },
    },
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
  })),
  LogLevel: {
    INFO: 'info',
  },
}));

describe('SlackAdapter', () => {
  describe('streaming mode configuration', () => {
    test('should return batch mode when configured', () => {
      const adapter = new SlackAdapter(
        'xoxb-fake-bot-token',
        'xapp-fake-app-token',
        'batch'
      );
      expect(adapter.getStreamingMode()).toBe('batch');
    });

    test('should default to stream mode', () => {
      const adapter = new SlackAdapter(
        'xoxb-fake-bot-token',
        'xapp-fake-app-token'
      );
      expect(adapter.getStreamingMode()).toBe('stream');
    });

    test('should return stream mode when explicitly configured', () => {
      const adapter = new SlackAdapter(
        'xoxb-fake-bot-token',
        'xapp-fake-app-token',
        'stream'
      );
      expect(adapter.getStreamingMode()).toBe('stream');
    });
  });

  describe('platform type', () => {
    test('should return slack as platform type', () => {
      const adapter = new SlackAdapter(
        'xoxb-fake-bot-token',
        'xapp-fake-app-token'
      );
      expect(adapter.getPlatformType()).toBe('slack');
    });
  });

  describe('app instance', () => {
    test('should provide access to app instance', () => {
      const adapter = new SlackAdapter(
        'xoxb-fake-bot-token',
        'xapp-fake-app-token'
      );
      const app = adapter.getApp();
      expect(app).toBeDefined();
      expect(app.client).toBeDefined();
    });
  });

  describe('conversation ID extraction', () => {
    test('should use channel ID as conversation ID (ignoring thread_ts)', () => {
      const adapter = new SlackAdapter(
        'xoxb-fake-bot-token',
        'xapp-fake-app-token'
      );
      const event = {
        channel: 'C12345678',
        thread_ts: '1234567890.123456',
        ts: '1234567890.654321',
        text: 'Hello',
      };
      const conversationId = adapter.getConversationId(event);
      expect(conversationId).toBe('C12345678');
    });

    test('should use channel ID regardless of thread context', () => {
      const adapter = new SlackAdapter(
        'xoxb-fake-bot-token',
        'xapp-fake-app-token'
      );
      const event = {
        channel: 'C12345678',
        ts: '1234567890.654321',
        text: 'Hello',
      };
      const conversationId = adapter.getConversationId(event);
      expect(conversationId).toBe('C12345678');
    });
  });

  describe('message sending', () => {
    test('should send short messages directly', async () => {
      const adapter = new SlackAdapter(
        'xoxb-fake-bot-token',
        'xapp-fake-app-token'
      );
      const app = adapter.getApp();

      await adapter.sendMessage('C12345678:1234567890.123456', 'Hello, world!');

      expect(app.client.chat.postMessage).toHaveBeenCalledWith({
        channel: 'C12345678',
        text: 'Hello, world!',
        thread_ts: '1234567890.123456',
      });
    });

    test('should handle conversation ID without thread_ts', async () => {
      const adapter = new SlackAdapter(
        'xoxb-fake-bot-token',
        'xapp-fake-app-token'
      );
      const app = adapter.getApp();

      await adapter.sendMessage('C12345678', 'Hello!');

      expect(app.client.chat.postMessage).toHaveBeenCalledWith({
        channel: 'C12345678',
        text: 'Hello!',
        thread_ts: undefined,
      });
    });

    test('should split long messages at 4000 char limit', async () => {
      const adapter = new SlackAdapter(
        'xoxb-fake-bot-token',
        'xapp-fake-app-token'
      );
      const app = adapter.getApp();

      // Create a message with multiple lines that exceeds 4000 chars
      const longLine = 'x'.repeat(2000);
      const longMessage = `${longLine}\n${longLine}\n${longLine}`;

      await adapter.sendMessage('C12345678:1234567890.123456', longMessage);

      // Should have been split into multiple messages
      expect(
        (app.client.chat.postMessage as jest.Mock).mock.calls.length
      ).toBeGreaterThan(1);
    });
  });
});
