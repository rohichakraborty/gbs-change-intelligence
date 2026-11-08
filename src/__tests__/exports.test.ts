import { describe, it, expect } from 'vitest';
import { createDemoState } from '../domain/demo';
import { artifactDocx, consolidatedReportDocx } from '../services/docx';
import { buildXlsx, buildPptx } from '../services/office';
import { writeFileSync, mkdirSync } from 'fs';

describe('exports', () => {
  const s = createDemoState();
  const out = process.env.OUT_DIR ?? '/tmp/gbs-test-out';
  mkdirSync(out, { recursive: true });
  it('docx artifact + report', async () => {
    const a = s.artifacts[0];
    const b = await artifactDocx(s, a, a.versions[0]);
    expect(b.size).toBeGreaterThan(5000);
    writeFileSync(`${out}/artifact.docx`, Buffer.from(await b.arrayBuffer()));
    const r = await consolidatedReportDocx(s);
    writeFileSync(`${out}/report.docx`, Buffer.from(await r.arrayBuffer()));
    expect(r.size).toBeGreaterThan(8000);
  });
  it('xlsx all', async () => {
    const b = await buildXlsx(s, 'all');
    writeFileSync(`${out}/all.xlsx`, Buffer.from(await b.arrayBuffer()));
    expect(b.size).toBeGreaterThan(10000);
  });
  it('pptx all', async () => {
    const b = await buildPptx(s, 'all');
    writeFileSync(`${out}/all.pptx`, Buffer.from(await b.arrayBuffer()));
    expect(b.size).toBeGreaterThan(10000);
  }, 30000);
});
