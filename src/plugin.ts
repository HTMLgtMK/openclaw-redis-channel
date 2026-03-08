// Redis Channel 插件包装器
// 提供 PluginRuntime 访问能力

import type { ChannelPlugin, OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { emptyPluginConfigSchema } from 'openclaw/plugin-sdk';
import { redisChannelPlugin } from './index';
import { setPluginRuntime } from './lib/runtime';

const plugin = {
  id: 'redis-channel',
  name: 'Redis Channel',
  description: 'Redis Pub/Sub messaging channel for OpenClaw',
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    // 保存 PluginRuntime 供 channel 使用
    setPluginRuntime(api.runtime);
    // 注册 channel 插件
    api.registerChannel({ plugin: redisChannelPlugin as ChannelPlugin });
  },
};

export default plugin;
