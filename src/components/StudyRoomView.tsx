import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Clock,
  ExternalLink,
  FileText,
  Link2,
  MessageSquare,
  Paperclip,
  Pause,
  Play,
  Plus,
  Presentation,
  Radio,
  RotateCcw,
  Send,
  Trash2,
  Trophy,
  UserCheck,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useCampus } from '../context/CampusContext';
import { SAMPLE_ROOM_RESOURCES } from '../data/sampleData';
import {
  subscribeRoomParticipants,
  subscribeRoomResources,
  subscribeRoomStrokes,
} from '../services/campusService';
import type {
  RoomResourceType,
  RoomTimerState,
  StudyPresence,
  StudyRoom,
  StudyRoomChatMessage,
  StudyRoomParticipant,
  StudyRoomResource,
  WhiteboardStroke,
} from '../types/campus';
import { SharedWhiteboard, type RemoteCursor } from './SharedWhiteboard';
import { StudyContributorsLeaderboard } from './StudyContributorsLeaderboard';

interface WsPeerMeta {
  clientId?: string;
  uid: string;
  displayName: string;
  roomId: string | null;
  roomTitle: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  studyFocus: string;
  colorHex: string;
  status: 'studying' | 'break' | 'away';
}

const PEER_COLORS = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#be185d'];

function colorForUid(uid: string): string {
  let hash = 0;
  for (let i = 0; i < uid.length; i += 1) {
    hash = (hash * 31 + uid.charCodeAt(i)) >>> 0;
  }
  return PEER_COLORS[hash % PEER_COLORS.length];
}

function formatSeconds(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const StudyRoomView: React.FC = () => {
  const {
    profile,
    activeRoleView,
    isDemoMode,
    theme,
    subjects,
    materials,
    studyRooms,
    studyPresenceList,
    studyContributors,
    createStudyRoomItem,
    removeStudyRoomItem,
    publishMyStudyPresence,
    joinStudyRoomInFirestore,
    leaveStudyRoomInFirestore,
    persistRoomStroke,
    removeRoomStroke,
    clearRoomStrokesInFirestore,
    recordStudyContribution,
    persistRoomResource,
    removeRoomResource,
    openAiWithMaterial,
    setActiveView,
  } = useCampus();

  const myUid = profile?.uid || 'guest_student';
  const myName = profile?.displayName || 'Student';
  const myColor = useMemo(() => colorForUid(myUid), [myUid]);

  // Subject presence broadcaster state
  const defaultSubject = subjects[0];
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(defaultSubject?.id || '');
  const [studyGoal, setStudyGoal] = useState<string>('Revising key syllabus concepts');
  const [myStatus, setMyStatus] = useState<'studying' | 'break'>('studying');
  const [peerScope, setPeerScope] = useState<'same-subject' | 'all'>('same-subject');
  const [roomSubjectFilter, setRoomSubjectFilter] = useState<string>('all');

  // Create room modal/panel state
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [newRoomTitle, setNewRoomTitle] = useState('');
  const [newRoomTopic, setNewRoomTopic] = useState('');
  const [newRoomSubjectId, setNewRoomSubjectId] = useState(defaultSubject?.id || '');
  const [creatingRoom, setCreatingRoom] = useState(false);

  // Active room state
  const [activeRoom, setActiveRoom] = useState<StudyRoom | null>(null);
  const activeRoomRef = useRef<StudyRoom | null>(null);
  activeRoomRef.current = activeRoom;

  // WebSocket & realtime room state
  const wsRef = useRef<WebSocket | null>(null);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'reconnecting'>('connecting');
  const [campusWsPeers, setCampusWsPeers] = useState<WsPeerMeta[]>([]);
  const [roomWsPeers, setRoomWsPeers] = useState<WsPeerMeta[]>([]);
  const [firestorePeers, setFirestorePeers] = useState<StudyRoomParticipant[]>([]);
  const [strokes, setStrokes] = useState<WhiteboardStroke[]>([]);
  const strokesRef = useRef<WhiteboardStroke[]>([]);
  strokesRef.current = strokes;

  const [messages, setMessages] = useState<StudyRoomChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  // Room Shared Resources & Active Panel Tab
  const [sidebarTab, setSidebarTab] = useState<'chat' | 'resources'>('chat');
  const [roomResources, setRoomResources] = useState<StudyRoomResource[]>([]);
  const [showShareForm, setShowShareForm] = useState(false);
  const [resType, setResType] = useState<RoomResourceType>('library-note');
  const [resMaterialId, setResMaterialId] = useState<string>('');
  const [resTitle, setResTitle] = useState('');
  const [resUrl, setResUrl] = useState('');
  const [resNote, setResNote] = useState('');
  const [sharingResource, setSharingResource] = useState(false);

  // Real-time study duration tracker for leaderboard gamification
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [showRoomLeaderboard, setShowRoomLeaderboard] = useState(false);
  const loggedSessionMinutesRef = useRef(0);
  const joinedRoomsThisMountRef = useRef<Set<string>>(new Set());

  const [remoteCursors, setRemoteCursors] = useState<RemoteCursor[]>([]);
  const [timer, setTimer] = useState<RoomTimerState>({
    running: false,
    mode: 'focus',
    remainingSec: 25 * 60,
    updatedAtMs: Date.now(),
  });
  const [displaySeconds, setDisplaySeconds] = useState<number>(25 * 60);

  useEffect(() => {
    if (!selectedSubjectId && subjects.length > 0) {
      setSelectedSubjectId(subjects[0].id);
    }
    if (!newRoomSubjectId && subjects.length > 0) {
      setNewRoomSubjectId(subjects[0].id);
    }
  }, [subjects, selectedSubjectId, newRoomSubjectId]);

  const currentSubject = useMemo(
    () => subjects.find((s) => s.id === selectedSubjectId) || subjects[0] || null,
    [subjects, selectedSubjectId]
  );

  const sendWs = useCallback((payload: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }, []);

  // Announce current subject study status to WS + Firestore/Context
  const broadcastPresence = useCallback(
    (roomOverride?: StudyRoom | null) => {
      const targetRoom = roomOverride !== undefined ? roomOverride : activeRoomRef.current;
      const sub = subjects.find((s) => s.id === selectedSubjectId) || subjects[0];
      if (!sub) return;

      sendWs({
        type: 'presence:announce',
        uid: myUid,
        displayName: myName,
        subjectId: sub.id,
        subjectCode: sub.code,
        subjectName: sub.name,
        studyFocus: studyGoal.trim() || 'Focused study session',
        colorHex: myColor,
        status: myStatus,
      });

      void publishMyStudyPresence({
        subjectId: sub.id,
        subjectCode: sub.code,
        subjectName: sub.name,
        roomId: targetRoom?.id || '',
        roomTitle: targetRoom?.title || '',
        studyGoal: studyGoal.trim() || 'Focused study session',
        isActive: true,
      });
    },
    [subjects, selectedSubjectId, sendWs, myUid, myName, studyGoal, myColor, myStatus, publishMyStudyPresence]
  );

  // Maintain live WebSocket connection to /ws/study-room
  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: number | null = null;

    const connect = () => {
      if (cancelled) return;
      setWsStatus((prev) => (prev === 'connected' ? 'connected' : 'connecting'));
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//${window.location.host}/ws/study-room`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        setWsStatus('connected');
        const sub = subjects.find((s) => s.id === selectedSubjectId) || subjects[0];
        if (sub) {
          ws.send(
            JSON.stringify({
              type: 'presence:announce',
              uid: myUid,
              displayName: myName,
              subjectId: sub.id,
              subjectCode: sub.code,
              subjectName: sub.name,
              studyFocus: studyGoal.trim() || 'Focused study session',
              colorHex: myColor,
              status: myStatus,
            })
          );
        }
        if (activeRoomRef.current) {
          const r = activeRoomRef.current;
          ws.send(
            JSON.stringify({
              type: 'room:join',
              roomId: r.id,
              roomTitle: r.title,
              uid: myUid,
              displayName: myName,
              subjectId: sub?.id || r.subjectId,
              subjectCode: sub?.code || r.subjectCode,
              subjectName: sub?.name || r.subjectName,
              studyFocus: studyGoal.trim() || r.topic,
              colorHex: myColor,
              status: myStatus,
              initialStrokes: strokesRef.current,
            })
          );
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as Record<string, unknown>;
          const type = String(msg.type || '');

          if (type === 'campus:presence' && Array.isArray(msg.peers)) {
            setCampusWsPeers(msg.peers as WsPeerMeta[]);
            return;
          }

          const currentRoom = activeRoomRef.current;
          if (!currentRoom || (msg.roomId && msg.roomId !== currentRoom.id)) {
            return;
          }

          if (type === 'room:init') {
            const initStrokes = Array.isArray(msg.strokes) ? (msg.strokes as WhiteboardStroke[]) : [];
            setStrokes((prev) => {
              const merged = [...prev];
              for (const s of initStrokes) {
                if (!merged.some((ex) => ex.id === s.id)) {
                  merged.push(s);
                }
              }
              return merged;
            });
            if (Array.isArray(msg.messages)) {
              setMessages(msg.messages as StudyRoomChatMessage[]);
            }
            if (Array.isArray(msg.resources)) {
              const initRes = msg.resources as StudyRoomResource[];
              setRoomResources((prev) => {
                const merged = [...prev];
                for (const r of initRes) {
                  if (!merged.some((ex) => ex.id === r.id)) {
                    merged.push(r);
                  }
                }
                return merged;
              });
            }
            if (msg.timer && typeof msg.timer === 'object') {
              const t = msg.timer as RoomTimerState;
              setTimer({ ...t, updatedAtMs: Date.now() });
            }
            if (Array.isArray(msg.peers)) {
              setRoomWsPeers(msg.peers as WsPeerMeta[]);
            }
            return;
          }

          if (type === 'room:presence' && Array.isArray(msg.peers)) {
            setRoomWsPeers(msg.peers as WsPeerMeta[]);
            return;
          }

          if (type === 'stroke:added' && msg.stroke) {
            const incoming = msg.stroke as WhiteboardStroke;
            setStrokes((prev) => (prev.some((s) => s.id === incoming.id) ? prev : [...prev, incoming]));
            return;
          }

          if (type === 'stroke:deleted' && typeof msg.strokeId === 'string') {
            setStrokes((prev) => prev.filter((s) => s.id !== msg.strokeId));
            return;
          }

          if (type === 'board:cleared') {
            setStrokes([]);
            return;
          }

          if (type === 'cursor:moved' && typeof msg.uid === 'string') {
            const uid = msg.uid;
            if (uid === myUid) return;
            const nextCursor: RemoteCursor = {
              uid,
              displayName: String(msg.displayName || 'Peer'),
              colorHex: String(msg.colorHex || '#2563eb'),
              x: Number(msg.x) || 0,
              y: Number(msg.y) || 0,
              updatedAt: Date.now(),
            };
            setRemoteCursors((prev) => {
              const filtered = prev.filter((c) => c.uid !== uid);
              return [...filtered, nextCursor];
            });
            return;
          }

          if (type === 'chat:message' && msg.message) {
            const chatMsg = msg.message as StudyRoomChatMessage;
            setMessages((prev) => (prev.some((m) => m.id === chatMsg.id) ? prev : [...prev, chatMsg]));
            return;
          }

          if (type === 'resource:shared' && msg.resource) {
            const incomingRes = msg.resource as StudyRoomResource;
            setRoomResources((prev) => (prev.some((r) => r.id === incomingRes.id) ? prev : [incomingRes, ...prev]));
            return;
          }

          if (type === 'resource:deleted' && typeof msg.resourceId === 'string') {
            setRoomResources((prev) => prev.filter((r) => r.id !== msg.resourceId));
            return;
          }

          if (type === 'timer:state' && msg.timer) {
            const t = msg.timer as RoomTimerState;
            setTimer({ ...t, updatedAtMs: Date.now() });
          }
        } catch {
          // ignore invalid ws frames
        }
      };

      ws.onclose = () => {
        if (cancelled) return;
        setWsStatus('reconnecting');
        reconnectTimer = window.setTimeout(connect, 2000);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (activeRoomRef.current) {
        void leaveStudyRoomInFirestore(activeRoomRef.current.id);
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [myUid]);

  // Announce presence whenever selected subject, status, or goal changes
  useEffect(() => {
    if (currentSubject) {
      broadcastPresence(activeRoom);
    }
  }, [selectedSubjectId, myStatus, activeRoom?.id]);

  // Prune stale remote cursors (> 6s idle)
  useEffect(() => {
    if (!activeRoom) return;
    const interval = window.setInterval(() => {
      const cutoff = Date.now() - 6000;
      setRemoteCursors((prev) => prev.filter((c) => c.updatedAt >= cutoff));
    }, 2000);
    return () => window.clearInterval(interval);
  }, [activeRoom]);

  // Live 1s Pomodoro countdown display synced to timer state
  useEffect(() => {
    const computeRemaining = () => {
      if (!timer.running) return timer.remainingSec;
      const elapsed = Math.floor((Date.now() - timer.updatedAtMs) / 1000);
      return Math.max(0, timer.remainingSec - elapsed);
    };
    setDisplaySeconds(computeRemaining());
    if (!timer.running) return;
    const id = window.setInterval(() => {
      setDisplaySeconds(computeRemaining());
    }, 500);
    return () => window.clearInterval(id);
  }, [timer]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  // Real session time tracker: accrues 1 study minute per real 60 seconds inside active room
  useEffect(() => {
    if (!activeRoom) {
      setSessionSeconds(0);
      loggedSessionMinutesRef.current = 0;
      return;
    }

    const joinedAt = Date.now();
    loggedSessionMinutesRef.current = 0;
    setSessionSeconds(0);

    const interval = window.setInterval(() => {
      const elapsedSec = Math.floor((Date.now() - joinedAt) / 1000);
      setSessionSeconds(elapsedSec);
      const completedMins = Math.floor(elapsedSec / 60);
      if (completedMins > loggedSessionMinutesRef.current) {
        const delta = completedMins - loggedSessionMinutesRef.current;
        loggedSessionMinutesRef.current = completedMins;
        void recordStudyContribution({
          subjectId: activeRoom.subjectId,
          subjectCode: activeRoom.subjectCode,
          subjectName: activeRoom.subjectName,
          minutesDelta: delta,
        });
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [activeRoom?.id]);

  // Firestore listeners (or sample room resources in Demo Mode) when inside a room
  useEffect(() => {
    if (!activeRoom) {
      setFirestorePeers([]);
      setRoomResources([]);
      return;
    }
    if (isDemoMode) {
      setFirestorePeers([]);
      setRoomResources(SAMPLE_ROOM_RESOURCES.filter((r) => r.roomId === activeRoom.id));
      return;
    }
    const unsubPeers = subscribeRoomParticipants(activeRoom.id, (rows) => {
      setFirestorePeers(rows);
    });
    const unsubStrokes = subscribeRoomStrokes(activeRoom.id, (rows) => {
      setStrokes((prev) => {
        const merged = [...prev];
        for (const r of rows) {
          if (!merged.some((ex) => ex.id === r.id)) {
            merged.push(r);
          }
        }
        return merged;
      });
    });
    const unsubResources = subscribeRoomResources(activeRoom.id, (rows) => {
      setRoomResources((prev) => {
        const merged = [...prev];
        for (const r of rows) {
          if (!merged.some((ex) => ex.id === r.id)) {
            merged.push(r);
          }
        }
        return merged;
      });
    });
    return () => {
      unsubPeers();
      unsubStrokes();
      unsubResources();
    };
  }, [activeRoom?.id, isDemoMode]);

  const handleJoinRoom = async (room: StudyRoom) => {
    if (activeRoom && activeRoom.id !== room.id) {
      sendWs({ type: 'room:leave', roomId: activeRoom.id });
      await leaveStudyRoomInFirestore(activeRoom.id);
    }

    setStrokes([]);
    setMessages([]);
    setRoomResources([]);
    setRemoteCursors([]);
    setShowShareForm(false);
    setSidebarTab('chat');
    setActiveRoom(room);

    const sub = subjects.find((s) => s.id === room.subjectId) || currentSubject;
    if (sub) {
      setSelectedSubjectId(sub.id);
    }

    await joinStudyRoomInFirestore(room, {
      uid: myUid,
      roomId: room.id,
      displayName: myName,
      subjectId: room.subjectId,
      subjectName: room.subjectName,
      studyFocus: studyGoal.trim() || room.topic,
      colorHex: myColor,
      status: myStatus,
    });

    if (!joinedRoomsThisMountRef.current.has(room.id)) {
      joinedRoomsThisMountRef.current.add(room.id);
      void recordStudyContribution({
        subjectId: room.subjectId,
        subjectCode: room.subjectCode,
        subjectName: room.subjectName,
        sessionsDelta: 1,
      });
    }

    sendWs({
      type: 'room:join',
      roomId: room.id,
      roomTitle: room.title,
      uid: myUid,
      displayName: myName,
      subjectId: room.subjectId,
      subjectCode: room.subjectCode,
      subjectName: room.subjectName,
      studyFocus: studyGoal.trim() || room.topic,
      colorHex: myColor,
      status: myStatus,
    });

    broadcastPresence(room);
  };

  const handleLeaveRoom = async () => {
    if (!activeRoom) return;
    const leavingId = activeRoom.id;
    sendWs({ type: 'room:leave', roomId: leavingId });
    setActiveRoom(null);
    setRoomWsPeers([]);
    setFirestorePeers([]);
    setStrokes([]);
    setMessages([]);
    setRoomResources([]);
    setRemoteCursors([]);
    await leaveStudyRoomInFirestore(leavingId);
    broadcastPresence(null);
  };

  const handleShareResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRoom) return;
    const selectedLibMat =
      resType === 'library-note' ? materials.find((m) => m.id === (resMaterialId || materials[0]?.id)) : null;

    const finalTitle =
      resType === 'library-note' && !resTitle.trim() && selectedLibMat
        ? selectedLibMat.title
        : resTitle.trim();

    if (finalTitle.length < 2) return;

    setSharingResource(true);
    try {
      const resource: Omit<StudyRoomResource, 'createdAt'> = {
        id: `res_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        roomId: activeRoom.id,
        authorUid: myUid,
        authorName: myName,
        title: finalTitle.slice(0, 180),
        resourceType: resType,
        materialId: selectedLibMat?.id || '',
        url: resType === 'link' ? resUrl.trim().slice(0, 1000) : selectedLibMat?.fileUrl || '',
        noteText: (
          resNote.trim() ||
          selectedLibMat?.description ||
          ''
        ).slice(0, 1000),
        subjectCode: activeRoom.subjectCode || 'GEN',
      };

      setRoomResources((prev) => [resource, ...prev]);
      sendWs({ type: 'resource:share', roomId: activeRoom.id, resource });
      await persistRoomResource(resource);
      await recordStudyContribution({
        subjectId: activeRoom.subjectId,
        subjectCode: activeRoom.subjectCode,
        subjectName: activeRoom.subjectName,
        resourcesDelta: 1,
      });

      setResTitle('');
      setResUrl('');
      setResNote('');
      setShowShareForm(false);
    } finally {
      setSharingResource(false);
    }
  };

  const handleDeleteRoomResource = async (resourceId: string) => {
    if (!activeRoom) return;
    setRoomResources((prev) => prev.filter((r) => r.id !== resourceId));
    sendWs({ type: 'resource:delete', roomId: activeRoom.id, resourceId });
    await removeRoomResource(activeRoom.id, resourceId);
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = newRoomTitle.trim();
    const sub = subjects.find((s) => s.id === newRoomSubjectId) || subjects[0];
    if (!cleanTitle || !sub) return;
    setCreatingRoom(true);
    try {
      const created = await createStudyRoomItem({
        title: cleanTitle,
        topic: newRoomTopic.trim() || `Collaborative ${sub.name} session`,
        subjectId: sub.id,
        subjectCode: sub.code,
        subjectName: sub.name,
        semester: sub.semester,
      });
      setNewRoomTitle('');
      setNewRoomTopic('');
      setShowCreateRoom(false);
      if (created) {
        await handleJoinRoom(created);
      }
    } finally {
      setCreatingRoom(false);
    }
  };

  const handleAddStroke = (stroke: Omit<WhiteboardStroke, 'createdAt'>) => {
    setStrokes((prev) => (prev.some((s) => s.id === stroke.id) ? prev : [...prev, stroke]));
    sendWs({ type: 'stroke:add', roomId: stroke.roomId, stroke });
    void persistRoomStroke(stroke);
  };

  const handleDeleteStroke = (strokeId: string) => {
    if (!activeRoom) return;
    setStrokes((prev) => prev.filter((s) => s.id !== strokeId));
    sendWs({ type: 'stroke:delete', roomId: activeRoom.id, strokeId });
    void removeRoomStroke(activeRoom.id, strokeId);
  };

  const handleClearBoard = () => {
    if (!activeRoom) return;
    const isHostOrAdmin = activeRoom.hostUid === myUid || activeRoleView === 'admin';
    if (isHostOrAdmin) {
      setStrokes([]);
      sendWs({ type: 'board:clear', roomId: activeRoom.id });
    } else {
      const myIds = strokes.filter((s) => s.authorUid === myUid).map((s) => s.id);
      setStrokes((prev) => prev.filter((s) => s.authorUid !== myUid));
      myIds.forEach((id) => sendWs({ type: 'stroke:delete', roomId: activeRoom.id, strokeId: id }));
    }
    void clearRoomStrokesInFirestore(activeRoom.id, isHostOrAdmin);
  };

  const handleCursorMove = (x: number, y: number) => {
    if (!activeRoom) return;
    sendWs({ type: 'cursor:move', roomId: activeRoom.id, x, y });
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text || !activeRoom) return;
    const msg: StudyRoomChatMessage = {
      id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      roomId: activeRoom.id,
      senderUid: myUid,
      senderName: myName,
      colorHex: myColor,
      text: text.slice(0, 600),
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, msg]);
    setChatInput('');
    sendWs({ type: 'chat:send', roomId: activeRoom.id, message: msg });
  };

  const handleTimerAction = (action: 'start' | 'pause' | 'reset' | 'mode', mode?: 'focus' | 'break') => {
    if (!activeRoom) return;
    sendWs({ type: 'timer:action', roomId: activeRoom.id, action, mode });
  };

  // Merge WS campus peers + Firestore studyPresence deduplicated by uid
  const mergedCampusPeers = useMemo(() => {
    const byUid = new Map<
      string,
      {
        uid: string;
        displayName: string;
        subjectId: string;
        subjectCode: string;
        subjectName: string;
        roomId: string;
        roomTitle: string;
        studyGoal: string;
        colorHex: string;
        status: 'studying' | 'break' | 'away';
        isLiveWs: boolean;
      }
    >();

    for (const p of studyPresenceList) {
      if (!p.isActive) continue;
      byUid.set(p.uid, {
        uid: p.uid,
        displayName: p.displayName,
        subjectId: p.subjectId,
        subjectCode: p.subjectCode,
        subjectName: p.subjectName,
        roomId: p.roomId || '',
        roomTitle: p.roomTitle || '',
        studyGoal: p.studyGoal || '',
        colorHex: colorForUid(p.uid),
        status: 'studying',
        isLiveWs: false,
      });
    }

    for (const wp of campusWsPeers) {
      byUid.set(wp.uid, {
        uid: wp.uid,
        displayName: wp.displayName,
        subjectId: wp.subjectId,
        subjectCode: wp.subjectCode,
        subjectName: wp.subjectName,
        roomId: wp.roomId || '',
        roomTitle: wp.roomTitle || '',
        studyGoal: wp.studyFocus || '',
        colorHex: wp.colorHex || colorForUid(wp.uid),
        status: wp.status || 'studying',
        isLiveWs: true,
      });
    }

    return Array.from(byUid.values());
  }, [studyPresenceList, campusWsPeers]);

  const otherPeers = useMemo(
    () => mergedCampusPeers.filter((p) => p.uid !== myUid),
    [mergedCampusPeers, myUid]
  );

  const sameSubjectPeers = useMemo(
    () => otherPeers.filter((p) => currentSubject && p.subjectId === currentSubject.id),
    [otherPeers, currentSubject]
  );

  const displayedPeers = peerScope === 'same-subject' ? sameSubjectPeers : otherPeers;

  // Count live peers inside each room
  const roomPeerCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of mergedCampusPeers) {
      if (p.roomId) {
        counts.set(p.roomId, (counts.get(p.roomId) || 0) + 1);
      }
    }
    return counts;
  }, [mergedCampusPeers]);

  // Active room merged peers
  const activeRoomPeers = useMemo(() => {
    const map = new Map<
      string,
      { uid: string; displayName: string; studyFocus: string; colorHex: string; status: string }
    >();
    for (const fp of firestorePeers) {
      map.set(fp.uid, {
        uid: fp.uid,
        displayName: fp.displayName,
        studyFocus: fp.studyFocus,
        colorHex: fp.colorHex || colorForUid(fp.uid),
        status: fp.status,
      });
    }
    for (const wp of roomWsPeers) {
      map.set(wp.uid, {
        uid: wp.uid,
        displayName: wp.displayName,
        studyFocus: wp.studyFocus,
        colorHex: wp.colorHex || colorForUid(wp.uid),
        status: wp.status,
      });
    }
    if (!map.has(myUid)) {
      map.set(myUid, {
        uid: myUid,
        displayName: myName,
        studyFocus: studyGoal,
        colorHex: myColor,
        status: myStatus,
      });
    }
    return Array.from(map.values());
  }, [firestorePeers, roomWsPeers, myUid, myName, studyGoal, myColor, myStatus]);

  const filteredRooms = useMemo(() => {
    if (roomSubjectFilter === 'all') return studyRooms;
    return studyRooms.filter((r) => r.subjectId === roomSubjectFilter);
  }, [studyRooms, roomSubjectFilter]);

  const isHostOrAdmin = Boolean(activeRoom && (activeRoom.hostUid === myUid || activeRoleView === 'admin'));

  // Active Room View
  if (activeRoom) {
    return (
      <div className="space-y-4">
        {/* Room Header Bar */}
        <div className="cc-card p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={handleLeaveRoom}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.1] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.05] shrink-0 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Leave Room
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white truncate">
                  {activeRoom.title}
                </h2>
                <span className="text-xs font-medium text-blue-600 dark:text-blue-400 shrink-0">
                  {activeRoom.subjectCode}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {activeRoom.subjectName} · {activeRoom.topic}
              </p>
            </div>
          </div>

          {/* Synced Pomodoro Timer + WS Status */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="cc-inset flex items-center gap-2 px-3 py-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-600" />
              <button
                type="button"
                onClick={() => handleTimerAction('mode', timer.mode === 'focus' ? 'break' : 'focus')}
                className="text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white uppercase tracking-wide"
                title="Switch Focus / Break mode"
              >
                {timer.mode === 'focus' ? 'Focus' : 'Break'}
              </button>
              <span className="font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
                {formatSeconds(displaySeconds)}
              </span>
              <button
                type="button"
                onClick={() => handleTimerAction(timer.running ? 'pause' : 'start')}
                className="p-1 rounded hover:bg-slate-200 dark:hover:bg-white/[0.08] text-slate-700 dark:text-slate-200"
                title={timer.running ? 'Pause shared timer' : 'Start shared timer'}
              >
                {timer.running ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => handleTimerAction('reset')}
                className="p-1 rounded hover:bg-slate-200 dark:hover:bg-white/[0.08] text-slate-500 dark:text-slate-400"
                title="Reset shared timer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
              {wsStatus === 'connected' ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Live Sync</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-amber-500" />
                  <span>{wsStatus === 'connecting' ? 'Connecting...' : 'Reconnecting...'}</span>
                </>
              )}
              <span className="text-slate-300 dark:text-white/20">·</span>
              <span className="tabular-nums">{activeRoomPeers.length} in room</span>
              <span className="text-slate-300 dark:text-white/20">·</span>
              <span className="tabular-nums text-blue-600 dark:text-blue-400">
                Session {formatSeconds(sessionSeconds)}
              </span>
              <button
                type="button"
                onClick={() => setShowRoomLeaderboard((v) => !v)}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                  showRoomLeaderboard
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'border-slate-200 dark:border-white/[0.1] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.05]'
                }`}
              >
                <Trophy className="w-3.5 h-3.5" />
                Leaderboard
              </button>
            </div>
          </div>
        </div>

        {showRoomLeaderboard && (
          <StudyContributorsLeaderboard
            contributors={studyContributors}
            currentUid={myUid}
            selectedSubjectId={activeRoom.subjectId}
            selectedSubjectCode={activeRoom.subjectCode}
            selectedSubjectName={activeRoom.subjectName}
            activeSessionSeconds={sessionSeconds}
          />
        )}

        {/* Workspace Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
          {/* Shared Konva Whiteboard */}
          <div className="xl:col-span-8 min-w-0">
            <SharedWhiteboard
              roomId={activeRoom.id}
              currentUid={myUid}
              currentName={myName}
              isHostOrAdmin={isHostOrAdmin}
              strokes={strokes}
              remoteCursors={remoteCursors}
              theme={theme}
              onAddStroke={handleAddStroke}
              onDeleteStroke={handleDeleteStroke}
              onClearBoard={handleClearBoard}
              onCursorMove={handleCursorMove}
            />
          </div>

          {/* Right Sidebar: Peers + Tabbed Chat / Shared Resources */}
          <div className="xl:col-span-4 min-w-0 space-y-4">
            {/* In This Room Peers */}
            <div className="cc-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-blue-600" />
                  Peers in Session ({activeRoomPeers.length})
                </h3>
                <span className="text-[11px] text-slate-400">Real-time</span>
              </div>

              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {activeRoomPeers.map((peer) => (
                  <div
                    key={peer.uid}
                    className="cc-inset flex items-start justify-between gap-2 p-2.5"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full mt-1 shrink-0"
                        style={{ backgroundColor: peer.colorHex }}
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                          {peer.displayName} {peer.uid === myUid ? '(You)' : ''}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {peer.studyFocus || activeRoom.subjectName}
                        </p>
                      </div>
                    </div>
                    <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 shrink-0">
                      {peer.status === 'break' ? 'Break' : 'Active'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tabbed Group Chat & Shared Resources (+25 pts gamified) */}
            <div className="cc-card flex flex-col h-[390px]">
              <div className="px-3 py-2 border-b border-slate-200/80 dark:border-white/[0.08] flex flex-wrap items-center justify-between gap-2">
                <div className="cc-segmented inline-flex flex-wrap max-w-full">
                  <button
                    type="button"
                    onClick={() => setSidebarTab('chat')}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                      sidebarTab === 'chat'
                        ? 'bg-white dark:bg-[#0B1018] text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <MessageSquare className="w-3 h-3" />
                    Chat ({messages.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSidebarTab('resources')}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                      sidebarTab === 'resources'
                        ? 'bg-white dark:bg-[#0B1018] text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Paperclip className="w-3 h-3" />
                    Resources ({roomResources.length})
                  </button>
                </div>

                {sidebarTab === 'resources' && (
                  <button
                    type="button"
                    onClick={() => setShowShareForm((v) => !v)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-medium transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    Share (+25 pts)
                  </button>
                )}
              </div>

              {sidebarTab === 'chat' ? (
                <>
                  <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-3 space-y-2.5">
                    {messages.length === 0 ? (
                      <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-8">
                        Share formulas, doubts, or links with classmates in this room.
                      </p>
                    ) : (
                      messages.map((m) => {
                        const mine = m.senderUid === myUid;
                        return (
                          <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: m.colorHex || '#2563eb' }}
                              />
                              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                {mine ? 'You' : m.senderName}
                              </span>
                            </div>
                            <div
                              className={`max-w-[88%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
                                mine
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-slate-100 dark:bg-[#141925] text-slate-900 dark:text-slate-100 border border-slate-200/70 dark:border-white/[0.06]'
                              }`}
                            >
                              {m.text}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <form onSubmit={handleSendChat} className="p-2.5 border-t border-slate-200/80 dark:border-white/[0.08] flex gap-2">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Message study group..."
                      className="cc-input flex-1 px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                    />
                    <button
                      type="submit"
                      disabled={!chatInput.trim()}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-medium inline-flex items-center gap-1 transition-colors"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </form>
                </>
              ) : (
                <div className="flex-1 flex flex-col overflow-hidden">
                  {showShareForm && (
                    <form
                      onSubmit={handleShareResource}
                      className="p-3 border-b border-slate-200/80 dark:border-white/[0.08] bg-slate-50/80 dark:bg-[#0B1018] space-y-2"
                    >
                      <div className="flex gap-1">
                        {(
                          [
                            { id: 'library-note', label: 'Library Note' },
                            { id: 'link', label: 'Link' },
                            { id: 'snippet', label: 'Formula/Note' },
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setResType(opt.id)}
                            className={`flex-1 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                              resType === opt.id
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white dark:bg-[#141925] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/[0.08]'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>

                      {resType === 'library-note' && (
                        <select
                          value={resMaterialId || materials[0]?.id || ''}
                          onChange={(e) => {
                            setResMaterialId(e.target.value);
                            const mat = materials.find((m) => m.id === e.target.value);
                            if (mat && !resTitle.trim()) setResTitle(mat.title);
                          }}
                          className="cc-input w-full px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                        >
                          {materials.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.title}
                            </option>
                          ))}
                        </select>
                      )}

                      <input
                        type="text"
                        required={resType !== 'library-note'}
                        value={resTitle}
                        onChange={(e) => setResTitle(e.target.value)}
                        placeholder={
                          resType === 'library-note'
                            ? 'Optional custom title (uses note title if blank)'
                            : 'Resource title (e.g. Gate OS Deadlock Summary)'
                        }
                        className="cc-input w-full px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                      />

                      {resType === 'link' && (
                        <input
                          type="url"
                          required
                          value={resUrl}
                          onChange={(e) => setResUrl(e.target.value)}
                          placeholder="https://..."
                          className="cc-input w-full px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                        />
                      )}

                      <textarea
                        rows={2}
                        value={resNote}
                        onChange={(e) => setResNote(e.target.value)}
                        placeholder={
                          resType === 'snippet'
                            ? 'Paste key formula, proof steps, or revision summary...'
                            : 'Brief description for peers...'
                        }
                        className="cc-input w-full px-2.5 py-1.5 text-xs text-slate-900 dark:text-white resize-none"
                      />

                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowShareForm(false)}
                          className="px-2.5 py-1 rounded text-[11px] text-slate-500 hover:text-slate-900 dark:hover:text-white"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={sharingResource}
                          className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-medium"
                        >
                          {sharingResource ? 'Sharing...' : 'Share to Room'}
                        </button>
                      </div>
                    </form>
                  )}

                  <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                    {roomResources.length === 0 ? (
                      <div className="text-center py-8 space-y-2">
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          No study resources shared in this room yet.
                        </p>
                        <button
                          type="button"
                          onClick={() => setShowShareForm(true)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.1] text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Share First Resource (+25 pts)
                        </button>
                      </div>
                    ) : (
                      roomResources.map((res) => {
                        const linkedMaterial = res.materialId
                          ? materials.find((m) => m.id === res.materialId)
                          : null;
                        const canRemove = res.authorUid === myUid || isHostOrAdmin;
                        return (
                          <div
                            key={res.id}
                            className="cc-inset p-2.5 space-y-1.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-2 min-w-0">
                                {res.resourceType === 'link' ? (
                                  <Link2 className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" />
                                ) : (
                                  <FileText className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" />
                                )}
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-slate-900 dark:text-white leading-snug">
                                    {res.title}
                                  </p>
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                    Shared by {res.authorName} · {res.subjectCode}
                                  </p>
                                </div>
                              </div>
                              {canRemove && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRoomResource(res.id)}
                                  title="Remove shared resource"
                                  className="text-slate-400 hover:text-rose-600 p-0.5"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>

                            {res.noteText && (
                              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                                {res.noteText}
                              </p>
                            )}

                            <div className="flex flex-wrap items-center gap-3 pt-1">
                              {res.url && (
                                <a
                                  href={res.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  Open Link
                                </a>
                              )}
                              {linkedMaterial && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openAiWithMaterial(linkedMaterial)}
                                    className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
                                  >
                                    Explain with AI
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setActiveView('materials')}
                                    className="text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:underline"
                                  >
                                    View in Library
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Lobby & Subject Peer Discovery View
  return (
    <div className="space-y-6">
      {/* Header + My Study Broadcast Bar */}
      <div className="cc-card cc-grid-pattern p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Presentation className="w-5 h-5 text-blue-600" />
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                Virtual Study Rooms & Live Peer Presence
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              See which classmates are studying your current subject and collaborate live on a shared whiteboard.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
              <Radio className={`w-3.5 h-3.5 ${wsStatus === 'connected' ? 'text-emerald-600' : 'text-amber-500'}`} />
              {wsStatus === 'connected' ? 'Presence Connected' : 'Connecting...'}
            </span>
            <button
              type="button"
              onClick={() => setShowCreateRoom((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New Study Room
            </button>
          </div>
        </div>

        {/* Broadcast what I'm studying */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-4 border-t border-slate-200/80 dark:border-white/[0.08]">
          <div className="md:col-span-4">
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
              Subject I’m Studying Now
            </label>
            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              className="cc-input w-full px-3 py-2 text-xs text-slate-900 dark:text-white"
            >
              {subjects.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.code} · {sub.name}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-5">
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
              Current Study Focus
            </label>
            <input
              type="text"
              value={studyGoal}
              onChange={(e) => setStudyGoal(e.target.value)}
              onBlur={() => broadcastPresence()}
              placeholder="e.g. Solving Banker's Algorithm & Deadlock problems"
              className="cc-input w-full px-3 py-2 text-xs text-slate-900 dark:text-white"
            />
          </div>

          <div className="md:col-span-3 flex flex-wrap items-end gap-2">
            <button
              type="button"
              onClick={() => setMyStatus((s) => (s === 'studying' ? 'break' : 'studying'))}
              className={`flex-1 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                myStatus === 'studying'
                  ? 'border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                  : 'border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300'
              }`}
            >
              Status: {myStatus === 'studying' ? 'Studying' : 'On Break'}
            </button>
            <button
              type="button"
              onClick={() => broadcastPresence()}
              className="px-3 py-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-950 text-xs font-medium hover:opacity-90 transition-opacity"
            >
              Update
            </button>
          </div>
        </div>
      </div>

      {/* Create Room Form */}
      {showCreateRoom && (
        <form
          onSubmit={handleCreateRoom}
          className="cc-card border-blue-200 dark:border-blue-500/30 p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Start a Group Study Session
            </h3>
            <button
              type="button"
              onClick={() => setShowCreateRoom(false)}
              className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                Session Title
              </label>
              <input
                type="text"
                required
                value={newRoomTitle}
                onChange={(e) => setNewRoomTitle(e.target.value)}
                placeholder="e.g. OS Unit 3 Deadlocks Sprint"
                className="cc-input w-full px-3 py-2 text-xs text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                Subject
              </label>
              <select
                value={newRoomSubjectId}
                onChange={(e) => setNewRoomSubjectId(e.target.value)}
                className="cc-input w-full px-3 py-2 text-xs text-slate-900 dark:text-white"
              >
                {subjects.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.code} · {sub.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                Study Topic / Agenda
              </label>
              <input
                type="text"
                value={newRoomTopic}
                onChange={(e) => setNewRoomTopic(e.target.value)}
                placeholder="Whiteboard practice & past paper Qs"
                className="cc-input w-full px-3 py-2 text-xs text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={creatingRoom || !newRoomTitle.trim()}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium transition-colors"
            >
              {creatingRoom ? 'Creating...' : 'Create & Open Whiteboard'}
            </button>
          </div>
        </form>
      )}

      {/* Who Else Is Studying This Subject */}
      <div className="cc-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-blue-600" />
              Students Studying Online
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {currentSubject
                ? `Matching peers on ${currentSubject.code} · ${currentSubject.name}`
                : 'Live classmates active on SKU Campus'}
            </p>
          </div>

          <div className="cc-segmented inline-flex flex-wrap max-w-full">
            <button
              type="button"
              onClick={() => setPeerScope('same-subject')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                peerScope === 'same-subject'
                  ? 'bg-white dark:bg-[#0B1018] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Same Subject ({sameSubjectPeers.length})
            </button>
            <button
              type="button"
              onClick={() => setPeerScope('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                peerScope === 'all'
                  ? 'bg-white dark:bg-[#0B1018] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              All Active ({otherPeers.length})
            </button>
          </div>
        </div>

        {displayedPeers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 dark:border-white/[0.1] p-6 text-center space-y-1.5">
            <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
              {peerScope === 'same-subject'
                ? `No other classmates are currently broadcasting ${currentSubject?.code || 'this subject'}.`
                : 'No other students are broadcasting live study status right now.'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Your status ({currentSubject?.code} · {studyGoal}) is live. Open a session below or open a second window to collaborate in real time.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {displayedPeers.map((peer) => {
              const peerRoom = peer.roomId ? studyRooms.find((r) => r.id === peer.roomId) : null;
              return (
                <div
                  key={peer.uid}
                  className="cc-inset p-3.5 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: peer.colorHex }}
                        />
                        <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                          {peer.displayName}
                        </span>
                      </div>
                      <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 shrink-0">
                        {peer.status === 'break' ? 'On Break' : peer.isLiveWs ? 'Live' : 'Active'}
                      </span>
                    </div>
                    <p className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
                      {peer.subjectCode} · {peer.subjectName}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                      {peer.studyGoal || 'Studying syllabus notes'}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-200/70 dark:border-white/[0.06]">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {peer.roomTitle ? `In: ${peer.roomTitle}` : 'Studying solo'}
                    </span>
                    {peerRoom && (
                      <button
                        type="button"
                        onClick={() => handleJoinRoom(peerRoom)}
                        className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-medium shrink-0 transition-colors"
                      >
                        Join Room
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Group Study Rooms Grid */}
      <div className="space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-blue-600" />
            Active Group Study Sessions ({filteredRooms.length})
          </h3>
          <select
            value={roomSubjectFilter}
            onChange={(e) => setRoomSubjectFilter(e.target.value)}
            className="cc-input px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200 w-full sm:w-auto max-w-full"
          >
            <option value="all">All Subjects</option>
            {subjects.map((sub) => (
              <option key={sub.id} value={sub.id}>
                {sub.code} · {sub.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRooms.map((room) => {
            const liveCount = roomPeerCounts.get(room.id) || 0;
            const canDelete = room.hostUid === myUid || activeRoleView === 'admin';
            return (
              <div
                key={room.id}
                className="cc-card-hover p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-blue-600 dark:text-blue-400">
                      {room.subjectCode} · Sem {room.semester}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                      {liveCount} {liveCount === 1 ? 'peer' : 'peers'} online
                    </span>
                  </div>

                  <h4 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                    {room.title}
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {room.topic}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-white/[0.06] flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    Host · {room.hostName}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => removeStudyRoomItem(room.id)}
                        title="Delete study room"
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-white/[0.1] text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleJoinRoom(room)}
                      className="px-3.5 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-950 hover:bg-blue-600 dark:hover:bg-blue-500 dark:hover:text-white text-xs font-medium transition-colors"
                    >
                      Join Whiteboard
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top Study Contributors Leaderboard */}
      <StudyContributorsLeaderboard
        contributors={studyContributors}
        currentUid={myUid}
        selectedSubjectId={currentSubject?.id || ''}
        selectedSubjectCode={currentSubject?.code}
        selectedSubjectName={currentSubject?.name}
        activeSessionSeconds={sessionSeconds}
      />
    </div>
  );
};
