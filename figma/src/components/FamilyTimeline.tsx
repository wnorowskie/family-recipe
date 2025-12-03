import { MobileFrame } from './MobileFrame';
import { BottomTabBar } from './BottomTabBar';
import { FileText, MessageCircle, ChefHat } from 'lucide-react';

export function FamilyTimeline() {
  return (
    <MobileFrame>
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h2 className="text-gray-900">Family Feed</h2>
        <div className="w-10 h-10 bg-gray-300 rounded-full"></div>
      </div>
      
      {/* Feed */}
      <div className="flex-1 overflow-y-auto bg-gray-50 px-4 py-4 space-y-3">
        {/* New post card */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <FileText size={20} className="text-gray-500 mt-1" />
            <div className="flex-1">
              <p className="text-sm">
                <span className="text-gray-900">Mom</span>
                <span className="text-gray-600"> posted </span>
                <span className="text-gray-900">'Lemon Chicken'</span>
              </p>
              <div className="mt-2 w-full h-32 bg-gray-200 rounded-lg"></div>
              <p className="text-xs text-gray-500 mt-2">2 hours ago</p>
            </div>
          </div>
        </div>
        
        {/* Comment card */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <MessageCircle size={20} className="text-gray-500 mt-1" />
            <div className="flex-1">
              <p className="text-sm">
                <span className="text-gray-900">Eric</span>
                <span className="text-gray-600"> commented on </span>
                <span className="text-gray-900">'Lemon Chicken'</span>
              </p>
              <div className="mt-2 bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-sm text-gray-700">"This was amazing!"</p>
              </div>
              <p className="text-xs text-gray-500 mt-2">5 hours ago</p>
            </div>
          </div>
        </div>
        
        {/* Cooked this card */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <ChefHat size={20} className="text-gray-500 mt-1" />
            <div className="flex-1">
              <p className="text-sm">
                <span className="text-gray-900">Eric</span>
                <span className="text-gray-600"> cooked </span>
                <span className="text-gray-900">'Lemon Chicken'</span>
              </p>
              <div className="mt-2 flex items-center gap-1">
                <span className="text-sm">⭐⭐⭐⭐</span>
                <span className="text-xs text-gray-500">(4 stars)</span>
              </div>
              <p className="text-xs text-gray-500 mt-2">1 day ago</p>
            </div>
          </div>
        </div>
        
        {/* New post card 2 */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <FileText size={20} className="text-gray-500 mt-1" />
            <div className="flex-1">
              <p className="text-sm">
                <span className="text-gray-900">Dad</span>
                <span className="text-gray-600"> posted </span>
                <span className="text-gray-900">'Chocolate Chip Cookies'</span>
              </p>
              <div className="mt-2 w-full h-32 bg-gray-200 rounded-lg"></div>
              <p className="text-xs text-gray-500 mt-2">3 days ago</p>
            </div>
          </div>
        </div>
      </div>
      
      <BottomTabBar activeTab="timeline" />
    </MobileFrame>
  );
}
