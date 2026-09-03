import fs from 'fs';
import path from 'path';

const BASE = 'http://localhost:3000';

async function main() {
  // 1. Login as admin
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'mortega@grupoblb.do', password: 'SGF2026!' }),
  });
  if (!loginRes.ok) throw new Error(`Login failed: ${loginRes.status}`);
  const setCookieHeader = loginRes.headers.get('set-cookie') || '';
  const match = setCookieHeader.match(/sgf-session=[^;]+/);
  if (!match) throw new Error(`No sgf-session cookie found. Set-Cookie: ${setCookieHeader}`);
  const token = match[0];
  console.log('✓ Login OK');

  // 2. Upload Excel
  const filePath = path.join(__dirname, '..', 'test-import.xlsx');
  const fileBuffer = fs.readFileSync(filePath);
  const blob = new Blob([fileBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  const formData = new FormData();
  formData.append('file', blob, 'test-import.xlsx');
  formData.append('templateName', 'Cierre importado desde Excel');
  formData.append('targetCycleDays', '10');

  const importRes = await fetch(`${BASE}/api/templates/import-excel`, {
    method: 'POST',
    headers: { Cookie: token },
    body: formData,
  });

  if (!importRes.ok) {
    const err = await importRes.text();
    throw new Error(`Import failed (${importRes.status}): ${err}`);
  }

  const result = await importRes.json();
  console.log('✓ Import OK');
  console.log(`  Template: ${result.template.name} (${result.template.id})`);
  console.log(`  Tasks imported: ${result.tasksImported}`);
  console.log(`  Sheets processed: ${result.sheetsProcessed}`);
  console.log(`  Skipped sheets: ${result.skippedSheets.join(', ') || 'none'}`);

  // 3. Verify template detail
  const detailRes = await fetch(`${BASE}/api/templates/${result.template.id}`, {
    headers: { Cookie: token },
  });
  const detail = await detailRes.json();
  console.log(`\n✓ Template has ${detail.tasks.length} task templates:`);
  for (const t of detail.tasks) {
    console.log(`  ${t.order}. ${t.taskName} | ${t.companyName || '-'} | ${t.responsibleName || '-'} | DH:${t.businessDayLimit} | applies:${t.applies}`);
  }

  // Assertions
  const errors: string[] = [];
  if (result.tasksImported !== 7) errors.push(`Expected 7 tasks, got ${result.tasksImported}`);
  if (result.sheetsProcessed !== 3) errors.push(`Expected 3 sheets processed, got ${result.sheetsProcessed}`);
  if (result.skippedSheets.length !== 1) errors.push(`Expected 1 skipped sheet, got ${result.skippedSheets.length}`);
  if (!result.skippedSheets.includes('EmpresaDesconocida')) errors.push('EmpresaDesconocida should be skipped');

  const naTask = detail.tasks.find((t: any) => t.taskName === 'Archivo digital');
  if (naTask && naTask.applies !== false) errors.push('Archivo digital should have applies=false');

  const naTask2 = detail.tasks.find((t: any) => t.taskName === 'Reporte mensual');
  if (naTask2 && naTask2.applies !== false) errors.push('Reporte mensual should have applies=false');

  const matchedResp = detail.tasks.find((t: any) => t.taskName === 'Declaración DGII');
  if (matchedResp && !matchedResp.responsibleName?.includes('Miguel')) {
    errors.push(`Expected Miguel for Declaración DGII, got ${matchedResp.responsibleName}`);
  }

  if (errors.length === 0) {
    console.log('\n✓ All assertions passed!');
  } else {
    console.log('\n✗ Assertion failures:');
    errors.forEach(e => console.log(`  - ${e}`));
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
