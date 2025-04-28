import type { Route } from "./+types/home";
import { useNavigate } from "react-router";
import { useState } from "react";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDoorOpen, faTimes } from '@fortawesome/free-solid-svg-icons';

export function meta({}: Route.MetaArgs) {
  return [
    { title: "New React Router App" },
    { name: "description", content: "Welcome to React Router!" },
  ];
}

export default function Home() {
  const navigate = useNavigate();
  // 创建/加入房间状态及房间 ID
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  
  // 生成随机5位房间ID并直接进入
  const handleCreate = () => {
    const id = (Math.floor(Math.random() * 90000) + 10000).toString();
    navigate(`/chat?room=${id}&host=true`);
  };
  
  // 加入房间
  const handleJoin = () => {
    if (!roomId.trim()) return;
    navigate(`/chat?room=${roomId.trim()}`);
  };
  
  return (
    <>
      <div className="flex flex-col items-center justify-center h-screen space-y-6">
        {/* 主页标题 */}
        <h1 className="text-2xl font-bold">Hello World</h1>
        {/* 按钮横向容器 */}
        <div className="flex space-x-8">
          {/* 创建房间按钮 */}
          <button onClick={handleCreate} className="px-8 py-4 bg-blue-500 text-white rounded-xl hover:bg-blue-600 text-lg">
            创建房间
          </button>
          {/* 加入房间按钮（手动加入） */}
          <button
            onClick={() => { setShowJoinInput(true); }}
            className="px-8 py-4 bg-green-500 text-white rounded-xl hover:bg-green-600 text-lg"
          >
            加入房间
          </button>
        </div>
      </div>
      {/* 弹出输入框，集成加入/取消图标，不影响布局 */}
      {showJoinInput && (
        <div className="fixed bottom-16 inset-x-0 flex justify-center z-50">
          <div className="relative w-11/12 sm:w-3/4 md:w-1/2 lg:w-1/3 max-w-[400px]">
            <input
              type="text"
              placeholder="输入房间ID..."
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              className="w-full border border-gray-300 rounded-full px-4 py-2 pl-10 pr-10 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            {/* 取消图标 */}
            <FontAwesomeIcon
              icon={faTimes}
              size="lg"
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 cursor-pointer"
              onClick={() => { setShowJoinInput(false); setRoomId(""); }}
            />
            {/* 加入图标 */}
            <FontAwesomeIcon
              icon={faDoorOpen}
              size="lg"
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-green-500 hover:text-green-600 cursor-pointer"
              onClick={handleJoin}
            />
          </div>
        </div>
      )}
    </>
  );
}
