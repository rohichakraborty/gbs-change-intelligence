// Parse an uploaded change list (CSV or XLSX) into rows. Header names are matched
// loosely: title/change/name, description/details, function, dimension/category.
export interface ParsedRow { title: string; description: string; fn: string; dimension: string }

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',' || ch === ';' || ch === '\t') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

export function rowsFromTable(table: string[][]): ParsedRow[] {
  if (!table.length) return [];
  const head = table[0].map((h) => h.toLowerCase().trim());
  const find = (...keys: string[]) => head.findIndex((h) => keys.some((k) => h.includes(k)));
  let ti = find('title', 'change', 'name');
  const di = find('description', 'detail', 'summary');
  const fi = find('function', 'tower');
  const mi = find('dimension', 'category', 'type');
  const hasHeader = ti >= 0 || di >= 0;
  if (ti < 0) ti = 0;
  return (hasHeader ? table.slice(1) : table).map((r) => ({
    title: (r[ti] ?? '').trim(), description: di >= 0 ? (r[di] ?? '').trim() : '', fn: fi >= 0 ? (r[fi] ?? '').trim() : '', dimension: mi >= 0 ? (r[mi] ?? '').trim() : '',
  })).filter((r) => r.title);
}

export async function parseChangeFile(file: File): Promise<ParsedRow[]> {
  if (/\.xlsx$/i.test(file.name)) {
    const mod = await import('exceljs');
    const ExcelJS = (mod as unknown as { default?: typeof import('exceljs') }).default ?? mod;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    const table: string[][] = [];
    ws?.eachRow((row) => {
      const vals = (row.values as unknown[]).slice(1).map((v) => (v === null || v === undefined ? '' : typeof v === 'object' && v && 'text' in (v as object) ? String((v as { text: string }).text) : typeof v === 'object' && v && 'result' in (v as object) ? String((v as { result: unknown }).result) : String(v)));
      table.push(vals);
    });
    return rowsFromTable(table);
  }
  return rowsFromTable(parseCsv(await file.text()));
}
