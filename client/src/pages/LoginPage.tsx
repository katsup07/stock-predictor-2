import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LogIn, UserPlus } from 'lucide-react';

export default function LoginPage() {
  const { signIn, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn(email, password);
      navigate('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    try {
      await signInWithGoogle();
      navigate('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-md bg-surface rounded-2xl p-8 shadow-xl border border-border">
        <h1 className="text-2xl font-bold text-text mb-6 flex items-center gap-2">
          <LogIn size={24} /> Sign In
        </h1>

        {error && (
          <div className="bg-danger/10 border border-danger/30 text-danger rounded-lg p-3 mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-text-muted mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-surface-light border border-border rounded-lg px-4 py-2.5 text-text focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-surface-light border border-border rounded-lg px-4 py-2.5 text-text focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-primary-dark text-white font-medium rounded-lg py-2.5 transition disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div className="my-4 flex items-center gap-2">
          <div className="flex-1 h-px bg-border" />
          <span className="text-text-muted text-xs">OR</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <button
          onClick={handleGoogle}
          className="w-full bg-surface-light hover:bg-surface-lighter border border-border text-text font-medium rounded-lg py-2.5 transition"
        >
          Continue with Google
        </button>

        <p className="text-text-muted text-sm mt-6 text-center">
          Don&apos;t have an account?{' '}
          <Link to="/register" className="text-primary hover:underline inline-flex items-center gap-1">
            <UserPlus size={14} /> Sign Up
          </Link>
        </p>
      </div>
    </div>
  );
}
