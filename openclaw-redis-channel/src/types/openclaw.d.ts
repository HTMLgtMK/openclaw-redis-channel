/**
 * OpenClaw Plugin SDK 类型声明
 * 用于本地开发，不依赖全局安装的 openclaw 包
 */

declare module 'openclaw/plugin-sdk' {
  // ========== 基础类型 ==========

  export interface Logger {
    info: (msg: string, ...args: any[]) => void;
    warn: (msg: string, ...args: any[]) => void;
    error: (msg: string, ...args: any[]) => void;
    debug: (msg: string, ...args: any[]) => void;
  }

  export interface AccountConfig {
    accountId: string;
    enabled: boolean;
    [key: string]: any;
  }

  export interface NormalizedMessage {
    id: string;
    channel: string;
    accountId: string;
    senderId: string;
    senderName: string;
    text: string;
    timestamp: number;
    isGroup: boolean;
    groupId?: string;
    metadata?: Record<string, any>;
  }

  export type EmitMessageFn = (msg: NormalizedMessage) => void;

  // ========== Channel Plugin 接口 ==========

  export interface ChannelPluginMeta {
    id: string;
    label: string;
    selectionLabel: string;
    docsPath?: string;
    blurb: string;
    aliases?: string[];
    icon?: string;
  }

  export interface ChannelPluginCapabilities {
    chatTypes: string[];
    supports: {
      threads: boolean;
      reactions: boolean;
      mentions: boolean;
      attachments: boolean;
      typing: boolean;
    };
  }

  export interface StartAccountParams {
    cfg: any;
    accountId: string;
    account: AccountConfig;
    abortSignal: AbortSignal;
    log: Logger;
  }

  export interface ChannelPluginConfig {
    listAccountIds: (cfg: any) => string[];
    resolveAccount: (cfg: any, accountId?: string) => any;
    isEnabled?: (account: AccountConfig, cfg: any) => boolean;
    isConfigured?: (account: AccountConfig, cfg: any) => Promise<boolean>;
  }

  export interface OutboundAdapter {
    deliveryMode: string;
    sendText: (params: {
      text: string;
      target: { id: string };
      account: AccountConfig;
    }) => Promise<any>;
  }

  export interface GatewayAdapter {
    start?: (
      account: AccountConfig,
      deps: { logger: Logger; emitMessage: EmitMessageFn }
    ) => Promise<{
      stop: () => Promise<void>;
      health?: () => Promise<{ status: string; [key: string]: any }>;
    }>;
    startAccount?: (
      params: StartAccountParams
    ) => Promise<{
      stop: () => Promise<void>;
      health?: () => Promise<{ status: string; [key: string]: any }>;
    }>;
  }

  export interface ChannelPlugin {
    id: string;
    meta: ChannelPluginMeta;
    capabilities: ChannelPluginCapabilities;
    configSchema?: any;
    config: ChannelPluginConfig;
    outbound: OutboundAdapter;
    gateway: GatewayAdapter;
  }

  // ========== Plugin API ==========

  export interface ChannelPluginAPI {
    registerChannel: (config: { plugin: ChannelPlugin }) => void;
  }

  // ========== 默认导出 ==========

  export default function register(api: ChannelPluginAPI): void;
}
