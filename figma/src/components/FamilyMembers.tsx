import { MobileFrame } from './MobileFrame';
import { ArrowLeft, Trash2 } from 'lucide-react';

export function FamilyMembers() {
  return (
    <MobileFrame>
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
        <button><ArrowLeft size={24} className="text-gray-900" /></button>
        <h2 className="text-gray-900">Family Members</h2>
      </div>
      
      {/* Members List */}
      <div className="flex-1 overflow-y-auto bg-gray-50 px-6 py-4 space-y-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-12 h-12 bg-gray-300 rounded-full"></div>
          <div className="flex-1">
            <h3 className="text-sm text-gray-900">Mom</h3>
            <span className="inline-block mt-1 px-2 py-0.5 bg-gray-800 text-white rounded text-xs">Owner</span>
          </div>
        </div>
        
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-12 h-12 bg-gray-300 rounded-full"></div>
          <div className="flex-1">
            <h3 className="text-sm text-gray-900">Dad</h3>
          </div>
          <button className="p-2 text-red-600">
            <Trash2 size={18} />
          </button>
        </div>
        
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-12 h-12 bg-gray-300 rounded-full"></div>
          <div className="flex-1">
            <h3 className="text-sm text-gray-900">Eric</h3>
          </div>
          <button className="p-2 text-red-600">
            <Trash2 size={18} />
          </button>
        </div>
        
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-12 h-12 bg-gray-300 rounded-full"></div>
          <div className="flex-1">
            <h3 className="text-sm text-gray-900">Sarah</h3>
          </div>
          <button className="p-2 text-red-600">
            <Trash2 size={18} />
          </button>
        </div>
        
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-12 h-12 bg-gray-300 rounded-full"></div>
          <div className="flex-1">
            <h3 className="text-sm text-gray-900">Tom</h3>
          </div>
          <button className="p-2 text-red-600">
            <Trash2 size={18} />
          </button>
        </div>
      </div>
      
      {/* Bottom Info */}
      <div className="bg-gray-100 border-t border-gray-200 px-6 py-4">
        <p className="text-xs text-gray-600 text-center">
          Family Master Key: <span className="text-gray-900">ABC123XYZ</span>
        </p>
        <p className="text-xs text-gray-500 text-center mt-1">
          Share this code with new family members
        </p>
      </div>
    </MobileFrame>
  );
}
