import PDFDocument from 'pdfkit';

export type Doc = InstanceType<typeof PDFDocument>;

export const PAGE = { width: 612, height: 792, margin: 40 } as const;
export const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;
export const BOTTOM = PAGE.height - PAGE.margin;

export const COLOR = {
  ink: '#111827',
  muted: '#4b5563',
  line: '#9ca3af',
  head: '#e5e7eb',
  band: '#f3f4f6',
  fail: '#b91c1c',
} as const;

export function newDoc(title: string, author = 'BNHS SHS Grading System'): Doc {
  return new PDFDocument({
    size: 'LETTER',
    margin: PAGE.margin,
    bufferPages: true,
    info: { Title: title, Author: author, Creator: 'BNHS SHS Grading System' },
  });
}

export interface Column {
  label: string;
  width: number;
  align?: 'left' | 'center' | 'right';
}

interface CellStyle {
  bold?: boolean;
  color?: string;
  fill?: string;
}

export interface RowOptions {
  size?: number;
  bold?: boolean;
  fill?: string;
  padY?: number;
  minH?: number;
  /** style per cell index */
  cellStyle?: Record<number, CellStyle>;
}

function fontFor(bold: boolean | undefined): string {
  return bold ? 'Helvetica-Bold' : 'Helvetica';
}

/** Draws one table row at (x, y). Returns its height. Cells wrap; row grows to the tallest cell. */
export function drawRow(doc: Doc, x: number, y: number, cols: Column[], cells: Array<string | number | null | undefined>, opts: RowOptions = {}): number {
  const size = opts.size ?? 8.5;
  const padX = 3;
  const padY = opts.padY ?? 3;
  let h = opts.minH ?? 0;
  cols.forEach((c, i) => {
    const st = opts.cellStyle?.[i];
    doc.font(fontFor(st?.bold ?? opts.bold)).fontSize(size);
    const text = cells[i] == null ? '' : String(cells[i]);
    h = Math.max(h, doc.heightOfString(text, { width: c.width - padX * 2 }) + padY * 2);
  });
  let cx = x;
  cols.forEach((c, i) => {
    const st = opts.cellStyle?.[i];
    const fill = st?.fill ?? opts.fill;
    if (fill) doc.save().rect(cx, y, c.width, h).fill(fill).restore();
    doc.lineWidth(0.5).strokeColor(COLOR.line).rect(cx, y, c.width, h).stroke();
    doc
      .font(fontFor(st?.bold ?? opts.bold))
      .fontSize(size)
      .fillColor(st?.color ?? COLOR.ink)
      .text(cells[i] == null ? '' : String(cells[i]), cx + padX, y + padY, {
        width: c.width - padX * 2,
        align: c.align ?? 'left',
        lineBreak: true,
      });
    cx += c.width;
  });
  doc.fillColor(COLOR.ink);
  return h;
}

export function headerRow(doc: Doc, x: number, y: number, cols: Column[], size = 8.5): number {
  return drawRow(
    doc,
    x,
    y,
    cols.map((c) => ({ ...c, align: 'center' as const })),
    cols.map((c) => c.label),
    { size, bold: true, fill: COLOR.head },
  );
}

export function centered(doc: Doc, text: string, y: number, size: number, bold = false, color: string = COLOR.ink): number {
  doc.font(fontFor(bold)).fontSize(size).fillColor(color);
  const h = doc.heightOfString(text, { width: CONTENT_WIDTH, align: 'center' });
  doc.text(text, PAGE.margin, y, { width: CONTENT_WIDTH, align: 'center' });
  doc.fillColor(COLOR.ink);
  return h;
}

export function labelValue(doc: Doc, x: number, y: number, label: string, value: string, labelW: number, valueW: number, size = 9): void {
  doc.font('Helvetica').fontSize(size).fillColor(COLOR.muted).text(label, x, y, { width: labelW, lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(size).fillColor(COLOR.ink).text(value || '-', x + labelW, y, { width: valueW, lineBreak: false, ellipsis: true });
}

export function sectionTitle(doc: Doc, text: string, y: number): number {
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLOR.ink).text(text.toUpperCase(), PAGE.margin, y, { width: CONTENT_WIDTH });
  return 15;
}

export function signatureLine(doc: Doc, x: number, y: number, width: number, name: string, caption: string): void {
  doc.lineWidth(0.6).strokeColor(COLOR.ink).moveTo(x, y).lineTo(x + width, y).stroke();
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR.ink).text(name || ' ', x, y - 13, { width, align: 'center', lineBreak: false });
  doc.font('Helvetica').fontSize(8).fillColor(COLOR.muted).text(caption, x, y + 3, { width, align: 'center' });
  doc.fillColor(COLOR.ink);
}

/** Faint diagonal text across the page, used on unofficial (draft) printouts. */
export function watermark(doc: Doc, text: string): void {
  doc.save();
  doc.rotate(-35, { origin: [PAGE.width / 2, PAGE.height / 2] });
  doc.fillColor('#dc2626').opacity(0.09).font('Helvetica-Bold').fontSize(64);
  doc.text(text, 0, PAGE.height / 2 - 30, { width: PAGE.width, align: 'center', lineBreak: false });
  doc.opacity(1).restore();
}

export function logoBuffer(dataUrl: string | null | undefined): Buffer | null {
  if (!dataUrl) return null;
  const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(dataUrl);
  return m ? Buffer.from(m[2]!, 'base64') : null;
}

export function ageOn(birth: string, on: Date): number {
  const b = new Date(`${birth}T00:00:00Z`);
  let age = on.getUTCFullYear() - b.getUTCFullYear();
  const beforeBirthday =
    on.getUTCMonth() < b.getUTCMonth() || (on.getUTCMonth() === b.getUTCMonth() && on.getUTCDate() < b.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function ordinalSemester(s: number): string {
  return s === 1 ? '1st Semester' : '2nd Semester';
}
