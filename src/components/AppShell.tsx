import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  BookOpen,
  Bot,
  CalendarDays,
  Check,
  CheckSquare,
  ChevronRight,
  ClipboardCheck,
  Clock,
  GraduationCap,
  History,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  Moon,
  Presentation,
  Search,
  Settings,
  Shield,
  Sun,
  User as UserIcon,
  Users,
  X,
} from 'lucide-react';
import { useCampus, type NotificationKind } from '../context/CampusContext';
import type { ActiveView, UserRole } from '../types/campus';

const VIEW_TITLES: Record<ActiveView, string> = {
  dashboard: 'Dashboard',
  materials: 'Study Material Library',
  'ai-solver': 'AI Doubt Solver',
  'study-room': 'Virtual Study Rooms',
  'exam-prep': 'Smart Exam Preparation',
  attendance: 'Smart Attendance Tracker',
  'attendance-timeline': 'Attendance Timeline',
  calendar: 'Academic Calendar',
  announcements: 'Announcements',
  'faculty-hub': 'Faculty Workspace',
  'admin-console': 'Administration Console',
  profile: 'Student Profile & Saved',
  settings: 'Settings',
};

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    profile,
    activeRoleView,
    setActiveRoleView,
    isDemoMode,
    activeView,
    setActiveView,
    theme,
    toggleTheme,
    colorPalette,
    setColorPalette,
    globalSearchQuery,
    setGlobalSearchQuery,
    materials,
    exams,
    announcements,
    subjects,
    notifications,
    readNotificationIds,
    liveAlerts,
    markNotificationRead,
    markAllNotificationsRead,
    dismissLiveAlert,
    logout,
    platformSettings,
  } = useCampus();

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifFilter, setNotifFilter] = useState<'all' | NotificationKind>('all');
  const [searchFocused, setSearchFocused] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const notifContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setAvatarFailed(false);
  }, [profile?.avatarUrl]);

  const unreadCount = notifications.filter((n) => !readNotificationIds.includes(n.id)).length;
  const filteredNotifications = useMemo(
    () => (notifFilter === 'all' ? notifications : notifications.filter((n) => n.kind === notifFilter)),
    [notifications, notifFilter]
  );

  useEffect(() => {
    if (!notifOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (notifContainerRef.current && !notifContainerRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNotifOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [notifOpen]);

  const navGroups: Array<{
    heading: string;
    items: Array<{
      id: ActiveView;
      label: string;
      icon: React.FC<{ className?: string }>;
      roles: UserRole[];
    }>;
  }> = [
    {
      heading: 'Workspace',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['student', 'faculty', 'admin'] },
        { id: 'materials', label: 'Study Library', icon: BookOpen, roles: ['student', 'faculty', 'admin'] },
        { id: 'ai-solver', label: 'AI Doubt Solver', icon: Bot, roles: ['student', 'faculty', 'admin'] },
        { id: 'study-room', label: 'Study Rooms', icon: Presentation, roles: ['student', 'faculty', 'admin'] },
      ],
    },
    {
      heading: 'Academics & Tracking',
      items: [
        { id: 'exam-prep', label: 'Exam Prep', icon: CheckSquare, roles: ['student', 'faculty', 'admin'] },
        { id: 'attendance', label: 'Attendance', icon: ClipboardCheck, roles: ['student', 'faculty', 'admin'] },
        { id: 'attendance-timeline', label: 'Attendance Timeline', icon: History, roles: ['student', 'faculty', 'admin'] },
        { id: 'calendar', label: 'Calendar', icon: CalendarDays, roles: ['student', 'faculty', 'admin'] },
        { id: 'announcements', label: 'Announcements', icon: Megaphone, roles: ['student', 'faculty', 'admin'] },
      ],
    },
    {
      heading: 'Administration',
      items: [
        { id: 'faculty-hub', label: 'Faculty Hub', icon: Users, roles: ['faculty', 'admin'] },
        { id: 'admin-console', label: 'Admin Console', icon: Shield, roles: ['faculty', 'admin'] },
      ],
    },
  ];

  const searchResults = useMemo(() => {
    const q = globalSearchQuery.trim().toLowerCase();
    if (!q) return [];
    const results: Array<{ id: string; title: string; subtitle: string; view: ActiveView }> = [];
    materials
      .filter((m) => m.title.toLowerCase().includes(q) || m.subjectName.toLowerCase().includes(q))
      .slice(0, 4)
      .forEach((m) =>
        results.push({
          id: `sr_mat_${m.id}`,
          title: m.title,
          subtitle: `${m.type === 'books' ? 'Book' : m.type === 'syllabus' ? 'Syllabus' : 'Material'} · ${m.subjectName}`,
          view: 'materials',
        })
      );
    subjects
      .filter((s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q))
      .slice(0, 3)
      .forEach((s) =>
        results.push({
          id: `sr_sub_${s.id}`,
          title: `${s.code} · ${s.name}`,
          subtitle: `Subject · Semester ${s.semester}`,
          view: 'exam-prep',
        })
      );
    exams
      .filter((e) => e.subjectName.toLowerCase().includes(q) || e.subjectCode.toLowerCase().includes(q))
      .slice(0, 2)
      .forEach((e) =>
        results.push({
          id: `sr_ex_${e.id}`,
          title: `${e.subjectName} (${e.examType})`,
          subtitle: `Exam · ${e.examDate}`,
          view: 'exam-prep',
        })
      );
    announcements
      .filter((a) => a.title.toLowerCase().includes(q))
      .slice(0, 2)
      .forEach((a) =>
        results.push({
          id: `sr_ann_${a.id}`,
          title: a.title,
          subtitle: `Announcement · ${a.category}`,
          view: 'announcements',
        })
      );
    return results;
  }, [globalSearchQuery, materials, subjects, exams, announcements]);

  const handleNavClick = (view: ActiveView) => {
    setActiveView(view);
    setMobileNavOpen(false);
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-white dark:bg-[#0B0E16] border-r border-slate-200/80 dark:border-white/[0.08]">
      <div className="px-5 h-16 flex items-center gap-3 border-b border-slate-200/80 dark:border-white/[0.08] shrink-0">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-xs transition-colors"
          style={{ backgroundColor: 'var(--cc-accent)', color: 'var(--cc-accent-fg)' }}
        >
          <GraduationCap className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <span className="font-display font-semibold text-base tracking-tight text-slate-900 dark:text-white whitespace-nowrap block leading-tight">
            SKU Campus
          </span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate">
            Smart Student Hub
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3.5 py-5 space-y-6">
        <nav aria-label="Primary navigation" className="space-y-5">
          {navGroups.map((group) => {
            const visibleItems = group.items.filter((item) => item.roles.includes(activeRoleView));
            if (visibleItems.length === 0) return null;
            return (
              <div key={group.heading} className="space-y-1">
                <p className="px-3 pb-1 text-[11px] font-medium text-slate-400 dark:text-slate-500">
                  {group.heading}
                </p>
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const active = activeView === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleNavClick(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] font-medium transition-all whitespace-nowrap ${
                        active
                          ? 'bg-[var(--cc-accent-light)] text-slate-950 dark:text-white font-semibold border border-[var(--cc-accent-subtle)] shadow-2xs'
                          : 'text-slate-600 dark:text-slate-400 border border-transparent hover:bg-slate-100/90 dark:hover:bg-white/[0.05] hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 shrink-0 transition-colors ${
                          active ? 'text-[var(--cc-accent)]' : 'opacity-75'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {(isDemoMode || profile?.role === 'admin') && (
          <div className="pt-4 border-t border-slate-200/80 dark:border-white/[0.08] px-1 space-y-2">
            <p className="px-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {isDemoMode ? 'Sample Role View' : 'Admin Role Preview'}
            </p>
            <div className="grid grid-cols-3 gap-1 cc-segmented">
              {(['student', 'faculty', 'admin'] as UserRole[]).map((roleOpt) => (
                <button
                  key={roleOpt}
                  type="button"
                  onClick={() => {
                    setActiveRoleView(roleOpt);
                    if (roleOpt === 'student' && (activeView === 'faculty-hub' || activeView === 'admin-console')) {
                      setActiveView('dashboard');
                    }
                  }}
                  className={`py-1.5 px-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
                    activeRoleView === roleOpt
                      ? 'bg-white dark:bg-[#0E121B] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {roleOpt}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="p-3.5 border-t border-slate-200/80 dark:border-white/[0.08] space-y-1 shrink-0">
        <button
          type="button"
          onClick={() => handleNavClick('profile')}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13.5px] font-medium transition-colors ${
            activeView === 'profile'
              ? 'bg-slate-100 dark:bg-white/[0.07] text-slate-900 dark:text-white'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-white/[0.05]'
          }`}
        >
          <UserIcon className="w-4 h-4 shrink-0" />
          <span className="truncate">Profile & Saved</span>
        </button>
        <button
          type="button"
          onClick={() => handleNavClick('settings')}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13.5px] font-medium transition-colors ${
            activeView === 'settings'
              ? 'bg-slate-100 dark:bg-white/[0.07] text-slate-900 dark:text-white'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-white/[0.05]'
          }`}
        >
          <Settings className="w-4 h-4 shrink-0" />
          <span className="truncate">Settings</span>
        </button>
        <button
          type="button"
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13.5px] font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>{isDemoMode ? 'Exit Demo' : 'Sign Out'}</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[var(--cc-bg)] text-[#0B1120] dark:text-[#F1F5F9]">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-[264px] shrink-0 sticky top-0 h-screen">
        <SidebarContent />
      </aside>

      {/* Mobile Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 cc-modal-backdrop"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <div className="relative w-72 max-w-[85vw] h-full z-10">
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close navigation menu"
              className="absolute right-3 top-4 p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.08] z-20"
            >
              <X className="w-4 h-4" />
            </button>
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0 overflow-x-clip">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 h-16 bg-white/85 dark:bg-[#0B0E16]/85 backdrop-blur-md border-b border-slate-200/80 dark:border-white/[0.08] px-3 sm:px-6 lg:px-8 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 rounded-xl border border-slate-200 dark:border-white/[0.1] text-slate-700 dark:text-slate-300 shrink-0"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="hidden sm:inline text-slate-400 dark:text-slate-500 truncate max-w-[210px]">
                {platformSettings.institutionName}
              </span>
              <ChevronRight className="hidden sm:inline w-3.5 h-3.5 text-slate-400 shrink-0" />
              <h1 className="font-display font-semibold text-sm sm:text-base text-slate-900 dark:text-white truncate">
                {VIEW_TITLES[activeView]}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {/* Global Search */}
            <div className="relative hidden md:block w-64 lg:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={globalSearchQuery}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 180)}
                onChange={(e) => setGlobalSearchQuery(e.target.value)}
                placeholder="Search notes, books, syllabus..."
                aria-label="Global academic search"
                className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm cc-input"
              />
              {searchFocused && globalSearchQuery.trim() && (
                <div className="absolute left-0 right-0 mt-2 cc-modal rounded-xl overflow-hidden z-40">
                  {searchResults.length === 0 ? (
                    <div className="p-3.5 text-xs text-slate-500 dark:text-slate-400">
                      No matching study materials, books, subjects, or exams.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                      {searchResults.map((res) => (
                        <button
                          key={res.id}
                          type="button"
                          onMouseDown={() => {
                            setActiveView(res.view);
                            setSearchFocused(false);
                          }}
                          className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-colors"
                        >
                          <p className="text-xs font-medium text-slate-900 dark:text-white truncate">
                            {res.title}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            {res.subtitle}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Smart Theme Engine Global Palette Toggle */}
            <div
              className="hidden sm:flex items-center gap-1.5 cc-segmented px-2.5 py-1.5"
              title="Theme Palette: Blue, Emerald, Violet, or Slate"
            >
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 hidden lg:inline mr-1">
                Theme
              </span>
              {(
                [
                  { id: 'blue', label: 'Sapphire Blue', color: '#2563EB' },
                  { id: 'emerald', label: 'Botanical Emerald', color: '#059669' },
                  { id: 'violet', label: 'Royal Violet', color: '#7C3AED' },
                  { id: 'slate', label: 'Obsidian Slate', color: '#475569' },
                ] as const
              ).map((p) => {
                const isSelected = colorPalette === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setColorPalette(p.id)}
                    aria-label={`Select ${p.label} theme palette`}
                    title={p.label}
                    className={`relative w-4 h-4 sm:w-4.5 sm:h-4.5 rounded-full flex items-center justify-center transition-all ${
                      isSelected
                        ? 'scale-110 ring-2 ring-[var(--cc-accent)] ring-offset-2 ring-offset-white dark:ring-offset-[#0D111A]'
                        : 'opacity-70 hover:opacity-100 hover:scale-105'
                    }`}
                    style={{ backgroundColor: p.color }}
                  >
                    {isSelected && (
                      <span className="w-1.5 h-1.5 rounded-full bg-white shadow-xs" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Theme Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle light and dark theme"
              className="p-2 rounded-xl border border-slate-200/90 dark:border-white/[0.1] bg-white dark:bg-[#0E121B] hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Notification Center */}
            <div className="relative" ref={notifContainerRef}>
              <button
                type="button"
                onClick={() => setNotifOpen((prev) => !prev)}
                aria-label="Notifications"
                aria-expanded={notifOpen}
                className="relative p-2 rounded-xl border border-slate-200/90 dark:border-white/[0.1] bg-white dark:bg-[#0E121B] hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span
                    className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-mono font-semibold tabular-nums flex items-center justify-center"
                    style={{ backgroundColor: 'var(--cc-accent)', color: 'var(--cc-accent-fg)' }}
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="fixed left-3 right-3 top-[68px] sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[400px] cc-modal rounded-xl z-40 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200/80 dark:border-white/[0.08] flex items-center justify-between gap-2">
                    <div>
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">
                        Notifications
                      </span>
                      <span className="ml-2 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
                      </span>
                    </div>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={markAllNotificationsRead}
                        className="inline-flex items-center gap-1 text-xs font-medium text-[var(--cc-accent)] hover:underline"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Mark all read
                      </button>
                    )}
                  </div>

                  {/* Category Filter Tabs */}
                  <div className="px-3 py-2 border-b border-slate-200/70 dark:border-white/[0.06] flex items-center gap-1 overflow-x-auto bg-slate-50/70 dark:bg-white/[0.02]">
                    {(
                      [
                        { id: 'all', label: 'All' },
                        { id: 'announcement', label: 'Announcements' },
                        { id: 'deadline', label: 'Deadlines' },
                        { id: 'attendance', label: 'Attendance' },
                      ] as const
                    ).map((tab) => {
                      const active = notifFilter === tab.id;
                      const tabCount =
                        tab.id === 'all'
                          ? notifications.filter((n) => !readNotificationIds.includes(n.id)).length
                          : notifications.filter(
                              (n) => n.kind === tab.id && !readNotificationIds.includes(n.id)
                            ).length;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setNotifFilter(tab.id)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors ${
                            active
                              ? 'bg-white dark:bg-[#0E121B] text-slate-900 dark:text-white shadow-xs border border-slate-200/90 dark:border-white/[0.12]'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          {tab.label}
                          {tabCount > 0 && (
                            <span className="ml-1 font-mono tabular-nums text-[10px] text-[var(--cc-accent)]">
                              {tabCount}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-white/[0.06]">
                    {filteredNotifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                        No active alerts in this category.
                      </div>
                    ) : (
                      filteredNotifications.map((n) => {
                        const isRead = readNotificationIds.includes(n.id);
                        const KindIcon =
                          n.kind === 'announcement'
                            ? Megaphone
                            : n.kind === 'deadline'
                            ? Clock
                            : AlertTriangle;
                        return (
                          <div
                            key={n.id}
                            className={`px-4 py-3 transition-colors ${
                              isRead
                                ? 'hover:bg-slate-50 dark:hover:bg-white/[0.04]'
                                : 'bg-[var(--cc-accent-light)]/65 hover:bg-[var(--cc-accent-light)]'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                markNotificationRead(n.id);
                                setActiveView(n.targetView);
                                setNotifOpen(false);
                              }}
                              className="w-full text-left flex items-start gap-2.5"
                            >
                              <div
                                className={`mt-0.5 w-7 h-7 rounded-lg shrink-0 flex items-center justify-center ${
                                  n.severity === 'urgent'
                                    ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                                    : n.severity === 'warning'
                                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                    : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                }`}
                              >
                                <KindIcon className="w-3.5 h-3.5" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <span
                                    className={`text-xs leading-snug ${
                                      isRead
                                        ? 'font-medium text-slate-700 dark:text-slate-300'
                                        : 'font-semibold text-slate-900 dark:text-white'
                                    }`}
                                  >
                                    {n.title}
                                  </span>
                                  <span
                                    className={`text-[11px] font-medium shrink-0 capitalize ${
                                      n.severity === 'urgent'
                                        ? 'text-red-600 dark:text-red-400'
                                        : n.severity === 'warning'
                                        ? 'text-amber-600 dark:text-amber-400'
                                        : 'text-blue-600 dark:text-blue-400'
                                    }`}
                                  >
                                    {n.severity}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                                  {n.detail}
                                </p>
                                <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                                  <span className="truncate">{n.meta}</span>
                                  {!isRead && (
                                    <span className="font-semibold text-[var(--cc-accent)] shrink-0">
                                      Unread
                                    </span>
                                  )}
                                </div>
                              </div>
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Profile Trigger */}
            <button
              type="button"
              onClick={() => setActiveView('profile')}
              className="flex items-center gap-2.5 pl-1.5 pr-3 py-1 rounded-xl border border-slate-200/90 dark:border-white/[0.1] bg-white dark:bg-[#0E121B] hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
            >
              {!avatarFailed && profile?.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt={profile?.displayName || 'Rajeev Singh'}
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarFailed(true)}
                  className="w-7 h-7 rounded-lg object-cover"
                />
              ) : (
                <div
                  className="w-7 h-7 rounded-lg text-xs font-semibold flex items-center justify-center"
                  style={{ backgroundColor: 'var(--cc-accent)', color: 'var(--cc-accent-fg)' }}
                >
                  {(profile?.displayName || 'R').slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="hidden sm:block text-left leading-tight">
                <p className="text-xs font-medium text-slate-900 dark:text-white max-w-[120px] truncate">
                  {profile?.displayName || 'Rajeev Singh'}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 capitalize">
                  {activeRoleView}
                </p>
              </div>
            </button>
          </div>
        </header>

        {/* Demo Mode / Sample Data Distinction Banner */}
        {isDemoMode && (
          <div className="bg-[var(--cc-accent-light)] border-b border-[var(--cc-accent-subtle)] px-4 sm:px-6 lg:px-8 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <p className="text-slate-800 dark:text-slate-200">
              <span className="font-semibold">Sample Demo Workspace:</span> Viewing pre-loaded sample college records locally. Sign in with Google or email to persist your personal cloud records.
            </p>
            <button
              type="button"
              onClick={logout}
              className="font-semibold text-[var(--cc-accent)] hover:underline whitespace-nowrap"
            >
              Sign in to Real Account
            </button>
          </div>
        )}

        {/* Viewport Content */}
        <main className="flex-1 p-3.5 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto min-w-0">
          {children}
        </main>
      </div>

      {/* Live In-App Faculty Announcement & Deadline Alert Stack */}
      {liveAlerts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed bottom-4 right-4 left-4 sm:left-auto sm:w-96 z-50 space-y-2.5 pointer-events-none"
        >
          {liveAlerts.slice(0, 2).map((alert) => {
            const AlertIcon = alert.kind === 'announcement' ? Megaphone : Clock;
            return (
              <div
                key={alert.id}
                role="status"
                className="pointer-events-auto cc-modal rounded-xl p-3.5 shadow-lg border border-slate-200/90 dark:border-white/[0.12] flex items-start gap-3"
              >
                <div
                  className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center ${
                    alert.severity === 'urgent'
                      ? 'bg-red-500/12 text-red-600 dark:text-red-400'
                      : alert.severity === 'warning'
                      ? 'bg-amber-500/12 text-amber-600 dark:text-amber-400'
                      : 'bg-[var(--cc-accent-light)] text-[var(--cc-accent)]'
                  }`}
                >
                  <AlertIcon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--cc-accent)]">
                    {alert.kind === 'announcement'
                      ? 'New Faculty Announcement'
                      : 'New Deadline Alert'}
                  </p>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white mt-0.5 truncate">
                    {alert.title}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-2">
                    {alert.detail}
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {alert.meta}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        markNotificationRead(alert.id);
                        setActiveView(alert.targetView);
                      }}
                      className="text-xs font-semibold text-[var(--cc-accent)] hover:underline shrink-0"
                    >
                      Open
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => dismissLiveAlert(alert.id)}
                  aria-label="Dismiss notification alert"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
