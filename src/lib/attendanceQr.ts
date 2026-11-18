import jsQR from 'jsqr';
import QRCode from 'qrcode';
import type { Subject } from '../types/campus';

export interface AttendanceQrPayload {
  v: 1;
  kind: 'class' | 'event';
  sessionId: string;
  title: string;
  subjectId?: string;
  subjectCode?: string;
  subjectName?: string;
  venue?: string;
  date?: string;
  expiresAt?: string;
}

export interface ParsedQrCheckIn {
  raw: string;
  kind: 'class' | 'event';
  sessionId: string;
  title: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  venue: string;
  date: string;
  expiresAt?: string;
}

export type QrParseResult =
  | { ok: true; data: ParsedQrCheckIn }
  | { ok: false; error: string };

function safeSlug(input: string, maxLen = 40): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, maxLen) || 'session';
}

export function encodeAttendanceQrPayload(payload: AttendanceQrPayload): string {
  return JSON.stringify(payload);
}

export function parseAttendanceQrString(
  rawText: string,
  subjects: Subject[]
): QrParseResult {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { ok: false, error: 'Empty QR code data.' };
  }

  const today = new Date().toISOString().slice(0, 10);

  // 1. Structured JSON payload (SKU Campus QR v1)
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as Partial<AttendanceQrPayload>;
      if (parsed && (parsed.kind === 'class' || parsed.kind === 'event')) {
        if (parsed.expiresAt) {
          const expMs = Date.parse(parsed.expiresAt);
          if (Number.isFinite(expMs) && Date.now() > expMs) {
            return {
              ok: false,
              error: `This QR pass expired on ${new Date(expMs).toLocaleString()}. Ask your instructor for a fresh code.`,
            };
          }
        }

        const matchedSub = subjects.find(
          (s) =>
            (parsed.subjectId && s.id === parsed.subjectId) ||
            (parsed.subjectCode && s.code.toUpperCase() === parsed.subjectCode.toUpperCase())
        );

        const subjectId =
          parsed.kind === 'class'
            ? matchedSub?.id || parsed.subjectId || `sub_${safeSlug(parsed.subjectCode || parsed.title || 'class', 32)}`
            : `evt_${safeSlug(parsed.sessionId || parsed.title || 'event', 48)}`;

        const subjectCode =
          parsed.kind === 'class'
            ? matchedSub?.code || parsed.subjectCode || 'CLASS'
            : 'EVENT';

        const subjectName =
          parsed.kind === 'class'
            ? matchedSub?.name || parsed.subjectName || parsed.title || subjectCode
            : parsed.title || 'Campus Event';

        const sessionId = (parsed.sessionId || `${parsed.kind}_${today}_${safeSlug(subjectCode, 20)}`).slice(0, 48);

        return {
          ok: true,
          data: {
            raw: trimmed,
            kind: parsed.kind,
            sessionId,
            title: parsed.title || subjectName,
            subjectId,
            subjectCode,
            subjectName,
            venue: parsed.venue || 'SKU Campus',
            date: parsed.date || today,
            expiresAt: parsed.expiresAt,
          },
        };
      }
    } catch {
      return { ok: false, error: 'Scanned JSON QR code is malformed.' };
    }
  }

  // 2. URI / URL format (sku-campus://checkin?... or https://.../checkin?...)
  if (/^(sku-campus:\/\/|https?:\/\/)/i.test(trimmed)) {
    try {
      const normalized = trimmed.replace(/^sku-campus:\/\//i, 'https://sku.local/');
      const url = new URL(normalized);
      const kindParam = (url.searchParams.get('kind') || url.searchParams.get('type') || 'class').toLowerCase();
      const kind: 'class' | 'event' = kindParam === 'event' ? 'event' : 'class';
      const code = url.searchParams.get('code') || url.searchParams.get('subjectCode') || '';
      const subId = url.searchParams.get('subjectId') || '';
      const title = url.searchParams.get('title') || url.searchParams.get('name') || '';
      const venue = url.searchParams.get('venue') || url.searchParams.get('room') || 'SKU Campus';
      const sessionId =
        url.searchParams.get('sessionId') ||
        url.searchParams.get('sid') ||
        `${kind}_${today}_${safeSlug(code || title, 24)}`;
      const expiresAt = url.searchParams.get('expiresAt') || undefined;

      if (expiresAt) {
        const expMs = Date.parse(expiresAt);
        if (Number.isFinite(expMs) && Date.now() > expMs) {
          return { ok: false, error: 'This QR check-in link has expired.' };
        }
      }

      const matchedSub = subjects.find(
        (s) =>
          (subId && s.id === subId) ||
          (code && s.code.toUpperCase() === code.toUpperCase())
      );

      if (!matchedSub && !title && !code) {
        return { ok: false, error: 'QR link does not contain a valid class or event identifier.' };
      }

      const subjectName =
        kind === 'class'
          ? matchedSub?.name || title || code
          : title || 'Campus Event';

      return {
        ok: true,
        data: {
          raw: trimmed,
          kind,
          sessionId: sessionId.slice(0, 48),
          title: title || subjectName,
          subjectId:
            kind === 'class'
              ? matchedSub?.id || subId || `sub_${safeSlug(code || subjectName, 32)}`
              : `evt_${safeSlug(sessionId, 48)}`,
          subjectCode: kind === 'class' ? matchedSub?.code || code.toUpperCase() || 'CLASS' : 'EVENT',
          subjectName,
          venue,
          date: url.searchParams.get('date') || today,
          expiresAt,
        },
      };
    } catch {
      return { ok: false, error: 'Unable to parse QR check-in URL.' };
    }
  }

  // 3. Colon shorthand: CLASS:CS501:Room 302 or EVENT:Tech Fest:Auditorium
  const colonParts = trimmed.split(':').map((p) => p.trim());
  if (colonParts.length >= 2 && /^(class|event)$/i.test(colonParts[0])) {
    const kind = colonParts[0].toLowerCase() as 'class' | 'event';
    const target = colonParts[1];
    const venue = colonParts[2] || 'SKU Campus';
    const matchedSub =
      kind === 'class'
        ? subjects.find(
            (s) =>
              s.code.toUpperCase() === target.toUpperCase() ||
              s.id.toLowerCase() === target.toLowerCase()
          )
        : undefined;

    return {
      ok: true,
      data: {
        raw: trimmed,
        kind,
        sessionId: `${kind}_${today}_${safeSlug(target, 24)}`,
        title: matchedSub ? `${matchedSub.code} · ${matchedSub.name}` : target,
        subjectId:
          kind === 'class'
            ? matchedSub?.id || `sub_${safeSlug(target, 32)}`
            : `evt_${safeSlug(target, 40)}`,
        subjectCode: kind === 'class' ? matchedSub?.code || target.toUpperCase().slice(0, 16) : 'EVENT',
        subjectName: matchedSub?.name || target,
        venue,
        date: today,
      },
    };
  }

  // 4. Plain subject code match (e.g. "CS501" or "CS502")
  const matchedByCode = subjects.find(
    (s) =>
      s.code.toUpperCase() === trimmed.toUpperCase() ||
      s.id.toLowerCase() === trimmed.toLowerCase()
  );
  if (matchedByCode) {
    return {
      ok: true,
      data: {
        raw: trimmed,
        kind: 'class',
        sessionId: `class_${today}_${safeSlug(matchedByCode.code, 20)}`,
        title: `${matchedByCode.code} · ${matchedByCode.name}`,
        subjectId: matchedByCode.id,
        subjectCode: matchedByCode.code,
        subjectName: matchedByCode.name,
        venue: 'Classroom',
        date: today,
      },
    };
  }

  return {
    ok: false,
    error: `Unrecognized QR code ("${trimmed.slice(0, 48)}${trimmed.length > 48 ? '...' : ''}"). Scan an SKU Campus class/event QR pass or enter a subject code like ${subjects[0]?.code || 'CS501'}.`,
  };
}

export async function generateQrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    width: 320,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#0B1120',
      light: '#FFFFFF',
    },
  });
}

export async function decodeQrFromImageFile(file: File): Promise<string | null> {
  const imageUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not load selected image.'));
      el.src = imageUrl;
    });

    const maxDim = 1200;
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    const decoded = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'attemptBoth',
    });
    return decoded?.data || null;
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}
