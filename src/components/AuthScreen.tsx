import React, { useState } from 'react';
import {
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  Eye,
  EyeOff,
  GraduationCap,
  Lock,
  Mail,
  Moon,
  Sun,
  User as UserIcon,
} from 'lucide-react';
import { useCampus } from '../context/CampusContext';
import type { UserRole } from '../types/campus';

type AuthMode = 'login' | 'register' | 'reset';

export const AuthScreen: React.FC = () => {
  const {
    signInWithGoogle,
    signInWithEmail,
    registerWithEmail,
    resetPassword,
    enterDemoMode,
    theme,
    toggleTheme,
  } = useCampus();

  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  const handleGoogle = async () => {
    setError(null);
    setInfoMessage(null);
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google Sign-In failed.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);

    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid college or personal email address.');
      return;
    }

    if (mode !== 'reset' && password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (mode === 'register' && name.trim().length < 2) {
      setError('Please enter your full name.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        await signInWithEmail(email.trim(), password);
      } else if (mode === 'register') {
        await registerWithEmail(name.trim(), email.trim(), password);
        setInfoMessage(
          'Account created! Please check your inbox and verify your email address before signing in.'
        );
      } else {
        await resetPassword(email.trim());
        setInfoMessage('Password reset email sent. Check your inbox to set a new password.');
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      if (raw.includes('auth/operation-not-allowed')) {
        setError(
          'Email/Password sign-in is not yet enabled in your Firebase Console (Authentication -> Sign-in method -> Email/Password). Use "Continue with Google" below or Explore Sample Workspace right now.'
        );
      } else if (raw.includes('auth/invalid-credential') || raw.includes('auth/wrong-password')) {
        setError('Invalid email or password. Please verify your credentials or reset your password.');
      } else if (raw.includes('auth/email-already-in-use')) {
        setError('An account with this email already exists. Switch to Sign In.');
      } else {
        setError(raw);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA] dark:bg-[#07090E] text-[#0B1120] dark:text-[#F1F5F9] flex flex-col lg:flex-row">
      {/* Left Architectural Showcase */}
      <div className="lg:w-[54%] relative overflow-hidden bg-[#07090E] text-white flex flex-col justify-between p-5 sm:p-8 lg:p-14 min-h-[280px] lg:min-h-screen border-b lg:border-b-0 lg:border-r border-white/[0.08]">
        {!heroImgFailed && (
          <img
            src="/src/assets/images/campus_study_hero_1794918573289.jpg"
            alt="SKU Campus university library study hall"
            referrerPolicy="no-referrer"
            onError={() => setHeroImgFailed(true)}
            className="absolute inset-0 w-full h-full object-cover opacity-45"
          />
        )}
        <div
          className="absolute inset-0 bg-gradient-to-t from-[#07090E] via-[#07090E]/75 to-[#07090E]/45 cc-grid-pattern"
          aria-hidden="true"
        />

        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <span className="font-display text-lg font-semibold tracking-tight whitespace-nowrap block leading-tight">
                SKU Campus
              </span>
              <span className="text-[11px] text-slate-400 block">Smart Student Hub</span>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle color theme"
            className="p-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.1] text-white transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>

        <div className="relative z-10 max-w-xl space-y-5 my-8">
          <p className="text-xs font-medium tracking-wide text-blue-300">
            Smart Student Hub · Academic Workspace
          </p>
          <h1 className="font-display text-3xl sm:text-4xl lg:text-[2.75rem] font-semibold leading-[1.12] tracking-tight text-balance">
            One centralized hub for notes, books, AI doubt solving, exams, and attendance.
          </h1>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-lg">
            Built for university students, faculty, and academic administrators to replace scattered drives, missed deadlines, and attendance guesswork.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            {[
              { title: 'Materials, Books & Syllabus', desc: 'Department to unit-wise PDFs & PYQs' },
              { title: 'Gemini AI Doubt Solver', desc: 'PDF analysis & English / Hindi tutoring' },
              { title: 'Exam Prep & Study Rooms', desc: 'Checklists, quizzes & shared whiteboards' },
              { title: 'Smart Attendance Tracker', desc: 'Target math & official PDF export reports' },
            ].map((item) => (
              <div
                key={item.title}
                className="p-4 rounded-xl bg-[#0E121B]/80 border border-white/[0.1] backdrop-blur-md"
              >
                <p className="text-sm font-medium text-white">{item.title}</p>
                <p className="text-xs text-slate-400 mt-1">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
          <span>Role-Based Access</span>
          <span aria-hidden="true">·</span>
          <span>Real-Time Cloud Sync</span>
          <span aria-hidden="true">·</span>
          <span>Bilingual AI Tutor</span>
        </div>
      </div>

      {/* Right Authentication Panel */}
      <div className="lg:w-[46%] flex items-center justify-center p-4 sm:p-10 lg:p-14">
        <div className="w-full max-w-md cc-card p-5 sm:p-8 space-y-6">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight">
              {mode === 'login' && 'Sign in to SKU Campus'}
              {mode === 'register' && 'Create student account'}
              {mode === 'reset' && 'Reset your password'}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {mode === 'login' && 'Access your personalized academic dashboard and saved records.'}
              {mode === 'register' && 'Register with your email or continue instantaneously with Google.'}
              {mode === 'reset' && 'Enter your registered email to receive a password recovery link.'}
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="p-3.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 leading-relaxed"
            >
              {error}
            </div>
          )}

          {infoMessage && (
            <div
              role="status"
              className="p-3.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700 dark:text-emerald-300 flex items-start gap-2"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{infoMessage}</span>
            </div>
          )}

          <button
            type="button"
            disabled={loading}
            onClick={handleGoogle}
            className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-medium hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors disabled:opacity-60"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27c3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10c5.35 0 9.25-3.67 9.25-9.09c0-1.15-.15-1.81-.15-1.81"
              />
            </svg>
            Continue with Google
          </button>

          <div className="relative flex items-center">
            <div className="flex-grow border-t border-slate-200 dark:border-zinc-800" />
            <span className="px-3 text-xs text-slate-400 dark:text-zinc-500">or with email</span>
            <div className="flex-grow border-t border-slate-200 dark:border-zinc-800" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1.5">
                  Full Name
                </label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Rajeev Singh"
                    required
                    className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1.5">
                Academic Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@university.edu"
                  required
                  className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>

            {mode !== 'reset' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300">
                    Password
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode('reset');
                        setError(null);
                      }}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    required
                    className="w-full pl-9 pr-10 py-2.5 text-sm rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-60"
            >
              {loading
                ? 'Processing...'
                : mode === 'login'
                ? 'Sign In'
                : mode === 'register'
                ? 'Create Account'
                : 'Send Reset Link'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-zinc-400">
            {mode === 'login' ? (
              <>
                <span>New to SKU Campus?</span>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setError(null);
                  }}
                  className="text-blue-600 dark:text-blue-400 font-medium hover:underline"
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                <span>Already registered?</span>
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError(null);
                  }}
                  className="text-blue-600 dark:text-blue-400 font-medium hover:underline"
                >
                  Back to Sign In
                </button>
              </>
            )}
          </div>

          {/* Demo Workspace Preview Section */}
          <div className="pt-4 border-t border-slate-200 dark:border-zinc-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-700 dark:text-zinc-300">
                Sample Demo Workspace
              </span>
              <span className="text-xs text-slate-400 dark:text-zinc-500">
                Pre-loaded sample records
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(['student', 'faculty', 'admin'] as UserRole[]).map((roleOption) => (
                <button
                  key={roleOption}
                  type="button"
                  onClick={() => enterDemoMode(roleOption)}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-blue-600 dark:hover:border-blue-500 text-xs font-medium capitalize transition-colors"
                >
                  <BookOpenCheck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  {roleOption}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
