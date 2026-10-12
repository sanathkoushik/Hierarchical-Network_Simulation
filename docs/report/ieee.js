// Helpers that produce IEEE conference-style formatting with docx-js.
const fs = require("fs");
const {
  Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, AlignmentType,
  BorderStyle, ShadingType, Tab, TabStopType, VerticalAlign, PageNumber, Footer,
} = require("docx");

const FONT = "Times New Roman";
const MONO = "Courier New";
const COLW = 5040; // one column in DXA (3.5 in)
const FULLW = 10440; // text width in DXA

// ---- inline markup: <i> <b> <tt> <sup> <sub>, and \t for tab stops -------------------
function runs(text, base = {}) {
  const out = [];
  const state = { i: false, b: false, tt: false, sup: false, sub: false };
  const parts = text.split(/(<\/?(?:i|b|tt|sup|sub)>)/);
  for (const part of parts) {
    const m = part.match(/^<(\/?)(i|b|tt|sup|sub)>$/);
    if (m) { state[m[2]] = m[1] === ""; continue; }
    if (part === "") continue;
    const pieces = part.split("\t");
    pieces.forEach((piece, idx) => {
      if (idx > 0) out.push(new TextRun({ children: [new Tab()], font: FONT, ...base }));
      if (piece === "") return;
      out.push(new TextRun({
        text: piece,
        font: state.tt ? MONO : FONT,
        italics: state.i || base.italics,
        bold: state.b || base.bold,
        superScript: state.sup,
        subScript: state.sub,
        size: base.size,
        smallCaps: base.smallCaps,
        color: base.color,
      }));
    });
  }
  return out;
}

const BODY = 20; // 10 pt in half-points

function body(text, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 60, line: 228 },
    indent: opts.noIndent ? undefined : { firstLine: 245 },
    children: runs(text, { size: BODY }),
    keepNext: opts.keepNext,
  });
}

function h1(roman, title) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 160, after: 80 },
    keepNext: true,
    children: runs(`${roman}.  ${title.toUpperCase()}`, { size: 18, smallCaps: false }),
  });
}

function h2(letter, title) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: 100, after: 50 },
    keepNext: true,
    children: runs(`${letter}.  ${title}`, { size: BODY, italics: true }),
  });
}

function bullets(items, ref = "bul") {
  return items.map((t) => new Paragraph({
    numbering: { reference: ref, level: 0 },
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 30, line: 228 },
    children: runs(t, { size: BODY }),
  }));
}

function numbered(items, ref = "num") {
  return items.map((t) => new Paragraph({
    numbering: { reference: ref, level: 0 },
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 30, line: 228 },
    children: runs(t, { size: BODY }),
  }));
}

// ---- figures ------------------------------------------------------------------------
function pngSize(path) {
  const b = fs.readFileSync(path);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

function figure(path, caption, widthIn = 3.4, type = "png") {
  const { w, h } = pngSize(path);
  const pxW = Math.round(widthIn * 96);
  const pxH = Math.round((pxW * h) / w);
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { before: 60, after: 30 }, keepNext: true,
      children: [new ImageRun({ type, data: fs.readFileSync(path), transformation: { width: pxW, height: pxH },
        altText: { title: caption.slice(0, 40), description: caption, name: "figure" } })],
    }),
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED, spacing: { after: 100 },
      children: runs(caption, { size: 16 }),
    }),
  ];
}

// ---- tables -------------------------------------------------------------------------
const THIN = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };

function tableCaption(num, title) {
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80, after: 0 }, keepNext: true,
      children: runs(`TABLE ${num}`, { size: 16 }) }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 50 }, keepNext: true,
      children: runs(title.toUpperCase(), { size: 16 }) }),
  ];
}

function table(widths, header, rows, opts = {}) {
  const total = widths.reduce((a, b) => a + b, 0);
  const size = opts.size || 16;
  const align = opts.align || widths.map((_, i) => (i === 0 ? AlignmentType.LEFT : AlignmentType.CENTER));
  const mkCell = (text, i, isHead, isLast) => new TableCell({
    width: { size: widths[i], type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 15, bottom: 15, left: 50, right: 50 },
    borders: {
      top: isHead ? THIN : NONE, bottom: isHead || isLast ? THIN : NONE, left: NONE, right: NONE,
    },
    children: [new Paragraph({
      alignment: isHead ? AlignmentType.CENTER : align[i], spacing: { after: 0 },
      children: runs(String(text), { size, bold: isHead }),
    })],
  });
  const trs = [new TableRow({ tableHeader: true, cantSplit: true,
    children: header.map((t, i) => mkCell(t, i, true, false)) })];
  rows.forEach((r, ri) => trs.push(new TableRow({ cantSplit: true,
    children: r.map((t, i) => mkCell(t, i, false, ri === rows.length - 1)) })));
  return new Table({
    width: { size: total, type: WidthType.DXA }, columnWidths: widths,
    alignment: AlignmentType.CENTER,
    borders: { top: THIN, bottom: THIN, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE },
    rows: trs,
  });
}

function spacer(after = 80) {
  return new Paragraph({ spacing: { after }, children: [] });
}

// ---- equations and listings -------------------------------------------------------------
function equation(text, num) {
  return new Paragraph({
    spacing: { before: 40, after: 60 },
    tabStops: [{ type: TabStopType.CENTER, position: COLW / 2 }, { type: TabStopType.RIGHT, position: COLW }],
    children: runs(`\t${text}\t(${num})`, { size: BODY }),
  });
}

function listing(title, lines) {
  const box = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
  const out = [new Paragraph({ spacing: { before: 60, after: 20 }, keepNext: true,
    children: runs(title, { size: 16, bold: true }) })];
  lines.forEach((ln, idx) => out.push(new Paragraph({
    spacing: { after: 0, line: 200 },
    keepNext: idx < lines.length - 1,
    border: {
      top: idx === 0 ? box : undefined, bottom: idx === lines.length - 1 ? box : undefined,
      left: box, right: box,
    },
    children: runs(ln.replace(/ /g, " "), { size: 15 }).map((r) => r),
  })));
  out.push(spacer(80));
  return out;
}

function pageFooter() {
  return new Footer({
    children: [new Paragraph({ alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16 })] })],
  });
}

module.exports = {
  FONT, COLW, FULLW, runs, body, h1, h2, bullets, numbered, figure, table, tableCaption, spacer,
  equation, listing, pageFooter, pngSize,
};
