import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import jsQR from 'jsqr';
import {
  AlertTriangle,
  Camera,
  CameraOff,
  CheckCircle2,
  Download,
  Flashlight,
  ImageUp,
  Keyboard,
  Loader2,
  QrCode,
  RefreshCw,
  SwitchCamera,
  X,
} from 'lucide-react';
import { useCampus } from '../context/CampusContext';
import {
  decodeQrFromImageFile,
  encodeAttendanceQrPayload,
  generateQrDataUrl,
  parseAttendanceQrString,
  type ParsedQrCheckIn,
} from '../lib/attendanceQr';

interface QrAttendanceScannerModalProps {
  open: boolean;
  initialTab?: 'scan' | 'generate';
  onClose: () => void;
  onCheckInSuccess?: (summary: {
    title: string;
    kind: 'class' | 'event';
    message: string;
    updatedPercentage?: number;
  }) => void;
}

export const QrAttendanceScannerModal: React.FC<QrAttendanceScannerModalProps> = ({
  open,
  initialTab = 'scan',
  onClose,
  onCheckInSuccess,
}) => {
  const { subjects, activeRoleView, checkInWithQr } = useCampus();

  const [tab, setTab] = useState<'scan' | 'generate'>(initialTab);

  // Camera & scanner state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFrameCheckRef = useRef<number>(0);

  const [cameraState, setCameraState] = useState<
    'idle' | 'starting' | 'active' | 'denied' | 'unavailable' | 'error'
  >('idle');
  const [cameraError, setCameraError] = useState<string>('');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  // Parsed & Check-in submission state
  const [parsedQr, setParsedQr] = useState<ParsedQrCheckIn | null>(null);
  const [parseError, setParseError] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [checkInOutcome, setCheckInOutcome] = useState<{
    status: 'checked-in' | 'duplicate' | 'error';
    message: string;
    updatedPercentage?: number;
  } | null>(null);

  // Manual & Image fallback state
  const [manualInputOpen, setManualInputOpen] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [decodingImage, setDecodingImage] = useState(false);

  // QR Pass Generator state
  const [genKind, setGenKind] = useState<'class' | 'event'>('class');
  const [genSubjectId, setGenSubjectId] = useState<string>(subjects[0]?.id || '');
  const [genEventTitle, setGenEventTitle] = useState('Campus Tech Symposium & Workshop');
  const [genVenue, setGenVenue] = useState('Block A · Lecture Hall 302');
  const [genValidMinutes, setGenValidMinutes] = useState<number>(30);
  const [genSessionSalt, setGenSessionSalt] = useState<string>(() =>
    Math.random().toString(36).slice(2, 7).toUpperCase()
  );
  const [qrImageUrl, setQrImageUrl] = useState<string>('');

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setTorchOn(false);
    setTorchSupported(false);
  }, []);

  // Reset tab when modal opens
  useEffect(() => {
    if (open) {
      setTab(initialTab);
      setParsedQr(null);
      setParseError('');
      setCheckInOutcome(null);
    } else {
      stopCamera();
      setCameraState('idle');
    }
  }, [open, initialTab, stopCamera]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleDecodedRawText = useCallback(
    (rawText: string) => {
      const result = parseAttendanceQrString(rawText, subjects);
      if (result.ok) {
        setParsedQr(result.data);
        setParseError('');
        setCheckInOutcome(null);
        stopCamera();
        setCameraState('idle');
      } else {
        setParseError(result.error);
      }
    },
    [subjects, stopCamera]
  );

  const startCamera = useCallback(
    async (overrideDeviceId?: string, overrideFacing?: 'environment' | 'user') => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraState('unavailable');
        setCameraError(
          'Camera access is not available in this browser context. Use "Upload QR Image" or "Enter Code" below.'
        );
        return;
      }

      stopCamera();
      setCameraState('starting');
      setCameraError('');

      const targetDevice = overrideDeviceId ?? selectedDeviceId;
      const targetFacing = overrideFacing ?? facingMode;

      const videoConstraints: MediaTrackConstraints = targetDevice
        ? {
            deviceId: { exact: targetDevice },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          }
        : {
            facingMode: { ideal: targetFacing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          };

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        });

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const track = stream.getVideoTracks()[0];
        if (track && typeof track.getCapabilities === 'function') {
          const caps = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
          setTorchSupported(Boolean(caps?.torch));
        }

        try {
          const allDevices = await navigator.mediaDevices.enumerateDevices();
          const cams = allDevices.filter((d) => d.kind === 'videoinput');
          setVideoDevices(cams);
          const activeDeviceId = track?.getSettings().deviceId || '';
          if (activeDeviceId && !selectedDeviceId) {
            setSelectedDeviceId(activeDeviceId);
          }
        } catch {
          // enumerateDevices optional
        }

        setCameraState('active');
      } catch (err) {
        stopCamera();
        const name = err instanceof DOMException ? err.name : '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setCameraState('denied');
          setCameraError(
            'Camera permission was denied. Allow camera access in your browser address bar, or upload a QR image below.'
          );
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setCameraState('unavailable');
          setCameraError(
            'No camera device was detected on this device. You can upload a QR screenshot or enter a class code below.'
          );
        } else if (name === 'NotReadableError' || name === 'TrackStartError') {
          setCameraState('error');
          setCameraError(
            'Your camera is currently in use by another application. Close other camera apps and retry.'
          );
        } else {
          setCameraState('error');
          setCameraError(
            err instanceof Error
              ? err.message
              : 'Unable to start camera stream. Try uploading a QR image instead.'
          );
        }
      }
    },
    [facingMode, selectedDeviceId, stopCamera]
  );

  // Start camera automatically when scan tab opens without a parsed result
  useEffect(() => {
    if (!open || tab !== 'scan' || parsedQr || checkInOutcome) {
      if (tab !== 'scan') stopCamera();
      return;
    }
    void startCamera();
    return () => {
      stopCamera();
    };
  }, [open, tab, parsedQr, checkInOutcome, startCamera, stopCamera]);

  // Continuous QR frame scanning loop
  useEffect(() => {
    if (cameraState !== 'active' || !open || tab !== 'scan' || parsedQr) {
      return;
    }

    let cancelled = false;

    const scanTick = (timestamp: number) => {
      if (cancelled) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (
        video &&
        canvas &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        video.videoWidth > 0 &&
        video.videoHeight > 0 &&
        timestamp - lastFrameCheckRef.current >= 95
      ) {
        lastFrameCheckRef.current = timestamp;
        const maxScanWidth = 640;
        const scale = Math.min(1, maxScanWidth / video.videoWidth);
        const w = Math.max(1, Math.round(video.videoWidth * scale));
        const h = Math.max(1, Math.round(video.videoHeight * scale));

        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, w, h);
          const frame = ctx.getImageData(0, 0, w, h);
          const result = jsQR(frame.data, frame.width, frame.height, {
            inversionAttempts: 'dontInvert',
          });
          if (result && result.data) {
            handleDecodedRawText(result.data);
            return;
          }
        }
      }

      rafRef.current = requestAnimationFrame(scanTick);
    };

    rafRef.current = requestAnimationFrame(scanTick);
    return () => {
      cancelled = true;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [cameraState, open, tab, parsedQr, handleDecodedRawText]);

  const handleToggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      const next = !torchOn;
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  };

  const handleFlipCamera = () => {
    const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextFacing);
    setSelectedDeviceId('');
    void startCamera('', nextFacing);
  };

  const handleSelectCameraDevice = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    void startCamera(deviceId);
  };

  const handleImageFileUpload = async (file: File | null) => {
    if (!file) return;
    setDecodingImage(true);
    setParseError('');
    try {
      const text = await decodeQrFromImageFile(file);
      if (!text) {
        setParseError('No readable QR code was found in that image. Try a clearer crop or brighter photo.');
      } else {
        handleDecodedRawText(text);
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to read image file.');
    } finally {
      setDecodingImage(false);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    handleDecodedRawText(manualCode);
  };

  const handleConfirmCheckIn = async () => {
    if (!parsedQr) return;
    setSubmitting(true);
    try {
      const outcome = await checkInWithQr(parsedQr);
      setCheckInOutcome(outcome);
      if (outcome.status === 'checked-in') {
        onCheckInSuccess?.({
          title: parsedQr.title,
          kind: parsedQr.kind,
          message: outcome.message,
          updatedPercentage: outcome.updatedPercentage,
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetScan = () => {
    setParsedQr(null);
    setParseError('');
    setCheckInOutcome(null);
    setTab('scan');
  };

  // Build QR Generator payload
  const generatedPayloadText = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const expiresAt =
      genValidMinutes > 0
        ? new Date(Date.now() + genValidMinutes * 60_000).toISOString()
        : undefined;

    if (genKind === 'class') {
      const sub = subjects.find((s) => s.id === genSubjectId) || subjects[0];
      return encodeAttendanceQrPayload({
        v: 1,
        kind: 'class',
        sessionId: `cls_${sub?.code || 'SUB'}_${today}_${genSessionSalt}`,
        title: sub ? `${sub.code} · ${sub.name}` : 'Lecture Session',
        subjectId: sub?.id,
        subjectCode: sub?.code,
        subjectName: sub?.name,
        venue: genVenue.trim() || 'Classroom',
        date: today,
        expiresAt,
      });
    }

    return encodeAttendanceQrPayload({
      v: 1,
      kind: 'event',
      sessionId: `evt_${today}_${genSessionSalt}`,
      title: genEventTitle.trim() || 'SKU Campus Event',
      venue: genVenue.trim() || 'Main Auditorium',
      date: today,
      expiresAt,
    });
  }, [genKind, genSubjectId, subjects, genEventTitle, genVenue, genValidMinutes, genSessionSalt]);

  useEffect(() => {
    if (!open || tab !== 'generate') return;
    let cancelled = false;
    void generateQrDataUrl(generatedPayloadText).then((url) => {
      if (!cancelled) setQrImageUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [open, tab, generatedPayloadText]);

  const handleDownloadGeneratedQr = () => {
    if (!qrImageUrl) return;
    const link = document.createElement('a');
    link.href = qrImageUrl;
    link.download = `sku-campus-qr-${genKind}-${new Date().toISOString().slice(0, 10)}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 cc-modal-backdrop"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="qr-attendance-modal-title"
        className="w-full max-w-2xl cc-modal overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-slate-200/80 dark:border-white/[0.08]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[var(--cc-accent-light)] border border-[var(--cc-accent-subtle)] flex items-center justify-center text-[var(--cc-accent)] shrink-0">
              <QrCode className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3
                id="qr-attendance-modal-title"
                className="font-display text-base font-semibold text-slate-900 dark:text-white truncate"
              >
                QR Attendance Check-In
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                Scan class lecture or campus event QR passes via camera
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="cc-segmented inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => setTab('scan')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  tab === 'scan'
                    ? 'bg-white dark:bg-[#0B1018] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Camera Scan
              </button>
              <button
                type="button"
                onClick={() => setTab('generate')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  tab === 'generate'
                    ? 'bg-white dark:bg-[#0B1018] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {activeRoleView === 'student' ? 'QR Pass Studio' : 'Create Session QR'}
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close QR scanner modal"
              className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
          {tab === 'scan' ? (
            <>
              {/* Outcome Banner */}
              {checkInOutcome && (
                <div
                  className={`p-4 rounded-xl border space-y-3 ${
                    checkInOutcome.status === 'checked-in'
                      ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60 text-emerald-900 dark:text-emerald-200'
                      : checkInOutcome.status === 'duplicate'
                      ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200'
                      : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/60 text-red-900 dark:text-red-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {checkInOutcome.status === 'checked-in' ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-1 min-w-0">
                      <p className="font-display text-sm font-semibold">
                        {checkInOutcome.status === 'checked-in'
                          ? 'Attendance Recorded'
                          : checkInOutcome.status === 'duplicate'
                          ? 'Already Checked In'
                          : 'Check-In Failed'}
                      </p>
                      <p className="text-xs leading-relaxed">{checkInOutcome.message}</p>
                      {typeof checkInOutcome.updatedPercentage === 'number' && (
                        <p className="text-xs font-mono font-semibold tabular-nums">
                          Updated Subject Attendance: {checkInOutcome.updatedPercentage}%
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleResetScan}
                      className="px-3.5 py-2 rounded-xl border border-current/20 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                    >
                      Scan Another QR
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold transition-colors"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}

              {/* Parsed QR Confirmation Card */}
              {parsedQr && !checkInOutcome && (
                <div className="cc-inset p-4 sm:p-5 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <p className="text-xs font-medium text-[var(--cc-accent)]">
                        {parsedQr.kind === 'class' ? 'Class Lecture Check-In' : 'Campus Event Check-In'}
                        <span className="text-slate-400 mx-1.5">·</span>
                        <span className="font-mono">{parsedQr.subjectCode}</span>
                      </p>
                      <h4 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                        {parsedQr.title}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Venue: {parsedQr.venue} · Date: <span className="font-mono tabular-nums">{parsedQr.date}</span>
                      </p>
                    </div>
                    <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500">
                      ID: {parsedQr.sessionId}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {parsedQr.kind === 'class'
                      ? 'Confirming will mark +1 Present in your personal subject attendance tracker and record a verified QR session log.'
                      : 'Confirming will log your verified campus event attendance in your Attendance History without changing subject lecture ratios.'}
                  </p>

                  <div className="flex flex-wrap items-center justify-end gap-2.5">
                    <button
                      type="button"
                      onClick={handleResetScan}
                      className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-white/[0.1] text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
                    >
                      Rescan
                    </button>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={handleConfirmCheckIn}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-semibold transition-colors"
                    >
                      {submitting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      )}
                      {submitting ? 'Checking In...' : 'Confirm & Mark Present'}
                    </button>
                  </div>
                </div>
              )}

              {/* Camera Viewport */}
              {!parsedQr && !checkInOutcome && (
                <div className="space-y-4">
                  <div className="relative rounded-2xl overflow-hidden bg-[#07090E] border border-slate-200/80 dark:border-white/[0.1] aspect-[4/3] sm:aspect-video flex items-center justify-center">
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      autoPlay
                      className={`w-full h-full object-cover ${
                        cameraState === 'active' ? 'opacity-100' : 'opacity-0 pointer-events-none'
                      }`}
                    />
                    <canvas ref={canvasRef} className="hidden" aria-hidden="true" />

                    {/* Scan reticle overlay when camera is active */}
                    {cameraState === 'active' && (
                      <div
                        className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center"
                        aria-hidden="true"
                      >
                        <div className="w-48 h-48 sm:w-56 sm:h-56 relative">
                          <span className="absolute top-0 left-0 w-7 h-7 border-t-2 border-l-2 border-white rounded-tl-lg" />
                          <span className="absolute top-0 right-0 w-7 h-7 border-t-2 border-r-2 border-white rounded-tr-lg" />
                          <span className="absolute bottom-0 left-0 w-7 h-7 border-b-2 border-l-2 border-white rounded-bl-lg" />
                          <span className="absolute bottom-0 right-0 w-7 h-7 border-b-2 border-r-2 border-white rounded-br-lg" />
                        </div>
                        <p className="mt-4 px-3 py-1 rounded-lg bg-black/60 text-[11px] font-medium text-white backdrop-blur-xs">
                          Align QR code inside the frame
                        </p>
                      </div>
                    )}

                    {/* Starting / Unavailable / Error states */}
                    {cameraState === 'starting' && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-300 p-6 text-center">
                        <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                        <p className="text-xs font-medium">Requesting camera access...</p>
                      </div>
                    )}

                    {(cameraState === 'denied' ||
                      cameraState === 'unavailable' ||
                      cameraState === 'error' ||
                      cameraState === 'idle') && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-300 p-6 text-center max-w-md mx-auto">
                        <div className="w-11 h-11 rounded-xl bg-white/[0.08] border border-white/[0.12] flex items-center justify-center text-slate-200">
                          {cameraState === 'idle' ? (
                            <Camera className="w-5 h-5" />
                          ) : (
                            <CameraOff className="w-5 h-5 text-amber-400" />
                          )}
                        </div>
                        <div className="space-y-1">
                          <p className="font-display text-sm font-semibold text-white">
                            {cameraState === 'denied'
                              ? 'Camera Permission Required'
                              : cameraState === 'unavailable'
                              ? 'Camera Not Detected'
                              : cameraState === 'error'
                              ? 'Camera Unavailable'
                              : 'Camera Paused'}
                          </p>
                          <p className="text-xs text-slate-400 leading-relaxed">
                            {cameraError || 'Enable your device camera to scan class or event QR passes.'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void startCamera()}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Retry Camera
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Camera Controls & Fallbacks */}
                  <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      {cameraState === 'active' ? (
                        <button
                          type="button"
                          onClick={() => {
                            stopCamera();
                            setCameraState('idle');
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/[0.1] text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-colors"
                        >
                          <CameraOff className="w-3.5 h-3.5" />
                          Pause Camera
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void startCamera()}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/[0.1] text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-colors"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          Start Camera
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={handleFlipCamera}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/[0.1] text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-colors"
                      >
                        <SwitchCamera className="w-3.5 h-3.5" />
                        Switch Lens
                      </button>

                      {torchSupported && (
                        <button
                          type="button"
                          onClick={handleToggleTorch}
                          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-colors ${
                            torchOn
                              ? 'bg-amber-500 border-amber-500 text-white'
                              : 'border-slate-200 dark:border-white/[0.1] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.05]'
                          }`}
                        >
                          <Flashlight className="w-3.5 h-3.5" />
                          {torchOn ? 'Flash On' : 'Flash'}
                        </button>
                      )}

                      {videoDevices.length > 1 && (
                        <select
                          aria-label="Select camera device"
                          value={selectedDeviceId}
                          onChange={(e) => handleSelectCameraDevice(e.target.value)}
                          className="px-2.5 py-2 text-xs cc-input max-w-[180px]"
                        >
                          {videoDevices.map((dev, i) => (
                            <option key={dev.deviceId} value={dev.deviceId}>
                              {dev.label || `Camera ${i + 1}`}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/[0.1] text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.05] cursor-pointer transition-colors">
                        {decodingImage ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <ImageUp className="w-3.5 h-3.5" />
                        )}
                        Upload QR Image
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          onChange={(e) => {
                            void handleImageFileUpload(e.target.files?.[0] || null);
                            e.target.value = '';
                          }}
                          className="hidden"
                        />
                      </label>

                      <button
                        type="button"
                        onClick={() => setManualInputOpen((v) => !v)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/[0.1] text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-colors"
                      >
                        <Keyboard className="w-3.5 h-3.5" />
                        Enter Code
                      </button>
                    </div>
                  </div>

                  {parseError && (
                    <div
                      role="alert"
                      className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300 flex items-start gap-2"
                    >
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{parseError}</span>
                    </div>
                  )}

                  {manualInputOpen && (
                    <form onSubmit={handleManualSubmit} className="cc-inset p-3.5 space-y-2.5">
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                        Paste QR payload, check-in link, or subject code (e.g.{' '}
                        <span className="font-mono">{subjects[0]?.code || 'CS501'}</span>)
                      </label>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          value={manualCode}
                          onChange={(e) => setManualCode(e.target.value)}
                          placeholder={`CLASS:${subjects[0]?.code || 'CS501'}:Room 302`}
                          className="flex-1 px-3 py-2 text-xs font-mono cc-input"
                        />
                        <button
                          type="submit"
                          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shrink-0 transition-colors"
                        >
                          Verify Code
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </>
          ) : (
            /* TAB 2: CREATE / TEST CLASS OR EVENT QR PASS */
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
              <div className="md:col-span-7 space-y-3.5 min-w-0">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Pass Type
                  </label>
                  <div className="grid grid-cols-2 gap-1 cc-segmented">
                    <button
                      type="button"
                      onClick={() => setGenKind('class')}
                      className={`py-1.5 text-xs font-medium rounded-lg transition-colors ${
                        genKind === 'class'
                          ? 'bg-white dark:bg-[#0B1018] text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Class Lecture
                    </button>
                    <button
                      type="button"
                      onClick={() => setGenKind('event')}
                      className={`py-1.5 text-xs font-medium rounded-lg transition-colors ${
                        genKind === 'event'
                          ? 'bg-white dark:bg-[#0B1018] text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Campus Event
                    </button>
                  </div>
                </div>

                {genKind === 'class' ? (
                  <div>
                    <label className="block text-xs font-medium mb-1">Subject</label>
                    <select
                      value={genSubjectId}
                      onChange={(e) => setGenSubjectId(e.target.value)}
                      className="w-full px-3 py-2 text-sm cc-input"
                    >
                      {subjects.map((sub) => (
                        <option key={sub.id} value={sub.id}>
                          {sub.code} · {sub.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium mb-1">Event Name</label>
                    <input
                      type="text"
                      value={genEventTitle}
                      onChange={(e) => setGenEventTitle(e.target.value)}
                      placeholder="e.g. Annual AI Workshop"
                      className="w-full px-3 py-2 text-sm cc-input"
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Room / Venue</label>
                    <input
                      type="text"
                      value={genVenue}
                      onChange={(e) => setGenVenue(e.target.value)}
                      placeholder="Block A · Room 302"
                      className="w-full px-3 py-2 text-sm cc-input"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Validity Window</label>
                    <select
                      value={genValidMinutes}
                      onChange={(e) => setGenValidMinutes(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm cc-input"
                    >
                      <option value={15}>15 Minutes</option>
                      <option value={30}>30 Minutes</option>
                      <option value={60}>1 Hour</option>
                      <option value={0}>No Expiry</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      setGenSessionSalt(Math.random().toString(36).slice(2, 7).toUpperCase())
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/[0.1] text-xs font-medium hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Rotate Session ID
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTab('scan');
                      handleDecodedRawText(generatedPayloadText);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Test Check-In With This Pass
                  </button>
                </div>
              </div>

              <div className="md:col-span-5 cc-inset p-4 flex flex-col items-center text-center gap-3 min-w-0">
                {qrImageUrl ? (
                  <img
                    src={qrImageUrl}
                    alt="Generated SKU Campus attendance QR pass"
                    className="w-48 h-48 rounded-xl border border-slate-200 dark:border-white/[0.1] bg-white p-1.5"
                  />
                ) : (
                  <div className="w-48 h-48 rounded-xl bg-slate-100 dark:bg-white/[0.05] flex items-center justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                  </div>
                )}
                <div className="space-y-0.5 w-full">
                  <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                    {genKind === 'class'
                      ? subjects.find((s) => s.id === genSubjectId)?.name || 'Class Session'
                      : genEventTitle || 'Campus Event'}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {genVenue} · ID {genSessionSalt}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!qrImageUrl}
                  onClick={handleDownloadGeneratedQr}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download QR PNG
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
