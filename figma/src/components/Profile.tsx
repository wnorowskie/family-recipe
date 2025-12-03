import { MobileFrame } from './MobileFrame';
import { BottomTabBar } from './BottomTabBar';
import { Users, LogOut } from 'lucide-react';
import { useState } from 'react';

export function Profile() {
  const [activeTab, setActiveTab] = useState<'posts' | 'cooked' | 'favorites'>('posts');
  
  return (
    <MobileFrame>
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <h2 className="text-gray-900">My Profile</h2>
      </div>
      
      {/* Profile Header */}
      <div className="bg-white px-6 py-6 border-b border-gray-200">
        <div className="flex flex-col items-center mb-4">
          <div className="w-20 h-20 bg-gray-300 rounded-full mb-3"></div>
          <h3 className="text-gray-900">Eric</h3>
        </div>
        
        <div className="flex justify-around">
          <div className="text-center">
            <div className="text-gray-900">12</div>
            <div className="text-xs text-gray-500">Posts</div>
          </div>
          <div className="text-center">
            <div className="text-gray-900">24</div>
            <div className="text-xs text-gray-500">Cooked</div>
          </div>
          <div className="text-center">
            <div className="text-gray-900">8</div>
            <div className="text-xs text-gray-500">Favorites</div>
          </div>
        </div>
      </div>
      
      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 flex">
        <button 
          onClick={() => setActiveTab('posts')}
          className={`flex-1 py-3 text-sm ${activeTab === 'posts' ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-500'}`}
        >
          My Posts
        </button>
        <button 
          onClick={() => setActiveTab('cooked')}
          className={`flex-1 py-3 text-sm ${activeTab === 'cooked' ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-500'}`}
        >
          Cooked
        </button>
        <button 
          onClick={() => setActiveTab('favorites')}
          className={`flex-1 py-3 text-sm ${activeTab === 'favorites' ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-500'}`}
        >
          Favorites
        </button>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-gray-50 px-4 py-4">
        {activeTab === 'posts' && (
          <div className="space-y-3">
            <div className="bg-white border border-gray-200 rounded-xl p-3 flex gap-3">
              <div className="w-20 h-20 bg-gray-200 rounded-lg"></div>
              <div className="flex-1">
                <h4 className="text-sm text-gray-900 mb-1">Breakfast Pancakes</h4>
                <p className="text-xs text-gray-500 mb-1">3 days ago</p>
                <p className="text-xs text-gray-600">Cooked 15 times · 4.5⭐</p>
              </div>
            </div>
            
            <div className="bg-white border border-gray-200 rounded-xl p-3 flex gap-3">
              <div className="w-20 h-20 bg-gray-200 rounded-lg"></div>
              <div className="flex-1">
                <h4 className="text-sm text-gray-900 mb-1">Spaghetti Carbonara</h4>
                <p className="text-xs text-gray-500 mb-1">1 week ago</p>
                <p className="text-xs text-gray-600">Cooked 7 times · 4.2⭐</p>
              </div>
            </div>
          </div>
        )}
        
        {activeTab === 'cooked' && (
          <div className="space-y-3">
            <div className="bg-white border border-gray-200 rounded-xl p-3">
              <div className="flex justify-between items-start mb-2">
                <h4 className="text-sm text-gray-900">Lemon Chicken</h4>
                <span className="text-xs text-gray-500">1 day ago</span>
              </div>
              <p className="text-xs text-gray-600 mb-2">by Mom</p>
              <div className="flex items-center gap-1">
                <span>⭐⭐⭐⭐</span>
                <span className="text-xs text-gray-500">(4 stars)</span>
              </div>
            </div>
            
            <div className="bg-white border border-gray-200 rounded-xl p-3">
              <div className="flex justify-between items-start mb-2">
                <h4 className="text-sm text-gray-900">Chocolate Chip Cookies</h4>
                <span className="text-xs text-gray-500">5 days ago</span>
              </div>
              <p className="text-xs text-gray-600 mb-2">by Dad</p>
              <div className="flex items-center gap-1">
                <span>⭐⭐⭐⭐⭐</span>
                <span className="text-xs text-gray-500">(5 stars)</span>
              </div>
            </div>
            
            <div className="bg-white border border-gray-200 rounded-xl p-3">
              <div className="flex justify-between items-start mb-2">
                <h4 className="text-sm text-gray-900">Sunday Pot Roast</h4>
                <span className="text-xs text-gray-500">1 week ago</span>
              </div>
              <p className="text-xs text-gray-600 mb-2">by Mom</p>
              <div className="flex items-center gap-1">
                <span>⭐⭐⭐⭐⭐</span>
                <span className="text-xs text-gray-500">(5 stars)</span>
              </div>
            </div>
          </div>
        )}
        
        {activeTab === 'favorites' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="w-full h-32 bg-gray-200"></div>
              <div className="p-2">
                <h4 className="text-sm text-gray-900">Lemon Chicken</h4>
                <p className="text-xs text-gray-500">by Mom</p>
              </div>
            </div>
            
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="w-full h-32 bg-gray-200"></div>
              <div className="p-2">
                <h4 className="text-sm text-gray-900">Apple Pie</h4>
                <p className="text-xs text-gray-500">by Sarah</p>
              </div>
            </div>
            
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="w-full h-32 bg-gray-200"></div>
              <div className="p-2">
                <h4 className="text-sm text-gray-900">Cookies</h4>
                <p className="text-xs text-gray-500">by Dad</p>
              </div>
            </div>
            
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="w-full h-32 bg-gray-200"></div>
              <div className="p-2">
                <h4 className="text-sm text-gray-900">Pot Roast</h4>
                <p className="text-xs text-gray-500">by Mom</p>
              </div>
            </div>
          </div>
        )}
        
        {/* Bottom Actions */}
        <div className="mt-6 space-y-2 pb-4">
          <button className="w-full flex items-center justify-center gap-2 py-3 bg-white border border-gray-300 rounded-lg">
            <Users size={18} />
            <span className="text-sm">Family Members</span>
          </button>
          
          <button className="w-full flex items-center justify-center gap-2 py-3 border border-gray-300 rounded-lg text-red-600">
            <LogOut size={18} />
            <span className="text-sm">Log Out</span>
          </button>
        </div>
      </div>
      
      <BottomTabBar activeTab="profile" />
    </MobileFrame>
  );
}
