import React, { useEffect, useMemo, useRef, useState } from 'react';
import type Konva from 'konva';
import { Circle as KonvaCircle, Ellipse, Group, Layer, Line, Rect, Stage, Text } from 'react-konva';
import {
  Circle as CircleIcon,
  Download,
  Eraser,
  Highlighter,
  PenLine,
  RotateCcw,
  Square,
  Trash2,
  Type,
} from 'lucide-react';
import type { WhiteboardStroke, WhiteboardTool } from '../types/campus';

export interface RemoteCursor {
  uid: string;
  displayName: string;
  colorHex: string;
  x: number;
  y: number;
  updatedAt: number;
}

interface SharedWhiteboardProps {
  roomId: string;
  currentUid: string;
  currentName: string;
  isHostOrAdmin: boolean;
  strokes: WhiteboardStroke[];
  remoteCursors: RemoteCursor[];
  theme: 'light' | 'dark';
  onAddStroke: (stroke: Omit<WhiteboardStroke, 'createdAt'>) => void;
  onDeleteStroke: (strokeId: string) => void;
  onClearBoard: () => void;
  onCursorMove: (x: number, y: number) => void;
}

const VIRTUAL_WIDTH = 960;
const VIRTUAL_HEIGHT = 540;

const PALETTE = [
  { hex: '#18181b', label: 'Ink' },
  { hex: '#2563eb', label: 'Blue' },
  { hex: '#059669', label: 'Emerald' },
  { hex: '#d97706', label: 'Amber' },
  { hex: '#dc2626', label: 'Crimson' },
  { hex: '#7c3aed', label: 'Violet' },
];

const TOOLS: Array<{ id: WhiteboardTool; label: string; icon: React.FC<{ className?: string }> }> = [
  { id: 'pen', label: 'Pen', icon: PenLine },
  { id: 'highlighter', label: 'Highlight', icon: Highlighter },
  { id: 'rect', label: 'Rectangle', icon: Square },
  { id: 'circle', label: 'Ellipse', icon: CircleIcon },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'eraser', label: 'Eraser', icon: Eraser },
];

function parsePoints(pointsJson: string): number[] {
  try {
    const parsed = JSON.parse(pointsJson);
    if (Array.isArray(parsed)) {
      return parsed.map((n) => Number(n) || 0);
    }
  } catch {
    // ignore malformed json
  }
  return [];
}

function makeStrokeId(uid: string): string {
  const cleanUid = uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 12) || 'user';
  return `str_${Date.now()}_${cleanUid}_${Math.random().toString(36).slice(2, 7)}`;
}

export const SharedWhiteboard: React.FC<SharedWhiteboardProps> = ({
  roomId,
  currentUid,
  currentName,
  isHostOrAdmin,
  strokes,
  remoteCursors,
  theme,
  onAddStroke,
  onDeleteStroke,
  onClearBoard,
  onCursorMove,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const isDrawingRef = useRef(false);
  const lastCursorSentRef = useRef(0);

  const [stageSize, setStageSize] = useState<{ width: number; height: number }>({
    width: VIRTUAL_WIDTH,
    height: VIRTUAL_HEIGHT,
  });

  const [tool, setTool] = useState<WhiteboardTool>('pen');
  const [color, setColor] = useState<string>('#2563eb');
  const [strokeWidth, setStrokeWidth] = useState<number>(3);
  const [darkBoard, setDarkBoard] = useState<boolean>(theme === 'dark');

  const [draftStroke, setDraftStroke] = useState<Omit<WhiteboardStroke, 'createdAt'> | null>(null);
  const [textInputPos, setTextInputPos] = useState<{ x: number; y: number } | null>(null);
  const [textDraft, setTextDraft] = useState('');

  useEffect(() => {
    setDarkBoard(theme === 'dark');
  }, [theme]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      const width = Math.max(320, Math.floor(rect.width));
      const height = Math.max(360, Math.round(width * (VIRTUAL_HEIGHT / VIRTUAL_WIDTH)));
      setStageSize({ width, height });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);

  const scale = stageSize.width / VIRTUAL_WIDTH;

  const getVirtualPoint = () => {
    const stage = stageRef.current;
    if (!stage) return null;
    const pos = stage.getPointerPosition();
    if (!pos) return null;
    return {
      x: Math.round((pos.x / scale) * 10) / 10,
      y: Math.round((pos.y / scale) * 10) / 10,
    };
  };

  const resolveRenderColor = (rawColor: string) => {
    if (darkBoard && rawColor.toLowerCase() === '#18181b') {
      return '#f4f4f5';
    }
    if (!darkBoard && rawColor.toLowerCase() === '#f4f4f5') {
      return '#18181b';
    }
    return rawColor;
  };

  const handlePointerDown = () => {
    const pt = getVirtualPoint();
    if (!pt) return;

    if (tool === 'text') {
      setTextInputPos(pt);
      setTextDraft('');
      return;
    }

    isDrawingRef.current = true;
    const id = makeStrokeId(currentUid);

    if (tool === 'pen' || tool === 'highlighter' || tool === 'eraser') {
      setDraftStroke({
        id,
        roomId,
        authorUid: currentUid,
        authorName: currentName,
        tool,
        color: tool === 'eraser' ? '#000000' : color,
        strokeWidth: tool === 'eraser' ? strokeWidth * 4 : tool === 'highlighter' ? strokeWidth * 3.5 : strokeWidth,
        pointsJson: JSON.stringify([pt.x, pt.y, pt.x + 0.1, pt.y + 0.1]),
        text: '',
      });
    } else if (tool === 'rect' || tool === 'circle') {
      setDraftStroke({
        id,
        roomId,
        authorUid: currentUid,
        authorName: currentName,
        tool,
        color,
        strokeWidth,
        pointsJson: JSON.stringify([pt.x, pt.y, 0, 0]),
        text: '',
      });
    }
  };

  const handlePointerMove = () => {
    const pt = getVirtualPoint();
    if (!pt) return;

    const now = Date.now();
    if (now - lastCursorSentRef.current >= 45) {
      lastCursorSentRef.current = now;
      onCursorMove(pt.x, pt.y);
    }

    if (!isDrawingRef.current || !draftStroke) return;

    const currentPts = parsePoints(draftStroke.pointsJson);

    if (draftStroke.tool === 'pen' || draftStroke.tool === 'highlighter' || draftStroke.tool === 'eraser') {
      if (currentPts.length >= 2400) return;
      const nextPts = [...currentPts, pt.x, pt.y];
      setDraftStroke({
        ...draftStroke,
        pointsJson: JSON.stringify(nextPts),
      });
    } else if (draftStroke.tool === 'rect' || draftStroke.tool === 'circle') {
      const startX = currentPts[0] ?? pt.x;
      const startY = currentPts[1] ?? pt.y;
      setDraftStroke({
        ...draftStroke,
        pointsJson: JSON.stringify([startX, startY, pt.x - startX, pt.y - startY]),
      });
    }
  };

  const finalizeDrawing = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    if (draftStroke) {
      const pts = parsePoints(draftStroke.pointsJson);
      if (draftStroke.tool === 'rect' || draftStroke.tool === 'circle') {
        const w = Math.abs(pts[2] || 0);
        const h = Math.abs(pts[3] || 0);
        if (w >= 4 || h >= 4) {
          onAddStroke(draftStroke);
        }
      } else if (pts.length >= 2) {
        onAddStroke(draftStroke);
      }
    }
    setDraftStroke(null);
  };

  const handleCommitText = () => {
    const clean = textDraft.trim();
    if (textInputPos && clean) {
      onAddStroke({
        id: makeStrokeId(currentUid),
        roomId,
        authorUid: currentUid,
        authorName: currentName,
        tool: 'text',
        color,
        strokeWidth,
        pointsJson: JSON.stringify([textInputPos.x, textInputPos.y]),
        text: clean.slice(0, 500),
      });
    }
    setTextInputPos(null);
    setTextDraft('');
  };

  const myLatestStroke = useMemo(() => {
    for (let i = strokes.length - 1; i >= 0; i -= 1) {
      if (strokes[i].authorUid === currentUid) {
        return strokes[i];
      }
    }
    return null;
  }, [strokes, currentUid]);

  const handleExportPng = () => {
    const stage = stageRef.current;
    if (!stage) return;
    const dataUrl = stage.toDataURL({ pixelRatio: 2 });
    const link = document.createElement('a');
    link.download = `study-board-${roomId}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const allRenderStrokes = draftStroke ? [...strokes, draftStroke] : strokes;

  const gridLines = useMemo(() => {
    const lines: Array<{ key: string; points: number[] }> = [];
    const step = 32;
    for (let x = step; x < VIRTUAL_WIDTH; x += step) {
      lines.push({ key: `vx_${x}`, points: [x, 0, x, VIRTUAL_HEIGHT] });
    }
    for (let y = step; y < VIRTUAL_HEIGHT; y += step) {
      lines.push({ key: `hy_${y}`, points: [0, y, VIRTUAL_WIDTH, y] });
    }
    return lines;
  }, []);

  return (
    <div className="cc-card overflow-hidden flex flex-col w-full max-w-full">
      {/* Toolbar */}
      <div className="px-3.5 py-2.5 border-b border-slate-200/80 dark:border-white/[0.08] bg-slate-50/80 dark:bg-[#0B1018] flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          {TOOLS.map((t) => {
            const Icon = t.icon;
            const active = tool === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTool(t.id);
                  if (t.id !== 'text') setTextInputPos(null);
                }}
                title={t.label}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  active
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-white/[0.06]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Color swatches */}
          <div className="flex items-center gap-1 pr-2 border-r border-slate-200 dark:border-white/[0.08]">
            {PALETTE.map((swatch) => {
              const displayHex = resolveRenderColor(swatch.hex);
              const selected = color === swatch.hex && tool !== 'eraser';
              return (
                <button
                  key={swatch.hex}
                  type="button"
                  title={swatch.label}
                  onClick={() => {
                    setColor(swatch.hex);
                    if (tool === 'eraser') setTool('pen');
                  }}
                  className={`w-5 h-5 rounded-full border transition-transform ${
                    selected
                      ? 'scale-110 ring-2 ring-blue-600 ring-offset-1 dark:ring-offset-[#0B1018] border-white'
                      : 'border-slate-300 dark:border-white/20'
                  }`}
                  style={{ backgroundColor: displayHex }}
                />
              );
            })}
          </div>

          {/* Width */}
          <div className="flex items-center gap-1 pr-2 border-r border-slate-200 dark:border-white/[0.08]">
            {[2, 4, 8].map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setStrokeWidth(w)}
                title={`Stroke width ${w}px`}
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                  strokeWidth === w
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-950'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-white/[0.06]'
                }`}
              >
                <span
                  className="rounded-full bg-current"
                  style={{ width: Math.min(12, w + 3), height: Math.min(12, w + 3) }}
                />
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setDarkBoard((d) => !d)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.1] text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.05] transition-colors"
          >
            {darkBoard ? 'Light Board' : 'Dark Board'}
          </button>

          <button
            type="button"
            disabled={!myLatestStroke}
            onClick={() => myLatestStroke && onDeleteStroke(myLatestStroke.id)}
            title="Undo my last stroke"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.1] text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.05] disabled:opacity-40 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Undo</span>
          </button>

          <button
            type="button"
            disabled={strokes.length === 0}
            onClick={onClearBoard}
            title={isHostOrAdmin ? 'Clear entire whiteboard' : 'Clear my strokes'}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.1] text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-40 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{isHostOrAdmin ? 'Clear' : 'Clear Mine'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportPng}
            title="Download whiteboard as PNG"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-950 text-xs font-medium hover:opacity-90 transition-opacity"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">PNG</span>
          </button>
        </div>
      </div>

      {/* Canvas wrapper */}
      <div
        ref={containerRef}
        className="relative w-full select-none touch-none overflow-hidden"
        style={{ backgroundColor: darkBoard ? '#07090E' : '#ffffff' }}
      >
        <Stage
          ref={stageRef}
          width={stageSize.width}
          height={stageSize.height}
          scaleX={scale}
          scaleY={scale}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finalizeDrawing}
          onPointerLeave={finalizeDrawing}
          style={{ cursor: tool === 'text' ? 'text' : 'crosshair' }}
        >
          {/* Background & subtle study grid */}
          <Layer listening={false}>
            <Rect
              x={0}
              y={0}
              width={VIRTUAL_WIDTH}
              height={VIRTUAL_HEIGHT}
              fill={darkBoard ? '#07090E' : '#ffffff'}
            />
            {gridLines.map((gl) => (
              <Line
                key={gl.key}
                points={gl.points}
                stroke={darkBoard ? '#141925' : '#f1f5f9'}
                strokeWidth={1}
              />
            ))}
          </Layer>

          {/* Strokes Layer */}
          <Layer>
            {allRenderStrokes.map((s) => {
              const pts = parsePoints(s.pointsJson);
              const renderColor = resolveRenderColor(s.color);

              if (s.tool === 'pen' || s.tool === 'highlighter' || s.tool === 'eraser') {
                return (
                  <Line
                    key={s.id}
                    points={pts}
                    stroke={s.tool === 'eraser' ? '#000000' : renderColor}
                    strokeWidth={s.strokeWidth}
                    tension={0.35}
                    lineCap="round"
                    lineJoin="round"
                    opacity={s.tool === 'highlighter' ? 0.34 : 1}
                    globalCompositeOperation={s.tool === 'eraser' ? 'destination-out' : 'source-over'}
                  />
                );
              }

              if (s.tool === 'rect') {
                const [rx = 0, ry = 0, rw = 0, rh = 0] = pts;
                const normX = rw < 0 ? rx + rw : rx;
                const normY = rh < 0 ? ry + rh : ry;
                return (
                  <Rect
                    key={s.id}
                    x={normX}
                    y={normY}
                    width={Math.abs(rw)}
                    height={Math.abs(rh)}
                    stroke={renderColor}
                    strokeWidth={s.strokeWidth}
                    cornerRadius={4}
                  />
                );
              }

              if (s.tool === 'circle') {
                const [sx = 0, sy = 0, dw = 0, dh = 0] = pts;
                const cx = sx + dw / 2;
                const cy = sy + dh / 2;
                return (
                  <Ellipse
                    key={s.id}
                    x={cx}
                    y={cy}
                    radiusX={Math.max(1, Math.abs(dw) / 2)}
                    radiusY={Math.max(1, Math.abs(dh) / 2)}
                    stroke={renderColor}
                    strokeWidth={s.strokeWidth}
                  />
                );
              }

              if (s.tool === 'text') {
                const [tx = 0, ty = 0] = pts;
                return (
                  <Text
                    key={s.id}
                    x={tx}
                    y={ty}
                    text={s.text}
                    fontSize={Math.max(15, s.strokeWidth * 4.5)}
                    fontFamily="Inter, system-ui, sans-serif"
                    fill={renderColor}
                  />
                );
              }

              return null;
            })}
          </Layer>

          {/* Remote Peer Cursors Layer */}
          <Layer listening={false}>
            {remoteCursors.map((cursor) => (
              <Group key={cursor.uid} x={cursor.x} y={cursor.y}>
                <KonvaCircle radius={5} fill={cursor.colorHex || '#2563eb'} stroke="#ffffff" strokeWidth={1.5} />
                <Rect
                  x={8}
                  y={6}
                  width={Math.max(48, cursor.displayName.length * 6.5 + 12)}
                  height={20}
                  fill={cursor.colorHex || '#2563eb'}
                  cornerRadius={5}
                />
                <Text
                  x={14}
                  y={10}
                  text={cursor.displayName.slice(0, 18)}
                  fontSize={11}
                  fontFamily="Inter, system-ui, sans-serif"
                  fill="#ffffff"
                />
              </Group>
            ))}
          </Layer>
        </Stage>

        {/* Inline text placement input */}
        {textInputPos && (
          <div
            className="absolute z-20 flex items-center gap-1.5 bg-white dark:bg-[#0E121B] border border-blue-500 rounded-lg px-2 py-1 shadow-md"
            style={{
              left: Math.min(stageSize.width - 210, Math.max(8, textInputPos.x * scale)),
              top: Math.min(stageSize.height - 44, Math.max(8, textInputPos.y * scale)),
            }}
          >
            <input
              type="text"
              autoFocus
              value={textDraft}
              onChange={(e) => setTextDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCommitText();
                } else if (e.key === 'Escape') {
                  setTextInputPos(null);
                  setTextDraft('');
                }
              }}
              placeholder="Type note & press Enter"
              className="w-40 text-xs bg-transparent text-slate-900 dark:text-white focus:outline-none"
            />
            <button
              type="button"
              onClick={handleCommitText}
              className="px-2 py-0.5 rounded bg-blue-600 text-white text-[11px] font-medium"
            >
              Add
            </button>
          </div>
        )}
      </div>

      <div className="px-3.5 py-2 border-t border-slate-200/80 dark:border-white/[0.08] bg-slate-50/80 dark:bg-[#0B1018] flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
        <span>
          Shared canvas · <span className="tabular-nums font-medium">{strokes.length}</span> annotations synced
        </span>
        <span>
          {tool === 'text' ? 'Click anywhere on canvas to type' : 'Drag on canvas to draw live for all peers'}
        </span>
      </div>
    </div>
  );
};
