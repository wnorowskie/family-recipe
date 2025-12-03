import { MobileFrame } from './MobileFrame';
import { X, Camera, ChevronDown } from 'lucide-react';
import { useState } from 'react';

export function AddPost() {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <MobileFrame>
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <button className="text-gray-600">Cancel</button>
        <h2 className="text-gray-900">New Post</h2>
        <button className="text-gray-900">Save</button>
      </div>
      
      {/* Form */}
      <div className="flex-1 overflow-y-auto bg-gray-50 px-6 py-4 space-y-4">
        {/* Basic Post Section */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
          <div>
            <label className="block text-sm text-gray-700 mb-1">Title <span className="text-red-500">*</span></label>
            <input 
              type="text" 
              placeholder="Recipe or post title"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          
          <div>
            <label className="block text-sm text-gray-700 mb-2">Photos</label>
            <div className="flex gap-2">
              <div className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50">
                <Camera size={24} className="text-gray-400" />
              </div>
              <div className="w-20 h-20 bg-gray-200 rounded-lg"></div>
              <div className="w-20 h-20 bg-gray-200 rounded-lg"></div>
            </div>
          </div>
          
          <div>
            <label className="block text-sm text-gray-700 mb-1">Caption (optional)</label>
            <textarea 
              placeholder="Share the story behind this dish..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg h-20"
            />
          </div>
        </div>
        
        {/* Recipe Details Section */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <button 
            onClick={() => setExpanded(!expanded)}
            className="w-full px-4 py-3 flex items-center justify-between bg-gray-100"
          >
            <span className="text-sm text-gray-700">Add Recipe Details (Optional)</span>
            <ChevronDown size={20} className={`text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
          
          {expanded && (
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1">Origin</label>
                <input 
                  type="text" 
                  placeholder="e.g., Grandma's recipe"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-700 mb-1">Ingredients (one per line)</label>
                <textarea 
                  placeholder="2 cups flour&#10;1 tsp salt&#10;3 eggs"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg h-24"
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-700 mb-1">Steps / Instructions</label>
                <textarea 
                  placeholder="1. Mix dry ingredients&#10;2. Add wet ingredients..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg h-24"
                />
              </div>
              
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-sm text-gray-700 mb-1">Total Time</label>
                  <input 
                    type="text" 
                    placeholder="45 min"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                
                <div className="flex-1">
                  <label className="block text-sm text-gray-700 mb-1">Serving Size</label>
                  <input 
                    type="text" 
                    placeholder="4"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm text-gray-700 mb-1">Course</label>
                <div className="flex gap-2 flex-wrap">
                  <button className="px-3 py-1 border border-gray-300 rounded-full text-sm">Breakfast</button>
                  <button className="px-3 py-1 border border-gray-300 rounded-full text-sm">Lunch</button>
                  <button className="px-3 py-1 bg-gray-800 text-white rounded-full text-sm">Dinner</button>
                  <button className="px-3 py-1 border border-gray-300 rounded-full text-sm">Dessert</button>
                </div>
              </div>
              
              <div>
                <label className="block text-sm text-gray-700 mb-1">Difficulty</label>
                <div className="flex gap-2">
                  <button className="flex-1 px-3 py-2 bg-gray-800 text-white rounded-lg text-sm">Easy</button>
                  <button className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm">Medium</button>
                  <button className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm">Hard</button>
                </div>
              </div>
              
              <div>
                <label className="block text-sm text-gray-700 mb-2">Tags</label>
                <div className="flex gap-2 flex-wrap">
                  <span className="px-3 py-1 bg-gray-800 text-white rounded-full text-xs">quick</span>
                  <span className="px-3 py-1 bg-gray-200 text-gray-700 rounded-full text-xs">holiday</span>
                  <span className="px-3 py-1 bg-gray-800 text-white rounded-full text-xs">family classic</span>
                  <span className="px-3 py-1 bg-gray-200 text-gray-700 rounded-full text-xs">kid-friendly</span>
                  <span className="px-3 py-1 bg-gray-200 text-gray-700 rounded-full text-xs">spicy</span>
                  <span className="px-3 py-1 bg-gray-200 text-gray-700 rounded-full text-xs">comfort food</span>
                  <span className="px-3 py-1 bg-gray-200 text-gray-700 rounded-full text-xs">vegetarian</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </MobileFrame>
  );
}
