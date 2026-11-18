import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CameraOff,
  Check,
  Loader2,
  RefreshCw,
  RotateCcw,
  SwitchCamera,
  X,
} from 'lucide-react';

interface ProfileCameraModalProps {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => Promise<void> | void;
}

export const ProfileCameraModal: React.FC<ProfileCameraModalProps> = ({
  open,
  onClose,
  onCapture,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraState, setCameraState] = useState<
    'idle' | 'starting' | 'active' | 'denied' | 'unavailable' | 'error'
  >('idle');
  const [cameraError, setCameraError] = useState('');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [videoDeviceCount, setVideoDeviceCount] = useState(0);

  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [savingCapture, setSavingCapture] = useState(false);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const clearPreview = useCallback(() => {
    setCapturedPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setCapturedBlob(null);
  }, []);

  const startCamera = useCallback(
    async (overrideFacing?: 'user' | 'environment') => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraState('unavailable');
        setCameraError(
          'Camera access is unavailable in this browser context. Upload an image file instead.'
        );
        return;
      }

      stopCamera();
      clearPreview();
      setCameraState('starting');
      setCameraError('');

      const targetFacing = overrideFacing ?? facingMode;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: targetFacing },
            width: { ideal: 960 },
            height: { ideal: 960 },
          },
          audio: false,
        });

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          setVideoDeviceCount(devices.filter((d) => d.kind === 'videoinput').length);
        } catch {
          // Optional device enumeration
        }

        setCameraState('active');
      } catch (err) {
        stopCamera();
        const name = err instanceof DOMException ? err.name : '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setCameraState('denied');
          setCameraError(
            'Camera permission was denied. Allow camera access in your browser settings and retry.'
          );
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setCameraState('unavailable');
          setCameraError(
            'No camera device was detected. Close this window and drop or browse an image file.'
          );
        } else if (name === 'NotReadableError' || name === 'TrackStartError') {
          setCameraState('error');
          setCameraError(
            'Your camera is currently busy in another app. Close other camera apps and retry.'
          );
        } else {
          setCameraState('error');
          setCameraError(
            err instanceof Error ? err.message : 'Unable to start device camera.'
          );
        }
      }
    },
    [facingMode, stopCamera, clearPreview]
  );

  useEffect(() => {
    if (open) {
      void startCamera('user');
    } else {
      stopCamera();
      clearPreview();
      setCameraState('idle');
      setSavingCapture(false);
    }
  }, [open, startCamera, stopCamera, clearPreview]);

  useEffect(() => {
    return () => {
      stopCamera();
      clearPreview();
    };
  }, [stopCamera, clearPreview]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !savingCapture) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, savingCapture, onClose]);

  const handleCaptureFrame = () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;

    const side = Math.min(vw, vh);
    const sx = Math.round((vw - side) / 2);
    const sy = Math.round((vh - side) / 2);

    const canvas = document.createElement('canvas');
    const outputSize = 640;
    canvas.width = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (facingMode === 'user') {
      ctx.translate(outputSize, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, sx, sy, side, side, 0, 0, outputSize, outputSize);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const previewUrl = URL.createObjectURL(blob);
        setCapturedBlob(blob);
        setCapturedPreviewUrl(previewUrl);
        stopCamera();
        setCameraState('idle');
      },
      'image/jpeg',
      0.92
    );
  };

  const handleConfirmPhoto = async () => {
    if (!capturedBlob || savingCapture) return;
    setSavingCapture(true);
    try {
      const file = new File([capturedBlob], `profile_camera_${Date.now()}.jpg`, {
        type: 'image/jpeg',
      });
      await onCapture(file);
      onClose();
    } catch (err) {
      setCameraState('error');
      setCameraError(err instanceof Error ? err.message : 'Failed to save captured photo.');
    } finally {
      setSavingCapture(false);
    }
  };

  const handleSwitchCamera = () => {
    const next = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(next);
    void startCamera(next);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 cc-modal-backdrop"
      onClick={() => {
        if (!savingCapture) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-camera-modal-title"
        className="w-full max-w-md cc-modal overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200/80 dark:border-white/[0.08]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[var(--cc-accent-light)] border border-[var(--cc-accent-subtle)] flex items-center justify-center text-[var(--cc-accent)] shrink-0">
              <Camera className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3
                id="profile-camera-modal-title"
                className="font-display text-base font-semibold text-slate-900 dark:text-white"
              >
                Take Profile Photo
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Center your face inside the square frame and capture
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={savingCapture}
            onClick={onClose}
            aria-label="Close camera modal"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          {/* Square Viewfinder or Captured Preview */}
          <div className="relative aspect-square w-full max-w-[320px] mx-auto rounded-2xl overflow-hidden bg-slate-950 border border-slate-200/80 dark:border-white/[0.12] flex items-center justify-center">
            {capturedPreviewUrl ? (
              <img
                src={capturedPreviewUrl}
                alt="Captured profile preview"
                className="w-full h-full object-cover"
              />
            ) : (
              <>
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${
                    facingMode === 'user' ? 'scale-x-[-1]' : ''
                  } ${cameraState === 'active' ? 'opacity-100' : 'opacity-0'}`}
                />

                {cameraState === 'active' && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-4 rounded-xl border border-white/40"
                  />
                )}

                {cameraState === 'starting' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-200 text-xs">
                    <Loader2 className="w-6 h-6 animate-spin text-[var(--cc-accent)]" />
                    <span>Starting camera...</span>
                  </div>
                )}

                {(cameraState === 'denied' ||
                  cameraState === 'unavailable' ||
                  cameraState === 'error') && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-5 text-center">
                    <div className="w-11 h-11 rounded-xl bg-red-500/15 text-red-400 flex items-center justify-center">
                      {cameraState === 'denied' ? (
                        <CameraOff className="w-5 h-5" />
                      ) : (
                        <AlertTriangle className="w-5 h-5" />
                      )}
                    </div>
                    <p className="text-xs text-slate-200 leading-relaxed">{cameraError}</p>
                    <button
                      type="button"
                      onClick={() => void startCamera()}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Retry Camera
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
            {capturedPreviewUrl ? (
              <>
                <button
                  type="button"
                  disabled={savingCapture}
                  onClick={() => void startCamera()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl cc-btn-secondary text-xs font-medium text-slate-700 dark:text-slate-200"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Retake
                </button>
                <button
                  type="button"
                  disabled={savingCapture}
                  onClick={handleConfirmPhoto}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl cc-btn-primary text-xs font-semibold disabled:opacity-60"
                >
                  {savingCapture ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Saving Photo...
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Use Photo
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  {videoDeviceCount > 1 && cameraState === 'active' && (
                    <button
                      type="button"
                      onClick={handleSwitchCamera}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl cc-btn-secondary text-xs font-medium text-slate-700 dark:text-slate-200"
                    >
                      <SwitchCamera className="w-3.5 h-3.5" />
                      Flip Camera
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/[0.1] text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={cameraState !== 'active'}
                    onClick={handleCaptureFrame}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl cc-btn-primary text-xs font-semibold disabled:opacity-50"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    Capture Photo
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
