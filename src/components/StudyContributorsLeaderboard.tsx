import React, { useMemo, useState } from 'react';
import { Award, Clock, FolderGit2, Medal, Trophy } from 'lucide-react';
import type { StudyContributorStat } from '../types/campus';

interface StudyContributorsLeaderboardProps {
  contributors: StudyContributorStat[];
  currentUid: string;
  selectedSubjectId: string;
  selectedSubjectCode?: string;
  selectedSubjectName?: string;
  activeSessionSeconds?: number;
}

type SortMetric = 'points' | 'time' | 'resources';
type LeaderboardScope = 'all' | 'subject';

const TIERS = [
  { name: 'Peer Mentor', minPoints: 500 },
  { name: 'Active Scholar', minPoints: 250 },
  { name: 'Rising Contributor', minPoints: 100 },
  { name: 'Starter', minPoints: 0 },
];

function getTierInfo(points: number) {
  const current = TIERS.find((t) => points >= t.minPoints) || TIERS[TIERS.length - 1];
  const currentIdx = TIERS.indexOf(current);
  const next = currentIdx > 0 ? TIERS[currentIdx - 1] : null;
  if (!next) {
    return { name: current.name, nextName: null, progressPct: 100, pointsToNext: 0 };
  }
  const span = next.minPoints - current.minPoints;
  const gained = points - current.minPoints;
  const progressPct = Math.min(100, Math.max(0, Math.round((gained / span) * 100)));
  return {
    name: current.name,
    nextName: next.name,
    progressPct,
    pointsToNext: Math.max(0, next.minPoints - points),
  };
}

export function formatStudyDuration(totalMinutes: number): string {
  const mins = Math.max(0, Math.floor(totalMinutes));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

export const StudyContributorsLeaderboard: React.FC<StudyContributorsLeaderboardProps> = ({
  contributors,
  currentUid,
  selectedSubjectId,
  selectedSubjectCode,
  selectedSubjectName,
  activeSessionSeconds = 0,
}) => {
  const [scope, setScope] = useState<LeaderboardScope>('all');
  const [sortBy, setSortBy] = useState<SortMetric>('points');

  const ranked = useMemo(() => {
    const filtered =
      scope === 'subject' && selectedSubjectId
        ? contributors.filter((c) => c.primarySubjectId === selectedSubjectId)
        : contributors;

    return [...filtered].sort((a, b) => {
      if (sortBy === 'time') {
        if (b.totalMinutes !== a.totalMinutes) return b.totalMinutes - a.totalMinutes;
      } else if (sortBy === 'resources') {
        if (b.resourcesSharedCount !== a.resourcesSharedCount) {
          return b.resourcesSharedCount - a.resourcesSharedCount;
        }
      }
      if (b.points !== a.points) return b.points - a.points;
      if (b.resourcesSharedCount !== a.resourcesSharedCount) {
        return b.resourcesSharedCount - a.resourcesSharedCount;
      }
      return b.totalMinutes - a.totalMinutes;
    });
  }, [contributors, scope, selectedSubjectId, sortBy]);

  const myRankIndex = ranked.findIndex((c) => c.uid === currentUid);
  const myStat = myRankIndex >= 0 ? ranked[myRankIndex] : contributors.find((c) => c.uid === currentUid) || null;
  const myTier = getTierInfo(myStat?.points || 0);
  const topThree = ranked.slice(0, 3);

  return (
    <div className="cc-card p-5 space-y-5">
      {/* Header & Interactive Filters */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Trophy className="w-4 h-4 text-blue-600" />
            Top Study Contributors
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            2 pts per study minute · 25 pts per resource shared · 10 pts per session joined
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 max-w-full">
          <div className="cc-segmented inline-flex flex-wrap max-w-full">
            <button
              type="button"
              onClick={() => setScope('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                scope === 'all'
                  ? 'bg-white dark:bg-[#0B1018] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              All Campus
            </button>
            <button
              type="button"
              onClick={() => setScope('subject')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                scope === 'subject'
                  ? 'bg-white dark:bg-[#0B1018] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {selectedSubjectCode || 'Subject'} Only
            </button>
          </div>

          <div className="cc-segmented inline-flex flex-wrap max-w-full">
            <button
              type="button"
              onClick={() => setSortBy('points')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                sortBy === 'points'
                  ? 'bg-white dark:bg-[#0B1018] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Points
            </button>
            <button
              type="button"
              onClick={() => setSortBy('time')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                sortBy === 'time'
                  ? 'bg-white dark:bg-[#0B1018] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Time Spent
            </button>
            <button
              type="button"
              onClick={() => setSortBy('resources')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                sortBy === 'resources'
                  ? 'bg-white dark:bg-[#0B1018] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Resources
            </button>
          </div>
        </div>
      </div>

      {/* Your Standing Strip */}
      <div className="cc-inset p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-slate-900 dark:text-white">
              Your Standing: {myRankIndex >= 0 ? `#${myRankIndex + 1} of ${ranked.length}` : 'Unranked yet'}
            </span>
            <span aria-hidden="true" className="text-slate-300 dark:text-white/20">·</span>
            <span className="font-medium text-blue-600 dark:text-blue-400">{myTier.name}</span>
            {activeSessionSeconds > 0 && (
              <>
                <span aria-hidden="true" className="text-slate-300 dark:text-white/20">·</span>
                <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">
                  Current session: {Math.floor(activeSessionSeconds / 60)}m {activeSessionSeconds % 60}s
                </span>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            <span>{myStat?.points || 0} pts</span>
            <span aria-hidden="true">·</span>
            <span>{formatStudyDuration(myStat?.totalMinutes || 0)} studied</span>
            <span aria-hidden="true">·</span>
            <span>{myStat?.resourcesSharedCount || 0} resources shared</span>
            <span aria-hidden="true">·</span>
            <span>{myStat?.sessionsJoined || 0} sessions</span>
          </div>
        </div>

        <div className="w-full md:w-56 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>{myTier.nextName ? `Next: ${myTier.nextName}` : 'Top Tier Reached'}</span>
            <span className="tabular-nums font-medium">
              {myTier.nextName ? `${myTier.pointsToNext} pts left` : '100%'}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-200 dark:bg-white/[0.08] overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all duration-300"
              style={{ width: `${myTier.progressPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Empty state or Ranked Leaderboard */}
      {ranked.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 dark:border-white/[0.1] p-6 text-center space-y-1.5">
          <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
            {scope === 'subject'
              ? `No contributors logged for ${selectedSubjectName || 'this subject'} yet.`
              : 'No study contributions recorded yet.'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Join a Study Room to log active study minutes and share notes or links with peers to claim #1.
          </p>
        </div>
      ) : (
        <>
          {/* Top 3 Podium Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {topThree.map((entry, idx) => {
              const isMe = entry.uid === currentUid;
              const tier = getTierInfo(entry.points);
              const RankIcon = idx === 0 ? Trophy : idx === 1 ? Award : Medal;
              const iconColor =
                idx === 0
                  ? 'text-amber-500'
                  : idx === 1
                    ? 'text-slate-500 dark:text-slate-300'
                    : 'text-amber-700 dark:text-amber-500';

              return (
                <div
                  key={entry.uid}
                  className={`p-4 rounded-xl border flex flex-col justify-between gap-3 transition-colors ${
                    isMe
                      ? 'border-blue-300 dark:border-blue-500/40 bg-blue-50/50 dark:bg-blue-950/20'
                      : 'cc-inset'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <RankIcon className={`w-3.5 h-3.5 shrink-0 ${iconColor}`} />
                        <span className="font-semibold tabular-nums text-slate-900 dark:text-white">
                          #{idx + 1}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">{tier.name}</span>
                      </div>
                      <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-white truncate mt-1">
                        {entry.displayName} {isMe ? '(You)' : ''}
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {entry.primarySubjectCode || 'GEN'} · {entry.primarySubjectName || 'General Study'}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-display text-base font-semibold tabular-nums text-blue-600 dark:text-blue-400">
                        {entry.points}
                      </span>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">pts</p>
                    </div>
                  </div>

                  <div className="pt-2.5 border-t border-slate-200/70 dark:border-white/[0.06] flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300 tabular-nums">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      {formatStudyDuration(entry.totalMinutes)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <FolderGit2 className="w-3 h-3 text-slate-400" />
                      {entry.resourcesSharedCount} shared
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Full Ranked Standings Table */}
          <div className="overflow-x-auto border border-slate-200/80 dark:border-white/[0.08] rounded-xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200/80 dark:border-white/[0.08] bg-slate-50/80 dark:bg-[#0B1018] text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-3.5">Rank</th>
                  <th className="py-2.5 px-3.5">Contributor</th>
                  <th className="py-2.5 px-3.5">Focus Subject</th>
                  <th className="py-2.5 px-3.5 text-right">Time Spent</th>
                  <th className="py-2.5 px-3.5 text-right">Resources Shared</th>
                  <th className="py-2.5 px-3.5 text-right">Sessions</th>
                  <th className="py-2.5 px-3.5 text-right">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06] text-xs">
                {ranked.map((row, idx) => {
                  const isMe = row.uid === currentUid;
                  const tier = getTierInfo(row.points);
                  return (
                    <tr
                      key={row.uid}
                      className={
                        isMe
                          ? 'bg-blue-50/50 dark:bg-blue-950/20 font-medium'
                          : 'hover:bg-slate-50/80 dark:hover:bg-white/[0.03] transition-colors'
                      }
                    >
                      <td className="py-2.5 px-3.5 tabular-nums font-semibold text-slate-900 dark:text-white">
                        #{idx + 1}
                      </td>
                      <td className="py-2.5 px-3.5">
                        <div className="text-slate-900 dark:text-white font-medium">
                          {row.displayName} {isMe ? '(You)' : ''}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">{tier.name}</div>
                      </td>
                      <td className="py-2.5 px-3.5 text-slate-600 dark:text-slate-300">
                        {row.primarySubjectCode ? `${row.primarySubjectCode} · ${row.primarySubjectName}` : 'General'}
                      </td>
                      <td className="py-2.5 px-3.5 text-right tabular-nums text-slate-700 dark:text-slate-200">
                        {formatStudyDuration(row.totalMinutes)}
                      </td>
                      <td className="py-2.5 px-3.5 text-right tabular-nums text-slate-700 dark:text-slate-200">
                        {row.resourcesSharedCount}
                      </td>
                      <td className="py-2.5 px-3.5 text-right tabular-nums text-slate-700 dark:text-slate-200">
                        {row.sessionsJoined}
                      </td>
                      <td className="py-2.5 px-3.5 text-right tabular-nums font-semibold text-blue-600 dark:text-blue-400">
                        {row.points}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};
