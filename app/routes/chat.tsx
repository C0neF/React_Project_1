import type { Route } from "./+types/chat";
import { useState, useRef, useEffect } from "react";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHome, faPaperPlane, faCopy, faSpinner, faRedo, faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import Peer from 'peerjs';
import { useLocation, Link, useNavigate } from 'react-router';

// 添加消息类型定义
type ChatMessage = {
  id: number;
  user: "me" | "peer";
  text: string;
};

export function meta({}: Route.MetaArgs) {
  return [{ title: "Chat" }];
}

export default function Chat() {
  const navigate = useNavigate();
  // 解析URL参数
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const roomId = params.get('room') || '';
  const isHost = params.get('host') === 'true';
  // WebRTC 相关状态
  const [peer, setPeer] = useState<Peer | null>(null);
  const [connection, setConnection] = useState<import('peerjs').DataConnection | null>(null);
  // 连接状态
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [connectionDetails, setConnectionDetails] = useState<string>("");
  // 复制状态
  const [copied, setCopied] = useState(false);
  // 新增接收消息方法
  const addPeerMessage = (msg: any) => {
    setMessages(prev => [...prev, { id: Date.now(), user: 'peer', text: String(msg) }]);
  };
  // 消息列表状态
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // 输入框状态
  const [inputValue, setInputValue] = useState("");
  // 用于滚动到底部的 ref
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 滚动到底部方法
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // 每次 messages 改变时滚动到底部
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 发送消息处理函数，向Peer发送
  const handleSend = () => {
    if (!inputValue.trim()) return;
    const newMessage: ChatMessage = { id: Date.now(), user: 'me', text: inputValue.trim() };
    setMessages(prev => [...prev, newMessage]);
    connection?.send(inputValue.trim());
    setInputValue("");
  };

  // 处理输入框聚焦，确保滚动到视图
  const handleInputFocus = () => {
    // 短暂延迟，确保软键盘弹出后再滚动
    setTimeout(() => {
      window.scrollTo(0, document.body.scrollHeight);
    }, 300);
  };

  // 复制房间ID到剪贴板
  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // 重新连接函数
  const handleReconnect = () => {
    // 完全重置状态，强制刷新连接
    if (connection) {
      connection.close();
    }
    if (peer) {
      peer.destroy();
    }
    
    // 清理状态
    setConnection(null);
    setPeer(null);
    setConnectionError(null);
    setIsConnecting(true);
    setConnectionDetails("");
    setReconnectAttempt(prev => prev + 1);
  };

  // 重新启动连接（回到首页再重新进入）
  const handleRestart = () => {
    navigate("/");
    // 短暂延迟后重新进入
    setTimeout(() => {
      navigate(`/chat?room=${roomId}${isHost ? '&host=true' : ''}`);
    }, 100);
  };

  // 初始化PeerJS连接
  useEffect(() => {
    if (!roomId) return;

    let timeoutId: NodeJS.Timeout;
    let checkConnectionId: NodeJS.Timeout;
    let retryCount = 0;
    const MAX_RETRIES = 3;
    
    // 设置连接超时
    const connectionTimeout = () => {
      if (!isConnected) {
        if (isHost) {
          setConnectionError("等待其他用户加入超时，请确认房间号是否已分享");
        } else {
          setConnectionError("连接到房间超时，请检查房间号是否正确。\n可能的原因：\n1. 房间号输入错误\n2. 房主已断开连接\n3. 网络连接问题");
        }
        setIsConnecting(false);
      }
    };

    // 检查是否能连接到PeerJS服务器
    const checkPeerJSServer = () => {
      return new Promise<boolean>((resolve) => {
        const testPeer = new Peer(`test-${Date.now()}`);
        const timeoutCheck = setTimeout(() => {
          testPeer.destroy();
          resolve(false);
        }, 5000);

        testPeer.on('open', () => {
          clearTimeout(timeoutCheck);
          testPeer.destroy();
          resolve(true);
        });

        testPeer.on('error', () => {
          clearTimeout(timeoutCheck);
          testPeer.destroy();
          resolve(false);
        });
      });
    };

    // 生成唯一的peerId，确保不会冲突
    const generatePeerId = (isHost: boolean, roomId: string): string => {
      if (isHost) {
        // 主机ID就是房间ID
        return roomId; 
      } else {
        // 访客使用随机ID
        return `guest-${Math.random().toString(36).substring(2, 9)}-${Date.now()}`;
      }
    };

    const initializePeer = async () => {
      try {
        setIsConnecting(true);
        setConnectionError(null);
        setConnectionDetails("检查连接状态...");

        // 确保之前的连接已完全关闭
        if (peer) {
          peer.destroy();
          setPeer(null);
        }

        // 检查PeerJS服务器连接
        const serverAvailable = await checkPeerJSServer();
        if (!serverAvailable) {
          setConnectionError("无法连接到信令服务器，请检查网络连接");
          setIsConnecting(false);
          return;
        }

        // 创建Peer对象
        setConnectionDetails("正在初始化连接...");
        const peerId = generatePeerId(isHost, roomId);
        
        const newPeer = new Peer(peerId, {
          debug: 1, // 降低日志级别减少控制台输出
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:global.stun.twilio.com:3478' },
              { urls: 'stun:stun.stunprotocol.org:3478' }
            ]
          }
        });

        newPeer.on('open', (id) => {
          console.log(`Peer opened with ID: ${id}`);
          setPeer(newPeer);
          setConnectionDetails(isHost ? "房间创建成功，等待其他用户加入..." : "正在连接到房间...");
          
          if (isHost) {
            // 主机在开启时不会立即设置为连接成功，需要等待他人加入
            console.log('主机已创建房间:', roomId);
            
            // 每隔5秒发送一次心跳，保持连接活跃
            checkConnectionId = setInterval(() => {
              if (newPeer.disconnected) {
                newPeer.reconnect();
              }
            }, 5000);
            
            // 设置30秒超时
            timeoutId = setTimeout(connectionTimeout, 30000);
          } else {
            // 客户端连接到房主
            console.log('尝试加入房间:', roomId);
            try {
              setConnectionDetails("房间存在，正在建立连接...");
              const conn = newPeer.connect(roomId, {
                reliable: true,
                serialization: 'json'
              });
              
              // 设置15秒超时
              timeoutId = setTimeout(connectionTimeout, 15000);
              
              conn.on('open', () => {
                console.log('成功加入房间');
                setConnectionDetails("连接成功！");
                setConnection(conn);
                setIsConnected(true);
                setIsConnecting(false);
                clearTimeout(timeoutId);
              });
              
              conn.on('data', data => addPeerMessage(data));
              
              conn.on('close', () => {
                console.log('连接关闭');
                setIsConnected(false);
                setConnectionError("与房主的连接已断开");
              });
              
              conn.on('error', (err) => {
                console.error('连接错误:', err);
                setConnectionError(`连接错误: ${err.type || err.message || '未知错误'}`);
                setIsConnecting(false);
              });
            } catch (connErr) {
              console.error('创建连接失败:', connErr);
              setConnectionError(`创建连接失败: ${connErr instanceof Error ? connErr.message : String(connErr)}`);
              setIsConnecting(false);
            }
          }
        });
        
        // 主机接收连接请求
        if (isHost) {
          newPeer.on('connection', conn => {
            console.log('有用户加入房间');
            setConnectionDetails("连接成功！用户已加入。");
            setConnection(conn);
            setIsConnected(true);
            setIsConnecting(false);
            clearTimeout(timeoutId);
            
            conn.on('data', data => addPeerMessage(data));
            
            conn.on('close', () => {
              console.log('对方断开连接');
              setIsConnected(false);
              setConnectionError("对方已断开连接");
            });

            conn.on('error', (err) => {
              console.error('连接错误:', err);
              setConnectionError(`连接错误: ${err.type || err.message || '未知错误'}`);
            });
          });
        }
        
        // 处理错误
        newPeer.on('error', (err) => {
          console.error('Peer错误:', err);
          
          // 检查特定的错误类型
          if (err.type === 'peer-unavailable') {
            setConnectionError("找不到指定的房间，请检查房间ID是否正确");
            setConnectionDetails("房间不存在或已关闭");
          } else if (err.type === 'disconnected') {
            setConnectionError("与信令服务器的连接已断开");
            setConnectionDetails("连接中断");
          } else if (err.type === 'network') {
            setConnectionError("网络连接问题，请检查您的网络");
            setConnectionDetails("网络异常");
          } else if (err.type === 'server-error' || (err.message && err.message.includes('is taken'))) {
            // ID 已被占用，尝试重新创建一个新的ID
            if (retryCount < MAX_RETRIES) {
              console.log(`ID被占用，尝试重新连接 (${retryCount + 1}/${MAX_RETRIES})...`);
              setConnectionDetails(`ID冲突，尝试重新连接 (${retryCount + 1}/${MAX_RETRIES})...`);
              retryCount++;
              setTimeout(initializePeer, 1000); // 延迟1秒后重试
              return;
            } else {
              setConnectionError("无法创建连接：多次尝试后ID仍被占用，请刷新页面重试");
              setConnectionDetails("无法创建唯一连接");
            }
          } else {
            setConnectionError(`创建连接失败: ${err.type || err.message || '未知错误'}`);
            setConnectionDetails("连接异常");
          }
          
          setIsConnecting(false);
        });

        // 处理断开连接
        newPeer.on('disconnected', () => {
          console.log('与信令服务器的连接已断开，尝试重新连接...');
          setConnectionDetails("重新连接中...");
          // 尝试重新连接到信令服务器
          if (newPeer) {
            newPeer.reconnect();
          }
        });

        // 处理关闭
        newPeer.on('close', () => {
          console.log('Peer连接已关闭');
          setIsConnected(false);
          if (!connectionError) {
            setConnectionError("连接已关闭");
          }
          setIsConnecting(false);
          clearInterval(checkConnectionId);
        });
        
      } catch (error) {
        console.error('初始化错误:', error);
        setConnectionError(`初始化错误: ${error instanceof Error ? error.message : String(error)}`);
        setIsConnecting(false);
      }
    };

    // 初始化连接
    initializePeer();

    // 清理函数
    return () => {
      console.log('清理WebRTC连接...');
      clearTimeout(timeoutId);
      clearInterval(checkConnectionId);
      
      if (connection) {
        connection.close();
      }
      
      if (peer) {
        peer.destroy();
      }
    };
  }, [roomId, isHost, reconnectAttempt]); // 添加reconnectAttempt作为依赖项，以便重连

  // 加载组件
  const LoadingScreen = () => (
    <div className="flex flex-col items-center justify-center h-[100dvh] bg-white">
      <div className="text-center p-6 max-w-sm mx-auto">
        <div className="mb-6">
          <FontAwesomeIcon 
            icon={faSpinner} 
            spin 
            size="3x" 
            className="text-green-500 md:text-blue-500" 
          />
        </div>
        <h2 className="text-xl font-semibold mb-2">
          {isHost ? '等待其他用户加入...' : '正在连接到房间...'}
        </h2>
        <p className="text-gray-600 mb-2">
          {connectionDetails}
        </p>
        <p className="text-gray-600 mb-4">
          房间ID: {roomId}
          <button 
            onClick={copyRoomId} 
            className="ml-2 text-green-500 md:text-blue-500 focus:outline-none"
            aria-label="复制房间号"
          >
            <FontAwesomeIcon 
              icon={faCopy} 
              className={copied ? 'text-gray-400' : ''} 
            />
          </button>
        </p>
        <div className="w-full bg-gray-200 rounded-full h-2.5 mb-6">
          <div className="bg-green-500 md:bg-blue-500 h-2.5 rounded-full w-1/2 animate-pulse"></div>
        </div>
        {isHost ? (
          <div className="text-sm text-gray-500 mb-4">
            <p className="mb-2">分享此房间ID给你想要聊天的朋友</p>
            <div className="bg-gray-100 rounded p-3 mt-2 flex items-start">
              <FontAwesomeIcon icon={faInfoCircle} className="text-blue-500 mr-2 mt-1" />
              <p className="text-left text-xs">
                确保你和朋友在同一网络环境下，或确保网络没有严格防火墙限制P2P连接
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-gray-100 rounded p-3 mt-2 mb-4 flex items-start">
            <FontAwesomeIcon icon={faInfoCircle} className="text-blue-500 mr-2 mt-1" />
            <p className="text-left text-xs">
              连接失败可能的原因：<br/>
              1. 房间号错误<br/>
              2. 房主已离开<br/>
              3. 网络环境不支持P2P连接
            </p>
          </div>
        )}
        <button 
          onClick={handleReconnect}
          className="inline-block mt-2 px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-all mr-2"
        >
          <FontAwesomeIcon icon={faRedo} className="mr-2" />
          重新连接
        </button>
        <Link to="/" className="inline-block mt-2 text-sm text-green-500 md:text-blue-500 hover:underline">
          返回首页
        </Link>
      </div>
    </div>
  );

  // 错误组件
  const ErrorScreen = () => (
    <div className="flex flex-col items-center justify-center h-[100dvh] bg-white">
      <div className="text-center p-6 max-w-sm mx-auto">
        <h2 className="text-xl font-semibold mb-4 text-red-500">连接失败</h2>
        <p className="text-gray-600 mb-4 whitespace-pre-line">{connectionError}</p>
        
        {/* 连接指南 */}
        <div className="bg-gray-100 rounded p-3 mb-6 text-left">
          <h3 className="font-semibold mb-2 text-gray-700">连接问题排查：</h3>
          <ul className="text-sm space-y-1 text-gray-600 list-disc pl-4">
            <li>确认房间ID正确无误</li>
            <li>确保房主保持在线</li>
            <li>尝试在同一网络环境下连接</li>
            <li>关闭VPN或代理</li>
            <li>检查防火墙是否阻止WebRTC连接</li>
          </ul>
        </div>
        
        <div className="flex flex-col space-y-3">
          <button 
            onClick={handleReconnect}
            className="px-6 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-all flex items-center justify-center"
          >
            <FontAwesomeIcon icon={faRedo} className="mr-2" />
            重新尝试连接
          </button>
          <button 
            onClick={handleRestart}
            className="px-6 py-2 bg-green-500 md:bg-blue-500 text-white rounded-lg hover:bg-opacity-90 transition-all"
          >
            重新启动连接
          </button>
          <Link 
            to="/" 
            className="px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-all text-center"
          >
            返回首页
          </Link>
        </div>
      </div>
    </div>
  );

  // 根据连接状态显示不同内容
  if (connectionError) {
    return <ErrorScreen />;
  }

  if (isConnecting || !isConnected) {
    return <LoadingScreen />;
  }

  return (
    <>
      {/* 移动端布局 */}
      <div className="md:hidden flex flex-col h-[100dvh] bg-white">
        <div className="h-12 bg-green-500 flex items-center justify-between px-4 text-white font-semibold text-lg sticky top-0 z-10">
          <Link to="/" className="text-white hover:text-green-100">
            <FontAwesomeIcon icon={faHome} size="lg" />
          </Link>
          <div className="flex items-center">
            房间ID：{roomId}
            <button 
              onClick={copyRoomId} 
              className="ml-2 focus:outline-none"
              aria-label="复制房间号"
            >
              <FontAwesomeIcon 
                icon={faCopy} 
                className={`transition-colors ${copied ? 'text-green-200' : 'text-white hover:text-green-100'}`} 
              />
            </button>
          </div>
          <div className="w-6"></div> {/* 添加空div保持居中 */}
        </div>
        <div className="flex-1 overflow-auto p-2">
          {messages.map((msg) => (
            <div key={msg.id} className={`mb-2 flex ${msg.user === "me" ? "justify-end" : "justify-start"}`}>
              <div className={`p-2 rounded-full ${msg.user === "me" ? "bg-green-500 text-white" : "bg-green-100 text-gray-800"}`}>
                {msg.text}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        <div className="h-14 bg-gray-100 border-t border-gray-300 flex items-center p-2 sticky bottom-0 z-10">
          <input
            className="flex-1 border border-gray-300 rounded-lg px-3 py-1 mr-2 focus:outline-none focus:ring-2 focus:ring-green-500"
            type="text"
            placeholder="输入消息..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            onFocus={handleInputFocus}
            autoFocus
          />
          <button className="bg-green-500 text-white px-3 py-1 rounded-lg" onClick={handleSend} aria-label="发送">
            <FontAwesomeIcon icon={faPaperPlane} size="lg" />
          </button>
        </div>
      </div>

      {/* 桌面端浮岛布局 */}
      <div className="hidden md:flex items-center justify-center h-screen bg-gray-100">
        <div className="w-11/12 max-w-screen-xl aspect-[16/9] bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col">
          <div className="h-16 bg-blue-500 relative flex items-center justify-between px-6 text-white font-bold text-xl">
            <Link to="/" className="text-white hover:text-blue-100">
              <FontAwesomeIcon icon={faHome} size="lg" />
            </Link>
            <div className="flex items-center">
              房间ID：{roomId}
              <button 
                onClick={copyRoomId} 
                className="ml-2 focus:outline-none"
                aria-label="复制房间号"
              >
                <FontAwesomeIcon 
                  icon={faCopy} 
                  className={`transition-colors ${copied ? 'text-blue-200' : 'text-white hover:text-blue-100'}`} 
                />
              </button>
            </div>
            <div className="w-6"></div> {/* 添加空div保持对称 */}
          </div>
          <div className="flex-1 overflow-auto p-4 bg-gray-100">
            {messages.map((msg) => (
              <div key={msg.id} className={`mb-4 flex ${msg.user === "me" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-sm p-2 rounded-lg shadow ${msg.user === "me" ? "bg-blue-500 text-white" : "bg-white text-gray-800"}`}>
                  {msg.text}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <div className="h-16 bg-white flex items-center p-4">
            <input
              className="flex-1 border border-gray-300 rounded-lg px-4 py-2 mr-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
              type="text"
              placeholder="输入消息..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
            />
            <button className="bg-blue-500 text-white px-4 py-2 rounded-lg" onClick={handleSend} aria-label="发送">
              <FontAwesomeIcon icon={faPaperPlane} size="lg" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
} 