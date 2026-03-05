# Redis Channel 插件部署指南

## 📦 插件概述

Redis Channel 是 OpenClaw 的自定义消息通道插件，通过 Redis Pub/Sub 机制实现多设备消息收发。

**功能特性：**
- ✅ 从 `openclaw:inbound` 接收消息
- ✅ 向 `openclaw:outbound` 发送回复
- ✅ 自动转发消息到飞书通知
- ✅ 支持 JSON 和纯文本格式

---

## 📁 文件结构

```
~/.openclaw/extensions/redis-channel/
├── index.js                 # 主插件文件
├── openclaw.plugin.json     # 插件配置
├── package.json             # 依赖配置
├── lib/
│   ├── redis-client.js      # Redis 客户端管理
│   ├── message-handler.js   # 消息处理
│   └── message-sender.js    # 消息发送
└── node_modules/            # 依赖包
```

---

## 🔧 配置步骤

### 1. 配置 openclaw.json

在 `channels` 段添加：

```json
{
  "channels": {
    "redis-channel": {
      "accounts": {
        "default": {
          "enabled": true,
          "redisUrl": "redis://:密码@127.0.0.1:6379",
          "subscribeChannel": "openclaw:inbound",
          "publishChannel": "openclaw:outbound",
          "senderNamePrefix": "",
          "messageFormat": "json"
        }
      }
    }
  },
  "plugins": {
    "entries": {
      "redis-channel": {
        "enabled": true
      }
    }
  }
}
```

### 2. 安装依赖

```bash
cd ~/.openclaw/extensions/redis-channel
npm install
```

### 3. 重启 Gateway

```bash
openclaw gateway restart
```

---

## ✅ 验证部署

### 检查订阅状态

```bash
redis-cli -h 127.0.0.1 -p 6379 -a '密码' PUBSUB CHANNELS
# 应显示：openclaw:inbound
```

### 发送测试消息

```bash
redis-cli -h 127.0.0.1 -p 6379 -a '密码' PUBLISH "openclaw:inbound" '{"senderId":"test","text":"你好"}'
# 返回 1 表示成功
```

### 查看日志

```bash
tail -f /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log | grep redis-channel
```

---

## 📨 消息格式

### 接收消息 (JSON 格式)

```json
{
  "senderId": "用户 ID",
  "senderName": "用户名称",
  "text": "消息内容",
  "timestamp": 1772645754000,
  "isGroup": false,
  "groupId": "群组 ID (可选)"
}
```

### 接收消息 (纯文本格式)

设置 `messageFormat: "text"` 后直接发送字符串。

---

## 🔍 故障排查

### 问题 1: 没有订阅

**症状**: `PUBSUB CHANNELS` 返回空

**解决**:
```bash
# 检查插件状态
openclaw plugins list | grep redis

# 检查配置
openclaw channels status | grep redis

# 查看日志
tail -100 /tmp/openclaw/*.log | grep -i "redis-channel"
```

### 问题 2: 消息发送返回 0

**症状**: `PUBLISH` 返回 0

**解决**:
1. 确认 Gateway 已重启
2. 检查日志中是否有 `Starting Redis channel`
3. 确认 `openclaw.json` 配置正确

### 问题 3: 消息格式错误

**症状**: 日志显示 `Invalid inbound message`

**解决**:
- 检查 JSON 格式是否正确
- 确保包含 `senderId` 和 `text` 字段
- 或使用 `messageFormat: "text"` 发送纯文本

---

## 🛠️ 常用命令

```bash
# 检查订阅
redis-cli -h 127.0.0.1 -p 6379 -a '密码' PUBSUB CHANNELS

# 发送消息
redis-cli -h 127.0.0.1 -p 6379 -a '密码' PUBLISH "openclaw:inbound" '{"senderId":"test","text":"你好"}'

# 监听回复
redis-cli -h 127.0.0.1 -p 6379 -a '密码' SUBSCRIBE "openclaw:outbound"

# 查看日志
tail -f /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log | grep redis
```

---

## 📝 更新日志

- **2026-03-05**: 修复 `startAccount` 方法签名
- **2026-03-05**: 添加 `isEnabled` 和 `isConfigured` 方法
- **2026-03-05**: 修复 Subscriber 连接问题
- **2026-03-05**: 添加飞书消息转发功能

---

**部署完成时间**: 2026-03-05 01:46
**OpenClaw 版本**: 2026.2.9
**Redis 版本**: 5.11.0+
