import { Home, Book, Plus, User } from 'lucide-react';

interface BottomTabBarProps {
  activeTab?: 'timeline' | 'recipes' | 'add' | 'profile';
}

export function BottomTabBar({ activeTab = 'timeline' }: BottomTabBarProps) {
  return (
    <div className="border-t border-gray-300 bg-white px-4 py-2 flex justify-around items-center">
      <button className={`flex flex-col items-center gap-1 px-4 py-1 ${activeTab === 'timeline' ? 'text-gray-900' : 'text-gray-400'}`}>
        <Home size={24} />
        <span className="text-xs">Timeline</span>
      </button>
      
      <button className={`flex flex-col items-center gap-1 px-4 py-1 ${activeTab === 'recipes' ? 'text-gray-900' : 'text-gray-400'}`}>
        <Book size={24} />
        <span className="text-xs">Recipes</span>
      </button>
      
      <button className={`flex flex-col items-center gap-1 px-4 py-1 ${activeTab === 'add' ? 'text-gray-900' : 'text-gray-400'}`}>
        <div className="bg-gray-800 rounded-full p-2">
          <Plus size={24} className="text-white" />
        </div>
      </button>
      
      <button className={`flex flex-col items-center gap-1 px-4 py-1 ${activeTab === 'profile' ? 'text-gray-900' : 'text-gray-400'}`}>
        <User size={24} />
        <span className="text-xs">Profile</span>
      </button>
    </div>
  );
}
