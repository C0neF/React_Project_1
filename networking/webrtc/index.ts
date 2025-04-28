/**
 * WebRTC通信模块入口
 * 导出所有WebRTC相关组件
 */

import WebRTCConnection from './connection';
import Room from './room';

// 导出类型
import type { 
  ConnectionConfig, 
  ConnectionState, 
  Message, 
  ConnectionEventHandlers 
} from './connection';

import type {
  RoomOptions
} from './room';

// 导出类
export {
  WebRTCConnection,
  Room,
};

// 导出类型
export type {
  ConnectionConfig,
  ConnectionState,
  Message,
  ConnectionEventHandlers,
  RoomOptions,
};

// 默认导出模块
export default {
  WebRTCConnection,
  Room
}; 