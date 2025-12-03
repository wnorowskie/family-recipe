import { MobileFrame } from './MobileFrame';
import { AlertCircle } from 'lucide-react';

export function AuthCreateAccount() {
  return (
    <MobileFrame>
      <div className="flex-1 overflow-y-auto bg-gray-50 px-6 py-12">
        <div className="flex flex-col items-center mb-12">
          <div className="w-16 h-16 bg-gray-300 rounded-2xl mb-4 flex items-center justify-center">
            <span className="text-2xl">🍳</span>
          </div>
          <h1 className="text-gray-900">Family Recipe</h1>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-700 mb-1">Name</label>
            <input 
              type="text" 
              placeholder="Your name"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white"
            />
          </div>
          
          <div>
            <label className="block text-sm text-gray-700 mb-1">Email or Username</label>
            <input 
              type="text" 
              placeholder="email@example.com"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white"
            />
          </div>
          
          <div>
            <label className="block text-sm text-gray-700 mb-1">Password</label>
            <input 
              type="password" 
              placeholder="••••••••"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white"
            />
          </div>
          
          <div>
            <label className="block text-sm text-gray-700 mb-1">Family Master Key</label>
            <input 
              type="text" 
              placeholder="Enter family code"
              className="w-full px-4 py-3 border-2 border-red-400 rounded-lg bg-white"
            />
            <p className="text-xs text-gray-500 mt-1">Ask the owner for this code</p>
            <div className="flex items-center gap-1 mt-1 text-red-600">
              <AlertCircle size={14} />
              <span className="text-xs">Invalid family key</span>
            </div>
          </div>
          
          <button className="w-full bg-gray-800 text-white py-3 rounded-lg mt-6">
            Create Account
          </button>
          
          <div className="text-center mt-4">
            <span className="text-sm text-gray-600">Already have an account? </span>
            <button className="text-sm text-gray-900 underline">Log in</button>
          </div>
        </div>
      </div>
    </MobileFrame>
  );
}
