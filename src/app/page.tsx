import { redirect } from 'next/navigation';

export default function HomePage() {
  // For now, just redirect to signup
  // Later we'll add proper auth checking
  redirect('/signup');
}
