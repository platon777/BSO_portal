import React from 'react';

interface OnlineStatusIndicatorProps {
  isOnline: boolean;
}

const OnlineStatusIndicator: React.FC<OnlineStatusIndicatorProps> = ({ isOnline }) => {
  const bgColor = isOnline ? 'bg-green-500' : 'bg-gray-400';
  const title = isOnline ? 'En ligne' : 'Hors ligne';

  return (
    <div className="flex items-center" title={title}>
      <span className={`w-3 h-3 rounded-full ${bgColor} transition-colors duration-300`}></span>
    </div>
  );
};

export default OnlineStatusIndicator;
