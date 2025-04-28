/**
 * WebRTC 连接管理模块
 * 基于 PeerJS 库实现，负责创建和管理WebRTC点对点连接
 */

import Peer from 'peerjs';
import type { DataConnection, PeerJSOption } from 'peerjs';

// 配置类型
export type ConnectionConfig = {
  iceServers?: RTCIceServer[];
  debug?: boolean;
};

// 默认STUN/TURN服务器配置
const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

// 连接状态类型
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  FAILED = 'failed',
}

// 消息类型
export type Message = {
  id: number;
  sender: string;
  content: string;
  timestamp: number;
};

// 连接事件处理器类型
export type ConnectionEventHandlers = {
  onConnect?: (peerId: string) => void;
  onDisconnect?: (peerId: string) => void;
  onMessage?: (message: Message, peerId: string) => void;
  onError?: (error: Error) => void;
};

export class WebRTCConnection {
  private peer: Peer | null = null;
  private connections: Map<string, DataConnection> = new Map();
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private events: ConnectionEventHandlers = {};
  private config: ConnectionConfig;
  private userId: string;

  constructor(userId: string, config: ConnectionConfig = {}) {
    this.userId = userId;
    this.config = config;
  }

  /**
   * 初始化Peer连接
   */
  public initialize(): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        const peerOptions: PeerJSOption = {
          debug: this.config.debug ? 2 : 0,
          config: {
            iceServers: this.config.iceServers || DEFAULT_ICE_SERVERS,
          },
        };

        // 创建带ID的Peer或随机ID的Peer
        this.peer = this.userId 
          ? new Peer(this.userId, peerOptions)
          : new Peer(peerOptions);

        // 处理连接打开事件
        this.peer.on('open', (id) => {
          console.log(`Peer connection established with ID: ${id}`);
          this.state = ConnectionState.CONNECTED;
          resolve(id);
        });

        // 处理连接错误
        this.peer.on('error', (error) => {
          console.error('Peer connection error:', error);
          this.events.onError?.(error);
          if (this.state !== ConnectionState.CONNECTED) {
            reject(error);
          }
        });

        // 处理外部连接请求
        this.peer.on('connection', (conn) => {
          this.handleIncomingConnection(conn);
        });
      } catch (error) {
        console.error('Failed to initialize peer connection', error);
        reject(error);
      }
    });
  }

  /**
   * 连接到远程Peer
   */
  public connect(remotePeerId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.peer) {
        reject(new Error('Peer not initialized'));
        return;
      }

      try {
        this.state = ConnectionState.CONNECTING;
        const conn = this.peer.connect(remotePeerId);
        
        conn.on('open', () => {
          this.connections.set(remotePeerId, conn);
          this.events.onConnect?.(remotePeerId);
          resolve();
        });

        conn.on('error', (error) => {
          console.error(`Connection error with peer ${remotePeerId}:`, error);
          this.events.onError?.(error);
          reject(error);
        });

        this.setupConnectionListeners(conn);
      } catch (error) {
        console.error(`Failed to connect to peer ${remotePeerId}:`, error);
        reject(error);
      }
    });
  }

  /**
   * 处理接收到的连接
   */
  private handleIncomingConnection(conn: DataConnection): void {
    const remotePeerId = conn.peer;
    
    conn.on('open', () => {
      this.connections.set(remotePeerId, conn);
      this.events.onConnect?.(remotePeerId);
    });

    this.setupConnectionListeners(conn);
  }

  /**
   * 设置连接事件监听器
   */
  private setupConnectionListeners(conn: DataConnection): void {
    const remotePeerId = conn.peer;

    // 数据处理
    conn.on('data', (data: any) => {
      if (this.events.onMessage && typeof data === 'object') {
        this.events.onMessage(data as Message, remotePeerId);
      }
    });

    // 关闭处理
    conn.on('close', () => {
      this.connections.delete(remotePeerId);
      this.events.onDisconnect?.(remotePeerId);
    });
  }

  /**
   * 发送消息给特定Peer
   */
  public sendMessage(peerId: string, message: Message): boolean {
    const conn = this.connections.get(peerId);
    if (!conn) {
      console.error(`No connection found for peer ${peerId}`);
      return false;
    }

    try {
      conn.send(message);
      return true;
    } catch (error) {
      console.error(`Failed to send message to peer ${peerId}:`, error);
      return false;
    }
  }

  /**
   * 广播消息给所有连接的Peer
   */
  public broadcast(message: Message): void {
    this.connections.forEach((conn, peerId) => {
      try {
        conn.send(message);
      } catch (error) {
        console.error(`Failed to broadcast message to peer ${peerId}:`, error);
      }
    });
  }

  /**
   * 断开与特定Peer的连接
   */
  public disconnectFrom(peerId: string): void {
    const conn = this.connections.get(peerId);
    if (conn) {
      conn.close();
      this.connections.delete(peerId);
    }
  }

  /**
   * 断开所有连接并关闭
   */
  public disconnect(): void {
    // 关闭所有连接
    this.connections.forEach(conn => conn.close());
    this.connections.clear();
    
    // 关闭Peer
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    
    this.state = ConnectionState.DISCONNECTED;
  }

  /**
   * 注册事件处理器
   */
  public on(events: ConnectionEventHandlers): void {
    this.events = { ...this.events, ...events };
  }

  /**
   * 获取当前连接状态
   */
  public getState(): ConnectionState {
    return this.state;
  }

  /**
   * 获取连接的Peer列表
   */
  public getConnectedPeers(): string[] {
    return Array.from(this.connections.keys());
  }
}

export default WebRTCConnection; 