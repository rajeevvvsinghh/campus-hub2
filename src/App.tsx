import React, { useState } from 'react';
import { Loader2, MailCheck, RefreshCw } from 'lucide-react';
import { CampusProvider, useCampus } from './context/CampusContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthScreen } from './components/AuthScreen';
import { AppShell } from './components/AppShell';
import { DashboardView } from './components/DashboardView';
import { MaterialsLibraryView } from './components/MaterialsLibraryView';
import { AiDoubtSolverView } from './components/AiDoubtSolverView';
import { StudyRoomView } from './components/StudyRoomView';
import { ExamPrepView } from './components/ExamPrepView';
import { AttendanceTrackerView } from './components/AttendanceTrackerView';
import { AttendanceTimelineView } from './components/AttendanceTimelineView';
import {
  AcademicCalendarView,
  AdminConsoleView,
  AnnouncementsView,
  FacultyHubView,
  ProfileSettingsView,
} from './components/SecondaryViews';

const VerificationGate: React.FC = () => {
  const { firebaseUser, resendVerification, refreshVerification, enterDemoMode, logout } = useCampus();
  const [status, setStatus] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const handleRefresh = async () => {
    setChecking(true);
    setStatus(null);
    const verified = await refreshVerification();
    if (!verified) {
      setStatus('Email is still unverified. Click the link in your inbox, then check again.');
    }
    setChecking(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-zinc-950 p-6">
      <div className="max-w-md w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-6 space-y-4">
        <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 flex items-center justify-center">
          <MailCheck className="w-5 h-5" />
        </div>
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
          Verify your email address
        </h2>
        <p className="text-sm text-slate-600 dark:text-zinc-300 leading-relaxed">
          We sent a verification link to <span className="font-medium">{firebaseUser?.email}</span>. Please verify your email to protect your academic records before entering the workspace.
        </p>
        {status && (
          <p className="text-xs text-amber-600 dark:text-amber-400">{status}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={checking}
            onClick={handleRefresh}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
            I’ve Verified — Continue
          </button>
          <button
            type="button"
            onClick={async () => {
              await resendVerification();
              setStatus('Verification email resent.');
            }}
            className="px-4 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 text-xs font-medium"
          >
            Resend Email
          </button>
        </div>
        <div className="pt-3 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={() => enterDemoMode('student')}
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            Explore Sample Workspace
          </button>
          <button
            type="button"
            onClick={logout}
            className="text-slate-500 hover:text-slate-900 dark:hover:text-white"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
};

const MainRouter: React.FC = () => {
  const { authReady, firebaseUser, isDemoMode, isEmailUnverified, activeView } = useCampus();

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-zinc-950">
        <div className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-zinc-300">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          <span>Loading SKU Campus...</span>
        </div>
      </div>
    );
  }

  if (!firebaseUser && !isDemoMode) {
    return <AuthScreen />;
  }

  if (isEmailUnverified && !isDemoMode) {
    return <VerificationGate />;
  }

  const renderView = () => {
    switch (activeView) {
      case 'dashboard':
        return <DashboardView />;
      case 'materials':
        return <MaterialsLibraryView />;
      case 'ai-solver':
        return <AiDoubtSolverView />;
      case 'study-room':
        return <StudyRoomView />;
      case 'exam-prep':
        return <ExamPrepView />;
      case 'attendance':
        return <AttendanceTrackerView />;
      case 'attendance-timeline':
        return <AttendanceTimelineView />;
      case 'calendar':
        return <AcademicCalendarView />;
      case 'announcements':
        return <AnnouncementsView />;
      case 'faculty-hub':
        return <FacultyHubView />;
      case 'admin-console':
        return <AdminConsoleView />;
      case 'profile':
        return <ProfileSettingsView initialTab="profile" />;
      case 'settings':
        return <ProfileSettingsView initialTab="settings" />;
      default:
        return <DashboardView />;
    }
  };

  return <AppShell>{renderView()}</AppShell>;
};

export default function App() {
  return (
    <ErrorBoundary>
      <CampusProvider>
        <MainRouter />
      </CampusProvider>
    </ErrorBoundary>
  );
}
