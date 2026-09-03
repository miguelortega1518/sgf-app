import { strict as assert } from 'node:assert';

const BASE = 'http://localhost:3000';
let cookie = '';

async function api(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
      ...opts?.headers,
    },
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data, headers: res.headers };
}

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'mortega@grupoblb.do', password: 'SGF2026!' }),
  });
  const raw = res.headers.get('set-cookie') || '';
  const match = raw.match(/sgf-session=([^;]+)/);
  if (!match) throw new Error('Login failed');
  cookie = `sgf-session=${match[1]}`;
  console.log('  Logged in as admin');
}

let pass = 0;
let fail = 0;

function check(label: string, ok: boolean) {
  if (ok) { pass++; console.log(`  [PASS] ${label}`); }
  else { fail++; console.log(`  [FAIL] ${label}`); }
}

async function run() {
  console.log('\n=== Fase 3: Acceptance Tests ===\n');

  // Login
  await login();

  // Get a space to work with
  const { data: spaces } = await api('/api/spaces');
  const projSpace = spaces.find((s: any) => s.type === 'proyecto' && s.status === 'activo');

  // --- Criterion 1: Space lifecycle validation ---
  console.log('\n--- 1. Ciclo de vida del espacio ---');

  // Create a test space via generate cycle (or use existing)
  // Try to close a space with incomplete tasks
  const { data: spDetail } = await api(`/api/spaces/${projSpace.id}`);
  const incompleteTasks = spDetail.tasks.filter((t: any) => t.status !== 'completada');

  if (incompleteTasks.length > 0) {
    const { status } = await api(`/api/spaces/${projSpace.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'cerrado' }),
    });
    check('No se puede cerrar espacio con tareas pendientes', status === 400);
  } else {
    check('No se puede cerrar espacio con tareas pendientes (skip: all complete)', true);
  }

  // Invalid transition: activo -> borrador
  const { status: badTransition } = await api(`/api/spaces/${projSpace.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'borrador' }),
  });
  check('Transición inválida activo→borrador rechazada', badTransition === 400);

  // --- Criterion 2: Evidence API ---
  console.log('\n--- 2. API de evidencias ---');

  // Pick a task
  const testTask = spDetail.tasks[0];

  // Add evidence
  const { status: evAdd, data: evData } = await api(`/api/tasks/${testTask.id}/evidence`, {
    method: 'POST',
    body: JSON.stringify({ urlOrFile: 'https://test.com/report.pdf', type: 'enlace' }),
  });
  check('POST evidencia devuelve 201', evAdd === 201);
  check('Evidencia tiene id y tipo', !!evData?.id && evData?.type === 'enlace');

  // Add captura evidence
  const { status: evAdd2, data: evData2 } = await api(`/api/tasks/${testTask.id}/evidence`, {
    method: 'POST',
    body: JSON.stringify({ urlOrFile: 'captura-pantalla.png', type: 'captura' }),
  });
  check('POST captura devuelve 201', evAdd2 === 201);

  // Verify evidence appears in task detail
  const { data: taskDetail } = await api(`/api/tasks/${testTask.id}`);
  const evidenceCount = taskDetail.evidence.filter((e: any) =>
    e.urlOrFile === 'https://test.com/report.pdf' || e.urlOrFile === 'captura-pantalla.png'
  ).length;
  check('Evidencias aparecen en detalle de tarea', evidenceCount === 2);

  // Delete evidence
  const { status: evDel } = await api(`/api/tasks/${testTask.id}/evidence?evidenceId=${evData2.id}`, {
    method: 'DELETE',
  });
  check('DELETE evidencia devuelve 200', evDel === 200);

  // Verify deleted
  const { data: taskDetail2 } = await api(`/api/tasks/${testTask.id}`);
  const afterDel = taskDetail2.evidence.find((e: any) => e.id === evData2.id);
  check('Evidencia eliminada no aparece', !afterDel);

  // --- Criterion 3: Comments API ---
  console.log('\n--- 3. API de comentarios ---');

  const { status: cmtAdd, data: cmtData } = await api(`/api/tasks/${testTask.id}/comments`, {
    method: 'POST',
    body: JSON.stringify({ content: 'Comentario de prueba fase 3' }),
  });
  check('POST comentario devuelve 201', cmtAdd === 201);
  check('Comentario tiene contenido', cmtData?.content === 'Comentario de prueba fase 3');

  // Verify comment appears in task detail
  const { data: taskDetail3 } = await api(`/api/tasks/${testTask.id}`);
  const hasCmt = taskDetail3.comments.some((c: any) => c.content === 'Comentario de prueba fase 3');
  check('Comentario aparece en detalle de tarea', hasCmt);

  // --- Criterion 4: Task blocking flow ---
  console.log('\n--- 4. Flujo de bloqueo de tarea ---');

  // Find or prepare a task in en_proceso
  let blockTask = spDetail.tasks.find((t: any) => t.status === 'en_proceso');
  if (!blockTask) {
    const candidate = spDetail.tasks.find((t: any) => t.status === 'no_iniciada');
    if (candidate) {
      await api(`/api/tasks/${candidate.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'en_proceso' }),
      });
      blockTask = candidate;
    }
  }

  if (blockTask) {
    // Block without area should fail
    const { status: noArea } = await api(`/api/tasks/${blockTask.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'bloqueada' }),
    });
    check('Bloquear sin área falla', noArea === 400);

    // Block with area
    const { status: withArea, data: blockedData } = await api(`/api/tasks/${blockTask.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'bloqueada', blockedByArea: 'tesoreria' }),
    });
    check('Bloquear con área éxito', withArea === 200 && blockedData?.status === 'bloqueada');
    check('blockedByArea guardado', blockedData?.blockedByArea === 'tesoreria');

    // Unblock
    const { status: unblock, data: unblockedData } = await api(`/api/tasks/${blockTask.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'en_proceso' }),
    });
    check('Desbloquear éxito', unblock === 200 && unblockedData?.status === 'en_proceso');
    check('blockedByArea limpiado', unblockedData?.blockedByArea === null);
  } else {
    console.log('  (no hay tarea disponible para probar bloqueo)');
  }

  // --- Criterion 5: Delay reason on completion ---
  console.log('\n--- 5. Motivo de retraso ---');

  if (blockTask) {
    const { status: complete, data: compData } = await api(`/api/tasks/${blockTask.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'completada',
        delayReason: 'capacidad_insuficiente',
        delayReasonText: 'Poco personal esta semana',
      }),
    });
    check('Completar con motivo de retraso', complete === 200 && compData?.status === 'completada');
    check('delayReason guardado', compData?.delayReason === 'capacidad_insuficiente');
  }

  // --- Criterion 6: Evidence required validation ---
  console.log('\n--- 6. Validación de evidencia requerida ---');

  // Find a task that requires evidence, or skip
  const evReqTask = spDetail.tasks.find((t: any) => t.requiresEvidence && t.status !== 'completada');
  if (evReqTask) {
    // Remove all evidence first
    const { data: evDetail } = await api(`/api/tasks/${evReqTask.id}`);
    for (const ev of evDetail.evidence) {
      await api(`/api/tasks/${evReqTask.id}/evidence?evidenceId=${ev.id}`, { method: 'DELETE' });
    }
    // Try to complete
    const { status: noEv } = await api(`/api/tasks/${evReqTask.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'completada' }),
    });
    check('No se puede completar sin evidencia requerida', noEv === 400);
  } else {
    check('Validación evidencia requerida (skip: no hay tarea requiresEvidence)', true);
  }

  // --- Criterion 7: Audit trail ---
  console.log('\n--- 7. Bitácora de auditoría ---');

  if (blockTask) {
    const { data: auditDetail } = await api(`/api/tasks/${blockTask.id}`);
    const auditActions = auditDetail.audit.map((a: any) => a.action);
    check('Audit tiene status_changed', auditActions.includes('status_changed'));
    check('Audit tiene múltiples entradas', auditDetail.audit.length >= 2);
  }

  // Clean up test evidence
  await api(`/api/tasks/${testTask.id}/evidence?evidenceId=${evData.id}`, { method: 'DELETE' });

  // --- Summary ---
  console.log(`\n=== Resultado: ${pass} passed, ${fail} failed de ${pass + fail} ===\n`);
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
