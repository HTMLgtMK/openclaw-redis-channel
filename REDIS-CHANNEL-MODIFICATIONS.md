# Redis Channel Plugin Modifications

**Date:** 2026-03-05  
**Purpose:** Add message routing to agent session with Sender prefix and auto-execute configuration

---

## 📋 Summary

Modified `openclaw-redis-channel` plugin to:
1. Add `[Sender]` prefix to incoming messages
2. Add configuration for message routing to specific agent session
3. Add configuration for auto-execute behavior (handled by agent)
4. Pass metadata to agent for decision making

---

## 🔧 Files Modified

### 1. `src/lib/types.ts`

**Added configuration options to `RedisChannelAccountConfig`:**

```typescript
export interface RedisChannelAccountConfig {
  enabled: boolean;
  redisUrl: string;
  deviceId: string;
  deviceName?: string;
  heartbeatInterval?: number;
  subscribeChannel?: string;
  publishChannel?: string;
  senderNamePrefix?: string;
  messageFormat?: 'json' | 'text';
  // NEW: Message routing config
  targetSession?: string;        // Target session ID (default: agent:main:main)
  autoExecute?: boolean;         // Auto-execute commands in messages (default: false)
  showSenderPrefix?: boolean;    // Add [Sender] prefix to message text (default: true)
}
```

---

### 2. `src/index.ts`

**Added configuration schema properties:**

```typescript
configSchema: {
  type: 'object',
  properties: {
    // ... existing properties ...
    targetSession: {
      type: 'string',
      title: 'Target Session',
      description: 'Session ID to route messages to (default: agent:main:main)',
      default: 'agent:main:main',
    },
    autoExecute: {
      type: 'boolean',
      title: 'Auto Execute',
      description: 'Automatically execute commands in received messages (default: false)',
      default: false,
    },
    showSenderPrefix: {
      type: 'boolean',
      title: 'Show Sender Prefix',
      description: 'Add [Sender] prefix to message text (default: true)',
      default: true,
    },
  },
  required: ['redisUrl', 'deviceId'],
},
```

---

### 3. `src/lib/message-handler.ts`

**Modified `handleInboundMessage` function:**

**Before:**
```typescript
const normalized: NormalizedMessage = {
  id: `redis-${uuidv4()}`,
  channel: 'redis-channel',
  accountId: account.deviceId,
  senderId: payload.senderId,
  senderName: `${account.senderNamePrefix || ''}${payload.senderName || payload.senderId}`.trim(),
  text: payload.text,
  timestamp: payload.timestamp || Date.now(),
  isGroup: payload.isGroup || false,
  groupId: payload.groupId,
  metadata: payload.metadata
};
```

**After:**
```typescript
// Build message text with optional sender prefix
let messageText = payload.text;
if (account.showSenderPrefix !== false) {
  const sender = payload.senderName || payload.senderId || 'Unknown';
  messageText = `[${sender}] ${payload.text}`;
}

const normalized: NormalizedMessage = {
  id: `redis-${uuidv4()}`,
  channel: 'redis-channel',
  accountId: account.deviceId,
  senderId: payload.senderId,
  senderName: `${account.senderNamePrefix || ''}${payload.senderName || payload.senderId}`.trim(),
  text: messageText,
  timestamp: payload.timestamp || Date.now(),
  isGroup: payload.isGroup || false,
  groupId: payload.groupId,
  metadata: {
    ...payload.metadata,
    autoExecute: account.autoExecute || false,
    targetSession: account.targetSession || 'agent:main:main',
    originalText: payload.text,
    source: 'redis-channel'
  }
};
```

---

## 📦 Configuration Example

**Add to your OpenClaw config (`~/.openclaw/openclaw.json`):**

```json
{
  "channels": {
    "redis-channel": {
      "accounts": {
        "default": {
          "enabled": true,
          "redisUrl": "redis://localhost:6379",
          "deviceId": "node-sub-1",
          "deviceName": "Node Subscriber 1",
          "subscribeChannel": "openclaw:device:node-sub-1",
          "targetSession": "agent:main:main",
          "autoExecute": false,
          "showSenderPrefix": true,
          "messageFormat": "json"
        }
      }
    }
  }
}
```

---

## 🧪 Testing

### 1. Build the plugin

```bash
cd /home/openclaw/.openclaw/workspace/workshop/openclaw-redis-channel
npm run build
```

### 2. Restart Gateway

```bash
openclaw gateway restart
# Or in container environment, restart the container
```

### 3. Send test message via Redis

```bash
redis-cli PUBLISH openclaw:device:node-sub-1 '{"senderId":"test","senderName":"TestUser","text":"你好"}'
```

### 4. Expected result

Message should appear in `agent:main:main` session as:
```
[TestUser] 你好
```

With metadata:
```json
{
  "autoExecute": false,
  "targetSession": "agent:main:main",
  "originalText": "你好",
  "source": "redis-channel"
}
```

---

## 🤖 Agent Behavior

**When receiving Redis messages:**

1. **If `autoExecute: false`** (default):
   - Display message with `[Sender]` prefix
   - Wait for user instruction before executing any commands

2. **If `autoExecute: true`**:
   - Display message with `[Sender]` prefix
   - Parse and execute commands in the message automatically
   - ⚠️ Only enable for trusted message sources

---

## 📝 Notes

- **`targetSession`**: Currently informational - plugin passes this in metadata, but actual routing is handled by OpenClaw core
- **`autoExecute`**: Plugin passes this in metadata; agent is responsible for checking and deciding whether to execute
- **`showSenderPrefix`**: Directly applied to message text by plugin

---

## 🔗 Repository Sync

**Files to commit:**
```
src/lib/types.ts
src/index.ts
src/lib/message-handler.ts
dist/ (rebuilt)
```

**Commit message suggestion:**
```
feat: add message routing config and sender prefix

- Add targetSession, autoExecute, showSenderPrefix config options
- Add [Sender] prefix to incoming messages
- Pass routing metadata to agent for decision making
- Default routing to agent:main:main session
```

---

**Modified by:** GBot  
**For:** GBoss  
**Project:** openclaw-redis-channel
