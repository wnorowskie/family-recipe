import { MobileFrame } from './MobileFrame';
import { ArrowLeft, MoreVertical, Heart, Star, Bookmark, Camera, Trash2 } from 'lucide-react';

export function PostDetail() {
  return (
    <MobileFrame>
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <button><ArrowLeft size={24} className="text-gray-900" /></button>
        <button><MoreVertical size={24} className="text-gray-600" /></button>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        {/* Title & Meta */}
        <div className="bg-white px-6 py-4 border-b border-gray-200">
          <h1 className="text-gray-900 mb-3">Lemon Chicken</h1>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-gray-300 rounded-full"></div>
              <div>
                <p className="text-sm text-gray-900">Mom</p>
                <p className="text-xs text-gray-500">2 hours ago</p>
              </div>
            </div>
            <button className="px-4 py-1 border border-gray-300 rounded-lg text-sm">Edit</button>
          </div>
        </div>
        
        {/* Photos */}
        <div className="relative">
          <div className="w-full h-64 bg-gray-200"></div>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1">
            <div className="w-2 h-2 bg-white rounded-full"></div>
            <div className="w-2 h-2 bg-white/50 rounded-full"></div>
            <div className="w-2 h-2 bg-white/50 rounded-full"></div>
          </div>
        </div>
        
        {/* Recipe Details */}
        <div className="bg-white px-6 py-4 space-y-4">
          <div className="flex gap-2 flex-wrap">
            <span className="px-3 py-1 bg-gray-200 rounded-full text-xs">Dinner</span>
            <span className="px-3 py-1 bg-gray-200 rounded-full text-xs">Easy</span>
            <span className="px-3 py-1 bg-gray-200 rounded-full text-xs">quick</span>
            <span className="px-3 py-1 bg-gray-200 rounded-full text-xs">family classic</span>
          </div>
          
          <div className="flex gap-6 text-sm">
            <div>
              <span className="text-gray-500">Time: </span>
              <span className="text-gray-900">45 min</span>
            </div>
            <div>
              <span className="text-gray-500">Serves: </span>
              <span className="text-gray-900">4</span>
            </div>
          </div>
          
          <div>
            <h3 className="text-gray-900 mb-2">Ingredients</h3>
            <ul className="space-y-1 text-sm text-gray-700">
              <li>• 4 chicken breasts</li>
              <li>• 2 lemons (juiced)</li>
              <li>• 3 cloves garlic (minced)</li>
              <li>• 2 tbsp olive oil</li>
              <li>• Salt and pepper to taste</li>
            </ul>
          </div>
          
          <div>
            <h3 className="text-gray-900 mb-2">Steps</h3>
            <ol className="space-y-2 text-sm text-gray-700">
              <li>1. Marinate chicken in lemon juice and garlic for 30 minutes</li>
              <li>2. Heat olive oil in a large pan over medium-high heat</li>
              <li>3. Cook chicken 6-8 minutes per side until golden</li>
              <li>4. Let rest 5 minutes before serving</li>
            </ol>
          </div>
        </div>
        
        {/* Version Info */}
        <div className="bg-gray-100 px-6 py-3 border-y border-gray-200">
          <p className="text-xs text-gray-600">
            Last updated by <span className="text-gray-900">Mom</span> on Jan 5: 
            Reduced garlic from 6 cloves to 3.
          </p>
        </div>
        
        {/* Stats & Actions */}
        <div className="bg-white px-6 py-4 space-y-4">
          <p className="text-sm text-gray-600">Cooked 3 times · Avg 4.3⭐</p>
          
          <div className="flex items-center gap-4">
            <button className="flex items-center gap-1">
              <span>❤️</span>
              <span className="text-sm text-gray-600">5</span>
            </button>
            <button className="flex items-center gap-1">
              <span>😋</span>
              <span className="text-sm text-gray-600">3</span>
            </button>
            <button className="flex items-center gap-1">
              <span>👍</span>
              <span className="text-sm text-gray-600">2</span>
            </button>
            <div className="flex-1"></div>
            <button className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm">
              Cooked this
            </button>
            <button>
              <Bookmark size={20} className="text-gray-600" />
            </button>
          </div>
        </div>
        
        {/* Comments Section */}
        <div className="bg-white px-6 py-4 mt-2">
          <h3 className="text-gray-900 mb-4">Comments (3)</h3>
          
          {/* Comment Input */}
          <div className="flex gap-2 mb-4 pb-4 border-b border-gray-200">
            <div className="w-8 h-8 bg-gray-300 rounded-full flex-shrink-0"></div>
            <div className="flex-1 flex gap-2">
              <input 
                type="text" 
                placeholder="Add a comment..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <button className="p-2 border border-gray-300 rounded-lg">
                <Camera size={18} className="text-gray-600" />
              </button>
            </div>
          </div>
          
          {/* Comment List */}
          <div className="space-y-4">
            <div className="flex gap-2">
              <div className="w-8 h-8 bg-gray-300 rounded-full flex-shrink-0"></div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm text-gray-900">Eric</span>
                  <span className="text-xs text-gray-500">5 hours ago</span>
                </div>
                <p className="text-sm text-gray-700">This was amazing! The lemon flavor was perfect.</p>
                <div className="mt-2 w-20 h-20 bg-gray-200 rounded-lg"></div>
              </div>
              <button className="p-1">
                <Trash2 size={14} className="text-gray-400" />
              </button>
            </div>
            
            <div className="flex gap-2">
              <div className="w-8 h-8 bg-gray-300 rounded-full flex-shrink-0"></div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm text-gray-900">Dad</span>
                  <span className="text-xs text-gray-500">1 day ago</span>
                </div>
                <p className="text-sm text-gray-700">Adding this to our weekly rotation!</p>
              </div>
            </div>
            
            <div className="flex gap-2">
              <div className="w-8 h-8 bg-gray-300 rounded-full flex-shrink-0"></div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm text-gray-900">Sarah</span>
                  <span className="text-xs text-gray-500">2 days ago</span>
                </div>
                <p className="text-sm text-gray-700">Made this tonight - so good! 🍋</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </MobileFrame>
  );
}
