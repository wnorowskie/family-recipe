import { ReactNode } from 'react';

interface MobileFrameProps {
  children: ReactNode;
}

export function MobileFrame({ children }: MobileFrameProps) {
  return (
    <div className="w-[375px] h-[812px] bg-white border-4 border-gray-800 rounded-[40px] overflow-hidden shadow-xl flex flex-col">
      {children}
    </div>
  );
}
