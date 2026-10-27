import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { hashSync } from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import * as schema from '../src/lib/db/schema';

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString, { max: 1 });
const db = drizzle(client, { schema });

const iso = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

async function seed() {
  console.log('Cargando datos de ejemplo de Forja...');

  // Contraseña inicial: SEED_PASSWORD si se define; si no, una aleatoria que se imprime una sola vez.
  const password = process.env.SEED_PASSWORD || randomBytes(9).toString('base64url');
  const passwordHash = hashSync(password, 12);

  // ─── Repositorios ───────────────────────────────────
  const repos = await db.insert(schema.companies)
    .values(['web-app', 'api-core', 'mobile-app', 'infra', 'design-system'].map(name => ({ name })))
    .returning();
  const repo = (n: string) => repos.find(r => r.name === n)!.id;
  console.log(`✓ ${repos.length} repositorios`);

  // ─── Equipo ─────────────────────────────────────────
  const team = await db.insert(schema.persons).values([
    { name: 'Miguel Ortega', email: 'mortega@grupoblb.do', role: 'admin' as const },
    { name: 'José Manuel León', email: 'jleon@grupoblb.do', role: 'miembro' as const },
    { name: 'Ileana Encarnación', email: 'iencarnacion@grupoblb.do', role: 'miembro' as const },
    { name: 'Rosanna Acosta', email: 'racosta@grupoblb.do', role: 'miembro' as const },
    { name: 'Luz Elaine', email: 'lelaine@grupoblb.do', role: 'miembro' as const },
  ].map(p => ({ ...p, passwordHash, mustChangePassword: true }))).returning();
  const who = (n: string) => team.find(p => p.name.includes(n))!;
  const admin = who('Miguel');
  console.log(`✓ ${team.length} personas`);

  // ─── Días no laborables (afectan el cálculo de plazos de las plantillas) ───
  const holidays = [
    ['2026-11-06', 'Día de la Constitución'], ['2026-12-25', 'Navidad'],
    ['2027-01-01', 'Año Nuevo'], ['2027-01-06', 'Día de Reyes'], ['2027-01-21', 'Día de la Altagracia'],
    ['2027-01-25', 'Día de Duarte'], ['2027-02-27', 'Día de la Independencia'], ['2027-03-26', 'Viernes Santo'],
    ['2027-05-01', 'Día del Trabajo'], ['2027-06-03', 'Corpus Christi'], ['2027-08-16', 'Día de la Restauración'],
    ['2027-09-24', 'Día de las Mercedes'], ['2027-11-06', 'Día de la Constitución'], ['2027-12-25', 'Navidad'],
  ].map(([date, description]) => ({ date, description }));
  await db.insert(schema.holidays).values(holidays);

  // ─── Proyectos ──────────────────────────────────────
  const [sprint, onboarding, backlog] = await db.insert(schema.spaces).values([
    { name: 'Sprint 24', type: 'recurrente' as const, objective: 'Cerrar filtros guardados y estabilizar el login antes del release 2.4', ownerId: admin.id, leaderId: who('José').id, status: 'activo' as const, openDate: iso(-6), targetDate: iso(8), declaredHealth: 'amarillo' as const },
    { name: 'Rediseño del onboarding', type: 'proyecto' as const, objective: 'Reducir el abandono en los primeros 3 pasos del alta de cliente', ownerId: admin.id, leaderId: who('Ileana').id, status: 'activo' as const, openDate: iso(-20), targetDate: iso(35), declaredHealth: 'verde' as const },
    { name: 'Backlog de producto', type: 'continuo' as const, objective: 'Ideas, bugs y deuda técnica pendientes de planificar', ownerId: admin.id, status: 'activo' as const, openDate: iso(-60) },
  ]).returning();

  for (const s of [sprint, onboarding, backlog]) {
    await db.insert(schema.spaceMembers).values(team.map(p => ({
      spaceId: s.id, personId: p.id,
      spaceRole: p.id === admin.id ? 'dueño' as const : 'colaborador' as const,
    })));
  }

  await db.insert(schema.milestones).values([
    { spaceId: sprint.id, name: 'Code freeze', targetDate: iso(5), targetDateOriginal: iso(5), order: 1 },
    { spaceId: sprint.id, name: 'Release 2.4', targetDate: iso(8), targetDateOriginal: iso(8), order: 2 },
    { spaceId: onboarding.id, name: 'Prototipo validado con 5 usuarios', targetDate: iso(12), targetDateOriginal: iso(12), order: 1 },
    { spaceId: onboarding.id, name: 'Lanzamiento gradual (10 %)', targetDate: iso(35), targetDateOriginal: iso(35), order: 2 },
  ]);
  console.log('✓ 3 proyectos con hitos');

  // ─── Tareas ─────────────────────────────────────────
  type T = {
    space: typeof sprint; title: string; who: string; kind: 'feature' | 'bug' | 'mejora' | 'deuda' | 'chore';
    status: 'no_iniciada' | 'en_proceso' | 'en_revision' | 'completada' | 'bloqueada';
    est?: number; due?: number; prio?: 'critica' | 'alta' | 'normal' | 'baja'; repo?: string;
    branch?: string; pr?: string; labels?: string[]; blocked?: 'infraestructura' | 'diseno' | 'producto' | 'qa' | 'seguridad' | 'terceros';
    review?: boolean; desc?: string;
  };
  const tasks: T[] = [
    { space: sprint, title: 'Filtros guardados en el tablero', who: 'Ileana', kind: 'feature', status: 'en_revision', est: 8, due: 2, prio: 'alta', repo: 'web-app', branch: 'feat/filtros-guardados', pr: 'https://github.com/grupoblb/web-app/pull/218', labels: ['frontend', 'ux'], review: true, desc: 'Permitir guardar combinaciones de filtros por usuario y compartirlas con el equipo.' },
    { space: sprint, title: 'Timeout en el login con VPN activa', who: 'José', kind: 'bug', status: 'en_proceso', est: 3, due: 1, prio: 'critica', repo: 'api-core', branch: 'fix/login-timeout', labels: ['auth'], review: true, desc: 'El refresh del token supera los 8 s detrás de la VPN corporativa y la sesión se cierra.' },
    { space: sprint, title: 'Paginación en el listado de facturas', who: 'Rosanna', kind: 'mejora', status: 'no_iniciada', est: 3, due: 4, prio: 'normal', repo: 'web-app', labels: ['performance'], review: true },
    { space: sprint, title: 'Migrar el cron de reportes a un worker', who: 'Luz', kind: 'deuda', status: 'no_iniciada', est: 5, due: 6, prio: 'normal', repo: 'infra', labels: ['backend'], review: true },
    { space: sprint, title: 'Actualizar dependencias con CVE altas', who: 'José', kind: 'chore', status: 'completada', est: 2, due: -2, prio: 'alta', repo: 'api-core', branch: 'chore/bump-deps', pr: 'https://github.com/grupoblb/api-core/pull/211', labels: ['seguridad'], review: true },
    { space: sprint, title: 'Exportar reportes a CSV sin truncar decimales', who: 'Rosanna', kind: 'bug', status: 'completada', est: 2, due: -3, prio: 'normal', repo: 'api-core', branch: 'fix/csv-decimals', pr: 'https://github.com/grupoblb/api-core/pull/209', review: true },
    { space: sprint, title: 'Pipeline de preview por pull request', who: 'Luz', kind: 'feature', status: 'bloqueada', est: 5, due: 3, prio: 'alta', repo: 'infra', branch: 'feat/preview-envs', labels: ['ci'], blocked: 'infraestructura', review: true, desc: 'Esperando cuota adicional de runners para levantar entornos efímeros.' },
    { space: sprint, title: 'Tokens de color del design system v2', who: 'Ileana', kind: 'mejora', status: 'en_proceso', est: 5, due: 3, prio: 'normal', repo: 'design-system', branch: 'feat/tokens-v2', labels: ['frontend'], review: true },
    { space: sprint, title: 'Pruebas e2e del flujo de alta de cliente', who: 'Rosanna', kind: 'chore', status: 'en_revision', est: 3, due: 2, prio: 'normal', repo: 'web-app', branch: 'test/e2e-alta', pr: 'https://github.com/grupoblb/web-app/pull/221', labels: ['qa'], review: true },
    { space: onboarding, title: 'Entrevistas con 5 clientes nuevos', who: 'Ileana', kind: 'chore', status: 'completada', est: 3, due: -10, prio: 'alta', labels: ['research'] },
    { space: onboarding, title: 'Prototipo del paso 1: datos de la empresa', who: 'Ileana', kind: 'feature', status: 'en_proceso', est: 8, due: 7, prio: 'alta', repo: 'design-system', branch: 'feat/onboarding-paso-1', labels: ['ux'], review: true },
    { space: onboarding, title: 'Validación de RNC en tiempo real', who: 'José', kind: 'feature', status: 'no_iniciada', est: 5, due: 14, prio: 'normal', repo: 'api-core', labels: ['api'], review: true },
    { space: onboarding, title: 'Definir métrica de abandono por paso', who: 'Luz', kind: 'mejora', status: 'bloqueada', est: 2, due: 5, prio: 'normal', blocked: 'producto', desc: 'Falta acordar con Producto qué cuenta como abandono.' },
    { space: backlog, title: 'Los emails de notificación llegan duplicados', who: 'Luz', kind: 'bug', status: 'no_iniciada', est: 3, prio: 'alta', repo: 'api-core', labels: ['notificaciones'] },
    { space: backlog, title: 'Modo oscuro en el panel de administración', who: 'Rosanna', kind: 'mejora', status: 'no_iniciada', est: 5, prio: 'baja', repo: 'web-app', labels: ['ux'] },
    { space: backlog, title: 'Quitar el endpoint /v1/legacy-export', who: 'José', kind: 'deuda', status: 'no_iniciada', est: 2, prio: 'baja', repo: 'api-core' },
    { space: backlog, title: 'Documentar el proceso de rollback', who: 'Miguel', kind: 'chore', status: 'en_proceso', est: 1, prio: 'normal', repo: 'infra', labels: ['docs'] },
  ];

  const inserted: Record<string, string> = {};
  for (const t of tasks) {
    const [row] = await db.insert(schema.tasks).values({
      spaceId: t.space.id,
      title: t.title,
      description: t.desc,
      kind: t.kind,
      estimate: t.est ?? null,
      branch: t.branch ?? null,
      prUrl: t.pr ?? null,
      labels: t.labels ?? [],
      responsibleId: who(t.who).id,
      reviewerId: t.review ? (t.space.leaderId ?? admin.id) : null,
      creatorId: admin.id,
      companyId: t.repo ? repo(t.repo) : null,
      dueDate: t.due !== undefined ? iso(t.due) : null,
      dueDateOriginal: t.due !== undefined ? iso(t.due) : null,
      priority: t.prio ?? 'normal',
      status: t.status,
      requiresApproval: !!t.review,
      completedAt: t.status === 'completada' ? new Date(Date.now() - (Math.abs(t.due ?? 1) * 86_400_000)) : null,
      // Las tareas se crean unos días antes de cerrarse; así el tiempo de ciclo de la demo es realista.
      createdAt: new Date(Date.now() - ((t.status === 'completada' ? Math.abs(t.due ?? 1) + 2 + (tasks.indexOf(t) % 5) : 12) * 86_400_000)),
      blockedByArea: t.blocked ?? null,
      blockedSince: t.blocked ? iso(-2) : null,
    }).returning({ id: schema.tasks.id });
    inserted[t.title] = row.id;
  }

  await db.insert(schema.subtasks).values([
    { taskId: inserted['Filtros guardados en el tablero'], title: 'Esquema y endpoint para guardar filtros', completed: true, order: 1 },
    { taskId: inserted['Filtros guardados en el tablero'], title: 'Selector de vistas en la barra superior', completed: true, order: 2 },
    { taskId: inserted['Filtros guardados en el tablero'], title: 'Compartir vista con el equipo', completed: false, order: 3 },
    { taskId: inserted['Timeout en el login con VPN activa'], title: 'Reproducir con la VPN de staging', completed: true, order: 1 },
    { taskId: inserted['Timeout en el login con VPN activa'], title: 'Subir el timeout del refresh y añadir reintento', completed: false, order: 2 },
  ]);
  await db.insert(schema.taskDependencies).values([
    { taskId: inserted['Pruebas e2e del flujo de alta de cliente'], predecessorId: inserted['Filtros guardados en el tablero'] },
    { taskId: inserted['Validación de RNC en tiempo real'], predecessorId: inserted['Prototipo del paso 1: datos de la empresa'] },
  ]);
  await db.insert(schema.comments).values([
    { taskId: inserted['Filtros guardados en el tablero'], authorId: who('José').id, content: 'Revisé la PR: el hook de filtros re-renderiza todo el tablero. ¿Podemos memoizar el selector?' },
    { taskId: inserted['Filtros guardados en el tablero'], authorId: who('Ileana').id, content: 'Sí, lo ajusto hoy. También añado el test del caso sin filtros.' },
  ]);

  console.log(`✓ ${tasks.length} tareas de ejemplo`);
  if (!process.env.SEED_PASSWORD) {
    console.log(`\n  Contraseña inicial de todos los usuarios: ${password}`);
    console.log('  (se muestra solo ahora; cámbiala al entrar)');
  }
  console.log('\n✅ Seed completado');
  process.exit(0);
}

seed().catch(err => {
  console.error('Error en seed:', err);
  process.exit(1);
});
