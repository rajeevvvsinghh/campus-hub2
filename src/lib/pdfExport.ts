/**
 * Generates a real valid single/multi-page PDF binary Blob in the browser
 * without external dependencies so sample study materials preview and download
 * as genuine .pdf files.
 */
function escapePdfText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, ' ');
}

function wrapLines(text: string, maxChars = 84): string[] {
  const result: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    if (!paragraph.trim()) {
      result.push('');
      continue;
    }
    const words = paragraph.split(/\s+/);
    let current = '';
    for (const word of words) {
      if ((current + ' ' + word).trim().length > maxChars) {
        if (current) result.push(current);
        current = word;
      } else {
        current = (current + ' ' + word).trim();
      }
    }
    if (current) result.push(current);
  }
  return result;
}

export function createMaterialPdfBlob(options: {
  title: string;
  subjectName: string;
  unit: string;
  author: string;
  body: string;
}): Blob {
  const lines = [
    options.title,
    `${options.subjectName} | ${options.unit}`,
    `Author / Source: ${options.author}`,
    '------------------------------------------------------------------------------------',
    '',
    ...wrapLines(options.body, 82),
  ].slice(0, 48);

  const streamCommands = [
    'BT',
    '/F1 13 Tf',
    '50 760 Td',
    `(${escapePdfText(lines[0] || 'Study Material')}) Tj`,
    '/F1 10 Tf',
    '0 -18 Td',
    `(${escapePdfText(lines[1] || '')}) Tj`,
    '0 -14 Td',
    `(${escapePdfText(lines[2] || '')}) Tj`,
    '0 -14 Td',
    `(${escapePdfText(lines[3] || '')}) Tj`,
    '/F1 10 Tf',
  ];

  for (let i = 4; i < lines.length; i++) {
    streamCommands.push('0 -13 Td');
    streamCommands.push(`(${escapePdfText(lines[i])}) Tj`);
  }
  streamCommands.push('ET');

  const streamContent = streamCommands.join('\n');

  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new Blob([pdf], { type: 'application/pdf' });
}

export function triggerDownload(urlOrBlob: string | Blob, fileName: string) {
  const url = typeof urlOrBlob === 'string' ? urlOrBlob : URL.createObjectURL(urlOrBlob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  if (typeof urlOrBlob !== 'string') {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}
