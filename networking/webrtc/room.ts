/**
 * WebRTC 房间模块
 * 实现房间内的多人通信功能
 */

import WebRTCConnection from './connection';
import type { ConnectionState, Message, ConnectionEventHandlers } from './connection';

export interface RoomOptions {
  roomId: string;
  userId: string;
  username: string;
  onJoin?: (peerId: string, username: string) => void;
  onLeave?: (peerId: string) => void;
  onMessage?: (message: Message, fromPeerId: string) => void;
  onError?: (error: Error) => void;
}

interface UserInfo {
  id: string;
  username: string;
}

interface JoinMessage {
  type: 'JOIN';
  user: UserInfo;
}

interface LeaveMessage {
  type: 'LEAVE';
  userId: string;
}

interface ChatMessage {
  type: 'CHAT';
  message: Message;
}

interface UserListMessage {
  type: 'USER_LIST';
  users: UserInfo[];
}

type RoomMessage = JoinMessage | LeaveMessage | ChatMessage | UserListMessage;

export class Room {
  private connection: WebRTCConnection;
  private roomId: string;
  private userInfo: UserInfo;
  private users: Map<string, UserInfo> = new Map();
  private options: RoomOptions;
  private messageIdCounter: number = 0;

  constructor(options: RoomOptions) {
    this.options = options;
    this.roomId = options.roomId;
    this.userInfo = {
      id: options.userId,
      username: options.username,
    };
    this.users.set(options.userId, this.userInfo);

    // 创建连接实例
    this.connection = new WebRTCConnection(options.userId);
    
    // 设置事件处理
    this.setupConnectionEvents();
  }

  /**
   * 设置连接事件处理
   */
  private setupConnectionEvents(): void {
    const events: ConnectionEventHandlers = {
      onConnect: (peerId) => {
        console.log(`Connected to peer: ${peerId}`);
        // 向新连接的对等点发送自己的用户信息
        this.sendJoinMessage(peerId);
        // 向新连接的对等点发送当前房间的用户列表
        this.sendUserList(peerId);
      },
      onDisconnect: (peerId) => {
        console.log(`Disconnected from peer: ${peerId}`);
        if (this.users.has(peerId)) {
          const username = this.users.get(peerId)?.username || '';
          this.users.delete(peerId);
          this.options.onLeave?.(peerId);
          // 通知其他成员有人离开
          this.broadcastLeaveMessage(peerId);
        }
      },
      onMessage: (data: any, fromPeerId) => {
        this.handleRoomMessage(data, fromPeerId);
      },
      onError: (error) => {
        console.error('Connection error:', error);
        this.options.onError?.(error);
      }
    };

    this.connection.on(events);
  }

  /**
   * 处理房间消息
   */
  private handleRoomMessage(data: any, fromPeerId: string): void {
    // 确保消息格式正确
    if (!data || !data.type) {
      console.error('Received invalid message format', data);
      return;
    }

    const message = data as RoomMessage;

    switch (message.type) {
      case 'JOIN':
        this.handleJoinMessage(message, fromPeerId);
        break;
      case 'LEAVE':
        this.handleLeaveMessage(message);
        break;
      case 'CHAT':
        this.handleChatMessage(message, fromPeerId);
        break;
      case 'USER_LIST':
        this.handleUserListMessage(message);
        break;
      default:
        console.warn('Unknown message type', message);
    }
  }

  /**
   * 处理加入消息
   */
  private handleJoinMessage(message: JoinMessage, fromPeerId: string): void {
    const { user } = message;
    
    // 保存用户信息
    this.users.set(user.id, user);
    
    // 触发回调
    this.options.onJoin?.(user.id, user.username);
    
    // 将新用户广播给房间内其他用户
    this.broadcastJoinMessage(user);
  }

  /**
   * 处理离开消息
   */
  private handleLeaveMessage(message: LeaveMessage): void {
    const { userId } = message;
    
    if (this.users.has(userId)) {
      this.users.delete(userId);
      this.options.onLeave?.(userId);
    }
  }

  /**
   * 处理聊天消息
   */
  private handleChatMessage(message: ChatMessage, fromPeerId: string): void {
    this.options.onMessage?.(message.message, fromPeerId);
  }

  /**
   * 处理用户列表消息
   */
  private handleUserListMessage(message: UserListMessage): void {
    const { users } = message;
    
    // 更新用户列表
    users.forEach(user => {
      if (!this.users.has(user.id)) {
        this.users.set(user.id, user);
        this.options.onJoin?.(user.id, user.username);
      }
    });
  }

  /**
   * 发送加入消息
   */
  private sendJoinMessage(targetPeerId?: string): void {
    const joinMessage: JoinMessage = {
      type: 'JOIN',
      user: this.userInfo
    };

    if (targetPeerId) {
      this.connection.sendMessage(targetPeerId, joinMessage as any);
    } else {
      this.connection.broadcast(joinMessage as any);
    }
  }

  /**
   * 广播加入消息
   */
  private broadcastJoinMessage(user: UserInfo): void {
    // 不要给加入者自己发消息
    if (user.id === this.userInfo.id) return;

    const joinMessage: JoinMessage = {
      type: 'JOIN',
      user
    };

    // 广播给所有人除了刚加入的用户
    this.connection.broadcast(joinMessage as any);
  }

  /**
   * 广播离开消息
   */
  private broadcastLeaveMessage(userId: string): void {
    const leaveMessage: LeaveMessage = {
      type: 'LEAVE',
      userId
    };

    this.connection.broadcast(leaveMessage as any);
  }

  /**
   * 发送用户列表
   */
  private sendUserList(targetPeerId: string): void {
    const userList: UserListMessage = {
      type: 'USER_LIST',
      users: Array.from(this.users.values())
    };

    this.connection.sendMessage(targetPeerId, userList as any);
  }

  /**
   * 加入房间
   */
  public async join(): Promise<string> {
    try {
      // 初始化连接
      const peerId = await this.connection.initialize();
      
      if (peerId !== this.userInfo.id) {
        // 如果分配的ID与当前ID不同,更新用户信息
        this.userInfo.id = peerId;
        this.users.delete(this.options.userId);
        this.users.set(peerId, this.userInfo);
      }
      
      // 获取房间ID (这里可根据实际情况进行修改)
      const roomPeerId = this.roomId;
      
      if (roomPeerId && roomPeerId !== peerId) {
        // 如果不是自己创建的房间,则连接到房间创建者
        await this.connection.connect(roomPeerId);
      }
      
      return peerId;
    } catch (error) {
      console.error('Failed to join room:', error);
      throw error;
    }
  }

  /**
   * 离开房间
   */
  public leave(): void {
    this.connection.disconnect();
    this.users.clear();
  }

  /**
   * 发送消息
   */
  public sendMessage(content: string): Message {
    const message: Message = {
      id: this.getNextMessageId(),
      sender: this.userInfo.username,
      content,
      timestamp: Date.now()
    };

    const chatMessage: ChatMessage = {
      type: 'CHAT',
      message
    };

    this.connection.broadcast(chatMessage as any);
    
    // 返回消息对象供UI显示
    return message;
  }

  /**
   * 生成唯一的消息ID
   */
  private getNextMessageId(): number {
    return ++this.messageIdCounter;
  }

  /**
   * 获取当前房间里的所有用户
   */
  public getUsers(): UserInfo[] {
    return Array.from(this.users.values());
  }

  /**
   * 获取当前连接状态
   */
  public getConnectionState(): ConnectionState {
    return this.connection.getState();
  }

  /**
   * 检查用户是否在房间中
   */
  public hasUser(userId: string): boolean {
    return this.users.has(userId);
  }
}

export default Room; 