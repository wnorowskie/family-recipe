import { MobileFrame } from './MobileFrame';
import { BottomTabBar } from './BottomTabBar';
import { Search, ChevronDown } from 'lucide-react';

export function RecipesBrowse() {
  return (
    <MobileFrame>
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <h2 className="text-gray-900 mb-4">Recipes</h2>
        
        {/* Search Bar */}
        <div className="relative mb-3">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search by title, author, or ingredient..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        
        {/* Filters */}
        <div className="flex gap-2">
          <button className="flex items-center gap-1 px-3 py-1 border border-gray-300 rounded-lg text-sm">
            <span>Course</span>
            <ChevronDown size={14} />
          </button>
          <button className="flex items-center gap-1 px-3 py-1 bg-gray-800 text-white rounded-lg text-sm">
            <span>Tags</span>
            <ChevronDown size={14} />
          </button>
          <div className="flex-1"></div>
          <button className="flex items-center gap-1 px-3 py-1 border border-gray-300 rounded-lg text-sm">
            <span>Newest</span>
            <ChevronDown size={14} />
          </button>
        </div>
        
        {/* Active tags */}
        <div className="flex gap-2 mt-3">
          <span className="px-3 py-1 bg-gray-800 text-white rounded-full text-xs flex items-center gap-1">
            quick
            <button className="ml-1">×</button>
          </span>
          <span className="px-3 py-1 bg-gray-800 text-white rounded-full text-xs flex items-center gap-1">
            family classic
            <button className="ml-1">×</button>
          </span>
        </div>
      </div>
      
      {/* Recipe List */}
      <div className="flex-1 overflow-y-auto bg-gray-50 px-4 py-4 space-y-3">
        <div className="bg-white border border-gray-200 rounded-xl p-3 flex gap-3">
          <div className="w-24 h-24 bg-gray-200 rounded-lg flex-shrink-0"></div>
          <div className="flex-1 min-w-0">
            <h3 className="text-gray-900 mb-1">Lemon Chicken</h3>
            <p className="text-xs text-gray-600 mb-2">by Mom</p>
            <div className="flex gap-1 mb-2 flex-wrap">
              <span className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600">Dinner</span>
              <span className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600">quick</span>
            </div>
            <p className="text-xs text-gray-500">Cooked 3 times · 4.3⭐</p>
          </div>
        </div>
        
        <div className="bg-white border border-gray-200 rounded-xl p-3 flex gap-3">
          <div className="w-24 h-24 bg-gray-200 rounded-lg flex-shrink-0"></div>
          <div className="flex-1 min-w-0">
            <h3 className="text-gray-900 mb-1">Chocolate Chip Cookies</h3>
            <p className="text-xs text-gray-600 mb-2">by Dad</p>
            <div className="flex gap-1 mb-2 flex-wrap">
              <span className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600">Dessert</span>
              <span className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600">family classic</span>
            </div>
            <p className="text-xs text-gray-500">Cooked 12 times · 4.8⭐</p>
          </div>
        </div>
        
        <div className="bg-white border border-gray-200 rounded-xl p-3 flex gap-3">
          <div className="w-24 h-24 bg-gray-200 rounded-lg flex-shrink-0"></div>
          <div className="flex-1 min-w-0">
            <h3 className="text-gray-900 mb-1">Grandma's Apple Pie</h3>
            <p className="text-xs text-gray-600 mb-2">by Sarah</p>
            <div className="flex gap-1 mb-2 flex-wrap">
              <span className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600">Dessert</span>
              <span className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600">family classic</span>
            </div>
            <p className="text-xs text-gray-500">Cooked 8 times · 5.0⭐</p>
          </div>
        </div>
        
        <div className="bg-white border border-gray-200 rounded-xl p-3 flex gap-3">
          <div className="w-24 h-24 bg-gray-200 rounded-lg flex-shrink-0"></div>
          <div className="flex-1 min-w-0">
            <h3 className="text-gray-900 mb-1">Sunday Pot Roast</h3>
            <p className="text-xs text-gray-600 mb-2">by Mom</p>
            <div className="flex gap-1 mb-2 flex-wrap">
              <span className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600">Dinner</span>
              <span className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600">comfort food</span>
            </div>
            <p className="text-xs text-gray-500">Cooked 5 times · 4.6⭐</p>
          </div>
        </div>
        
        <div className="bg-white border border-gray-200 rounded-xl p-3 flex gap-3">
          <div className="w-24 h-24 bg-gray-200 rounded-lg flex-shrink-0"></div>
          <div className="flex-1 min-w-0">
            <h3 className="text-gray-900 mb-1">Breakfast Pancakes</h3>
            <p className="text-xs text-gray-600 mb-2">by Eric</p>
            <div className="flex gap-1 mb-2 flex-wrap">
              <span className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600">Breakfast</span>
              <span className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600">quick</span>
            </div>
            <p className="text-xs text-gray-500">Cooked 15 times · 4.5⭐</p>
          </div>
        </div>
      </div>
      
      <BottomTabBar activeTab="recipes" />
    </MobileFrame>
  );
}
