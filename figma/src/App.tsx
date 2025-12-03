import { AuthCreateAccount } from './components/AuthCreateAccount';
import { AuthLogin } from './components/AuthLogin';
import { FamilyTimeline } from './components/FamilyTimeline';
import { AddPost } from './components/AddPost';
import { PostDetail } from './components/PostDetail';
import { RecipesBrowse } from './components/RecipesBrowse';
import { Profile } from './components/Profile';
import { FamilyMembers } from './components/FamilyMembers';

export default function App() {
  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="mb-2 text-gray-800">Family Recipe App - Wireframes</h1>
        <p className="mb-8 text-gray-600">Mobile-first wireframe set (iPhone-sized frames)</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <div className="flex flex-col">
            <div className="mb-2 text-gray-700">1. Auth - Create Account</div>
            <AuthCreateAccount />
          </div>
          
          <div className="flex flex-col">
            <div className="mb-2 text-gray-700">2. Auth - Log In</div>
            <AuthLogin />
          </div>
          
          <div className="flex flex-col">
            <div className="mb-2 text-gray-700">3. Home - Family Timeline</div>
            <FamilyTimeline />
          </div>
          
          <div className="flex flex-col">
            <div className="mb-2 text-gray-700">4. Add Post / Recipe</div>
            <AddPost />
          </div>
          
          <div className="flex flex-col">
            <div className="mb-2 text-gray-700">5. Post / Recipe Detail</div>
            <PostDetail />
          </div>
          
          <div className="flex flex-col">
            <div className="mb-2 text-gray-700">6. Recipes / Browse Screen</div>
            <RecipesBrowse />
          </div>
          
          <div className="flex flex-col">
            <div className="mb-2 text-gray-700">7. Profile Screen</div>
            <Profile />
          </div>
          
          <div className="flex flex-col">
            <div className="mb-2 text-gray-700">8. Family Members (Admin)</div>
            <FamilyMembers />
          </div>
        </div>
      </div>
    </div>
  );
}
