import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  Header,
  ImageRun,
  PageNumber,
  Paragraph,
  Packer,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} = require('C:/Users/Lenovo/AppData/Local/Temp/bso-docx-builder/node_modules/docx');

const root = path.resolve(process.cwd());
const docsDir = path.join(root, 'docs');
const outDir = path.join(docsDir, 'word');
fs.mkdirSync(outDir, { recursive: true });

const COLORS = {
  navy: '12304A',
  blue: '2E74B5',
  darkBlue: '1F4D78',
  teal: '087E8B',
  gold: 'A96B00',
  red: '9B1C1C',
  ink: '172B4D',
  muted: '5B6573',
  lightBlue: 'E8EEF5',
  lightGray: 'F2F4F7',
  callout: 'F4F6F9',
  white: 'FFFFFF',
  border: 'C9D2DC',
};

const WIDTH = 9360;
const TABLE_INDENT = 120;
const FONT = 'Aptos';
const FALLBACK_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

function runFont(run, { size = 10.5, color = COLORS.ink, bold = false, italic = false, font = FONT } = {}) {
  const text = run?.root?.flatMap((item) => item?.root || []).find((item) => typeof item === 'string') || '';
  return new TextRun({ text, font, size: Math.round(size * 2), color, bold, italics: italic });
}

function textRuns(text, base = {}) {
  const runs = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let cursor = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) runs.push(runFont(new TextRun(text.slice(cursor, match.index)), base));
    const token = match[0];
    if (token.startsWith('**')) runs.push(runFont(new TextRun(token.slice(2, -2)), { ...base, bold: true }));
    else if (token.startsWith('`')) runs.push(runFont(new TextRun(token.slice(1, -1)), { ...base, font: 'Cascadia Mono', color: COLORS.darkBlue }));
    else runs.push(runFont(new TextRun(token.slice(1, -1)), { ...base, italic: true }));
    cursor = match.index + token.length;
  }
  if (cursor < text.length) runs.push(runFont(new TextRun(text.slice(cursor)), base));
  return runs.length ? runs : [runFont(new TextRun(text), base)];
}

function paragraph(text = '', opts = {}) {
  return new Paragraph({
    style: opts.style || 'Normal',
    alignment: opts.alignment || AlignmentType.LEFT,
    spacing: { before: opts.before ?? 0, after: opts.after ?? 120, line: opts.line ?? 276 },
    keepNext: opts.keepNext,
    pageBreakBefore: opts.pageBreakBefore,
    children: opts.children || textRuns(text, opts.run || {}),
  });
}

function heading(text, level) {
  const map = {
    1: { heading: HeadingLevel.HEADING_1, size: 16, color: COLORS.blue, before: 320, after: 160 },
    2: { heading: HeadingLevel.HEADING_2, size: 13, color: COLORS.blue, before: 240, after: 120 },
    3: { heading: HeadingLevel.HEADING_3, size: 11.5, color: COLORS.darkBlue, before: 180, after: 90 },
  };
  const token = map[level] || map[3];
  return new Paragraph({
    heading: token.heading,
    style: `Heading${level}`,
    keepNext: true,
    spacing: { before: token.before, after: token.after, line: 276 },
    children: [runFont(new TextRun(text), { size: token.size, color: token.color, bold: true })],
  });
}

function cellParagraph(text, { header = false, code = false } = {}) {
  return new Paragraph({
    style: 'TableText',
    spacing: { before: 0, after: 50, line: 240 },
    children: textRuns(text, { size: header ? 8.7 : 8.4, color: header ? COLORS.white : COLORS.ink, bold: header, font: code ? 'Cascadia Mono' : FONT }),
  });
}

function makeTable(rows) {
  const colCount = Math.max(...rows.map((row) => row.length));
  const widths = Array.from({ length: colCount }, () => Math.floor(WIDTH / colCount));
  widths[widths.length - 1] += WIDTH - widths.reduce((a, b) => a + b, 0);
  const tableRows = rows.map((row, rowIndex) => new TableRow({
    tableHeader: rowIndex === 0,
    children: Array.from({ length: colCount }, (_, idx) => new TableCell({
      width: { size: widths[idx], type: WidthType.DXA },
      margins: { top: 100, bottom: 100, start: 120, end: 120 },
      shading: { type: ShadingType.CLEAR, fill: rowIndex === 0 ? COLORS.navy : (rowIndex % 2 ? COLORS.white : COLORS.lightGray) },
      borders: { top: { style: BorderStyle.SINGLE, size: 4, color: COLORS.border }, bottom: { style: BorderStyle.SINGLE, size: 4, color: COLORS.border }, left: { style: BorderStyle.SINGLE, size: 4, color: COLORS.border }, right: { style: BorderStyle.SINGLE, size: 4, color: COLORS.border } },
      children: [cellParagraph(row[idx] || '', { header: rowIndex === 0 })],
    })),
  }));
  return new Table({
    rows: tableRows,
    width: { size: WIDTH, type: WidthType.DXA },
    columnWidths: widths,
    indent: { size: TABLE_INDENT, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    margins: { top: 100, bottom: 100, start: 120, end: 120 },
    borders: { top: { style: BorderStyle.SINGLE, size: 4, color: COLORS.border }, bottom: { style: BorderStyle.SINGLE, size: 4, color: COLORS.border }, left: { style: BorderStyle.SINGLE, size: 4, color: COLORS.border }, right: { style: BorderStyle.SINGLE, size: 4, color: COLORS.border }, insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: COLORS.border }, insideVertical: { style: BorderStyle.SINGLE, size: 4, color: COLORS.border } },
  });
}

function escapeXml(value) {
  return value.replace(/[<>&'\"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '\"': '&quot;' }[ch]));
}

function diagramSvg(kind) {
  const box = (x, y, w, h, title, detail, fill = '#E8EEF5') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${fill}" stroke="#2E74B5" stroke-width="2"/><text x="${x + w / 2}" y="${y + 25}" text-anchor="middle" font-family="Aptos,Arial" font-size="16" font-weight="700" fill="#12304A">${escapeXml(title)}</text><text x="${x + w / 2}" y="${y + 47}" text-anchor="middle" font-family="Aptos,Arial" font-size="11" fill="#425466">${escapeXml(detail)}</text>`;
  const arrow = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#087E8B" stroke-width="3" marker-end="url(#arrow)"/>`;
  const defs = `<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#087E8B"/></marker></defs>`;
  if (kind === 'architecture') return `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="300" viewBox="0 0 760 300">${defs}<text x="380" y="22" text-anchor="middle" font-family="Aptos,Arial" font-size="17" font-weight="700" fill="#12304A">Architecture du Portail BSO</text>${box(30,55,210,68,'Utilisateur','Admin • Manager • Finance • Agent','#F4F6F9')}${box(275,55,210,68,'PWA React','Interface responsive','#E8EEF5')}${box(520,55,210,68,'Supabase Auth','Session et profil','#E8EEF5')}${box(130,185,210,68,'Dexie / IndexedDB','Données hors ligne','#FFF8E8')}${box(420,185,210,68,'PostgreSQL + RLS','Données officielles','#EAF6F4')}${arrow(240,89,270,89)}${arrow(485,89,515,89)}${arrow(350,125,250,180)}${arrow(410,125,500,180)}</svg>`;
  if (kind === 'offline') return `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="260" viewBox="0 0 760 260">${defs}<text x="380" y="22" text-anchor="middle" font-family="Aptos,Arial" font-size="17" font-weight="700" fill="#12304A">Cycle hors ligne et synchronisation</text>${box(25,75,145,70,'1. Télécharger','Données autorisées')}${box(205,75,145,70,'2. Saisir','Dexie local')}${box(385,75,145,70,'3. Mettre en file','pending / failed','#FFF8E8')}${box(565,75,170,70,'4. Synchroniser','Supabase','#EAF6F4')}${arrow(170,110,200,110)}${arrow(350,110,380,110)}${arrow(530,110,560,110)}<path d="M650 150 C650 220 100 220 100 150" fill="none" stroke="#A96B00" stroke-width="2.5" stroke-dasharray="7 5" marker-end="url(#arrow)"/><text x="380" y="238" text-anchor="middle" font-family="Aptos,Arial" font-size="12" fill="#7A5A00">Retour au début après synchronisation réussie</text></svg>`;
  if (kind === 'security') return `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="300" viewBox="0 0 760 300">${defs}<text x="380" y="22" text-anchor="middle" font-family="Aptos,Arial" font-size="17" font-weight="700" fill="#12304A">Contrôle d’une opération sensible</text>${box(30,65,155,70,'Utilisateur','Session authentifiée','#F4F6F9')}${box(220,65,155,70,'RLS','Rôle actif','#E8EEF5')}${box(410,65,155,70,'Accès','Grant temporaire','#FFF8E8')}${box(600,65,130,70,'Action','Autoriser / refuser','#EAF6F4')}${arrow(185,100,215,100)}${arrow(375,100,405,100)}${arrow(565,100,595,100)}<text x="380" y="205" text-anchor="middle" font-family="Aptos,Arial" font-size="13" fill="#9B1C1C">Le bouton de l’interface ne remplace jamais le contrôle PostgreSQL.</text><line x1="95" y1="225" x2="665" y2="225" stroke="#9B1C1C" stroke-width="2"/><text x="380" y="250" text-anchor="middle" font-family="Aptos,Arial" font-size="12" fill="#425466">Audit : auteur • ressource • date • avant • après • motif</text></svg>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="250" viewBox="0 0 760 250">${defs}<text x="380" y="22" text-anchor="middle" font-family="Aptos,Arial" font-size="17" font-weight="700" fill="#12304A">Rapprochement de caisse</text>${box(45,75,190,70,'Agent','Cash physique + rapport','#FFF8E8')}${box(285,75,190,70,'Finance','Filtre + contrôle','#E8EEF5')}${box(525,75,190,70,'Décision','Valider / rejeter','#EAF6F4')}${arrow(235,110,280,110)}${arrow(475,110,520,110)}<text x="380" y="205" text-anchor="middle" font-family="Aptos,Arial" font-size="12" fill="#425466">Pending compte dans le cash; rejet exclu du Total Cash.</text></svg>`;
}

function diagramParagraph(kind, caption) {
  const svg = Buffer.from(diagramSvg(kind));
  return [
    paragraph(caption, { alignment: AlignmentType.CENTER, after: 60, run: { size: 9, color: COLORS.muted, italic: true } }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 140 }, children: [new ImageRun({ data: svg, type: 'svg', fallback: { data: FALLBACK_PNG, type: 'png' }, transformation: { width: 570, height: kind === 'offline' ? 195 : 185 } })] }),
  ];
}

function stripLinkSyntax(text) {
  return text.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
}

function parseTableRows(lines) {
  return lines.filter((line) => line.trim()).map((line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => stripLinkSyntax(cell.trim()))).filter((row) => !row.every((cell) => /^:?-{3,}:?$/.test(cell)));
}

function addMarkdown(children, md, opts = {}) {
  const lines = md.replace(/\r/g, '').split('\n');
  let code = false;
  let codeLines = [];
  let tableLines = [];
  let firstH1Skipped = false;
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const line = raw.trimEnd();
    if (line.startsWith('```')) {
      if (!code) { code = true; codeLines = []; }
      else {
        children.push(paragraph(codeLines.join('\n'), { after: 160, run: { font: 'Cascadia Mono', size: 8.4, color: COLORS.darkBlue } }));
        code = false;
      }
      continue;
    }
    if (code) { codeLines.push(raw); continue; }
    const isTable = line.trim().startsWith('|');
    if (tableLines.length && !isTable) {
      children.push(makeTable(parseTableRows(tableLines)));
      children.push(paragraph('', { after: 10 }));
      tableLines = [];
    }
    if (isTable) { tableLines.push(line); continue; }
    if (!line.trim()) continue;
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const title = stripLinkSyntax(headingMatch[2]);
      if (level === 1 && opts.skipFirstH1 && !firstH1Skipped) { firstH1Skipped = true; continue; }
      children.push(heading(title, level));
      if (opts.diagrams?.[title]) children.push(...diagramParagraph(opts.diagrams[title].kind, opts.diagrams[title].caption));
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) {
      children.push(new Paragraph({ style: 'ListBullet', numbering: { reference: 'bullet', level: 0 }, spacing: { after: 70, line: 276 }, children: textRuns(stripLinkSyntax(bullet[1])) }));
      continue;
    }
    const numbered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (numbered) {
      children.push(new Paragraph({ style: 'ListNumber', numbering: { reference: 'number', level: 0 }, spacing: { after: 70, line: 276 }, children: textRuns(stripLinkSyntax(numbered[1])) }));
      continue;
    }
    if (line.startsWith('>')) {
      children.push(paragraph(stripLinkSyntax(line.replace(/^>\s?/, '')), { after: 130, run: { color: COLORS.darkBlue, italic: true }, shading: { fill: COLORS.callout } }));
      continue;
    }
    children.push(paragraph(stripLinkSyntax(line)));
  }
  if (tableLines.length) children.push(makeTable(parseTableRows(tableLines)));
}

function addCover(children, { title, subtitle, type, sections }) {
  children.push(paragraph('BWAT SEKREM ONLINE', { alignment: AlignmentType.LEFT, after: 260, run: { size: 11, color: COLORS.teal, bold: true } }));
  children.push(paragraph(title, { after: 90, run: { size: 28, color: COLORS.navy, bold: true } }));
  children.push(paragraph(subtitle, { after: 300, run: { size: 14, color: COLORS.muted } }));
  children.push(makeTable([
    ['Document', type],
    ['Version', 'Révision auditée — 23 août 2026'],
    ['Périmètre', 'Portail interne BSO'],
    ['Statut', 'Document de référence à valider'],
  ]));
  children.push(paragraph('Contenu du document', { before: 320, after: 100, run: { size: 12, color: COLORS.darkBlue, bold: true } }));
  for (const item of sections) children.push(new Paragraph({ numbering: { reference: 'bullet', level: 0 }, style: 'ListBullet', spacing: { after: 70, line: 276 }, children: textRuns(item, { size: 10.5 }) }));
  children.push(paragraph('Préparé pour revue du projet — ce document décrit exclusivement le portail interne BSO.', { before: 340, after: 0, run: { size: 9, color: COLORS.muted, italic: true } }));
  children.push(new Paragraph({ pageBreakBefore: true, spacing: { before: 0, after: 0 } }));
}

function addHeaderFooter(shortTitle) {
  return {
    header: new Header({ children: [new Paragraph({ alignment: AlignmentType.LEFT, spacing: { after: 0 }, children: [runFont(new TextRun(`BSO Portal  |  ${shortTitle}`), { size: 8.5, color: COLORS.muted, bold: true })] })] }),
    footer: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 0, after: 0 }, children: [runFont(new TextRun('Bwat Sekrem Online  •  Page '), { size: 8.5, color: COLORS.muted }), PageNumber.CURRENT] })] }),
  };
}

function makeDocument({ source, output, title, subtitle, type, shortTitle, sections, diagrams }) {
  const children = [];
  addCover(children, { title, subtitle, type, sections });
  addMarkdown(children, fs.readFileSync(source, 'utf8'), { skipFirstH1: true, diagrams });
  const furniture = addHeaderFooter(shortTitle);
  const doc = new Document({
    creator: 'Codex',
    title,
    subject: 'Documentation du Portail BSO',
    description: 'Document généré à partir de la documentation auditée du Portail BSO.',
    styles: {
      default: { document: { run: { font: FONT, size: 21, color: COLORS.ink }, paragraph: { spacing: { after: 120, line: 276 } } } },
      paragraphStyles: [
        { id: 'Normal', name: 'Normal', run: { font: FONT, size: 21, color: COLORS.ink }, paragraph: { spacing: { after: 120, line: 276 } } },
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', run: { font: FONT, size: 32, bold: true, color: COLORS.blue }, paragraph: { spacing: { before: 320, after: 160, line: 276 }, keepNext: true } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', run: { font: FONT, size: 26, bold: true, color: COLORS.blue }, paragraph: { spacing: { before: 240, after: 120, line: 276 }, keepNext: true } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', run: { font: FONT, size: 23, bold: true, color: COLORS.darkBlue }, paragraph: { spacing: { before: 180, after: 90, line: 276 }, keepNext: true } },
        { id: 'TableText', name: 'Table text', basedOn: 'Normal', run: { font: FONT, size: 17, color: COLORS.ink }, paragraph: { spacing: { after: 50, line: 240 } } },
        { id: 'ListBullet', name: 'List Bullet', basedOn: 'Normal', run: { font: FONT, size: 21, color: COLORS.ink }, paragraph: { indent: { left: 720, hanging: 360 }, spacing: { after: 70, line: 276 } } },
        { id: 'ListNumber', name: 'List Number', basedOn: 'Normal', run: { font: FONT, size: 21, color: COLORS.ink }, paragraph: { indent: { left: 720, hanging: 360 }, spacing: { after: 70, line: 276 } } },
      ],
    },
    numbering: {
      config: [
        { reference: 'bullet', levels: [{ level: 0, format: 'bullet', text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
        { reference: 'number', levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      ],
    },
    sections: [{
      headers: { default: furniture.header },
      footers: { default: furniture.footer },
      page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 708, footer: 708 } },
      properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 708, footer: 708 } } },
      children,
    }],
  });
  return Packer.toBuffer(doc).then((buffer) => fs.writeFileSync(output, buffer));
}

const jobs = [
  {
    source: path.join(docsDir, '01_DOCUMENTATION_GLOBALE_ARCHITECTURE.md'),
    output: path.join(outDir, 'BSO_Portail_Documentation_Globale_Architecture.docx'),
    title: 'Documentation globale et architecture',
    subtitle: 'Référence technique du Portail BSO',
    type: 'Documentation technique',
    shortTitle: 'Documentation globale',
    sections: ['Architecture PWA et composants', 'Modèle de données et règles financières', 'Synchronisation hors ligne', 'Contrôle d’accès et état vérifié'],
    diagrams: {
      '2. Architecture générale': { kind: 'architecture', caption: 'Schéma 1 — Vue d’ensemble du Portail BSO' },
      '4. Fonctionnement hors ligne': { kind: 'offline', caption: 'Schéma 2 — Cycle de synchronisation hors ligne' },
    },
  },
  {
    source: path.join(docsDir, '02_GUIDE_PRISE_EN_MAIN_ROLES.md'),
    output: path.join(outDir, 'BSO_Portail_Guide_Prise_en_Main_Roles.docx'),
    title: 'Guide de prise en main par rôle',
    subtitle: 'Procédures opérationnelles du Portail BSO',
    type: 'Guide opérateur',
    shortTitle: 'Guide de prise en main',
    sections: ['Matrice des rôles et permissions', 'Inscription par code d’invitation', 'Journée type de l’Agent', 'Validation et rapprochement', 'Déconnexion sécurisée'],
    diagrams: {
      '5. Journée type de l’Agent': { kind: 'offline', caption: 'Schéma 1 — Cycle de travail terrain et synchronisation' },
      '7. Validation par Finance, Manager ou Admin': { kind: 'reconcile', caption: 'Schéma 2 — Rapprochement du cash physique' },
    },
  },
  {
    source: path.join(docsDir, '03_POINTS_DE_VIGILANCE_ET_SECURITE.md'),
    output: path.join(outDir, 'BSO_Portail_Points_de_Vigilance_Securite.docx'),
    title: 'Points de vigilance et sécurité',
    subtitle: 'Contrôles, risques et procédures d’incident',
    type: 'Référentiel sécurité',
    shortTitle: 'Sécurité et vigilance',
    sections: ['Données hors ligne et cash', 'Rôles, invitations et RLS', 'Intégrité et traçabilité', 'Incidents et risques résiduels'],
    diagrams: {
      '6. Politiques Supabase vérifiées': { kind: 'security', caption: 'Schéma 1 — Défense en profondeur des opérations sensibles' },
    },
  },
];

for (const job of jobs) await makeDocument(job);
console.log(`Créés: ${jobs.map((job) => job.output).join(', ')}`);
