import { X, Minus, Square } from 'lucide-react';
import { useState, useEffect } from 'react';

interface DraggableTitleBarProps {
  logo?: React.ReactNode;
  title?: string;
  className?: string;
}

export default function DraggableTitleBar({ 
  logo, 
  title = "SecureVault",
  className = ""
}: DraggableTitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    // Check if window is maximized on mount
    if (window.electronAPI) {
      window.electronAPI.isMaximized().then(setIsMaximized);
    }
  }, []);

  const handleMinimize = () => {
    window.electronAPI?.minimize();
  };

  const handleMaximize = async () => {
    if (window.electronAPI) {
      const maximized = await window.electronAPI.maximize();
      setIsMaximized(maximized);
    }
  };

  const handleClose = () => {
    window.electronAPI?.close();
  };

  return (
    <header 
      className={`h-14 bg-[#30302E] border-b border-[#3a3a38] select-none ${className}`}
      style={{ 
        // Make the title bar draggable
        WebkitAppRegion: 'drag',
        // "@ts-ignore-error"
        appRegion: 'drag'
      } as React.CSSProperties}
    >
      <div className="flex items-center justify-between h-full px-4">
        {/* Left: App Name & Logo */}
        <div className="flex items-center gap-3">
          {logo}
          <div className="text-sm font-bold text-white">{title}</div>
        </div>

        {/* Right: Window Controls */}
        <div 
          className="flex items-center gap-2"
          style={{ 
            // Make controls clickable (not draggable)
            WebkitAppRegion: 'no-drag',
            // "@ts-ignore-error"
            appRegion: 'no-drag'
          } as React.CSSProperties}
        >
          <button
            onClick={handleMinimize}
            className="p-2 hover:bg-[#262624] rounded-lg transition-colors text-gray-400 hover:text-white"
            title="Minimize"
          >
            <Minus className="w-4 h-4" />
          </button>
          
          <button
            onClick={handleMaximize}
            className="p-2 hover:bg-[#262624] rounded-lg transition-colors text-gray-400 hover:text-white"
            title={isMaximized ? "Restore" : "Maximize"}
          >
            <Square className="w-4 h-4" />
          </button>
          
          <button
            onClick={handleClose}
            className="p-2 hover:bg-red-500/10 rounded-lg transition-colors text-gray-400 hover:text-red-400"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}