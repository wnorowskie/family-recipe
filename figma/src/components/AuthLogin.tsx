import { MobileFrame } from './MobileFrame';

export function AuthLogin() {
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
          
          <div className="text-right">
            <button className="text-sm text-gray-600 underline">Forgot password?</button>
          </div>
          
          <button className="w-full bg-gray-800 text-white py-3 rounded-lg mt-6">
            Log In
          </button>
          
          <div className="text-center mt-4">
            <button className="text-sm text-gray-900 underline">Create account</button>
          </div>
        </div>
      </div>
    </MobileFrame>
  );
}
