import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, isNull, and, lt } from 'drizzle-orm';
import * as schema from '../src/lib/db/schema';
import { isOverdue } from '../src/lib/date-utils';
import { todayRD } from '../src/lib/date-utils';
import { canViewManagementPanel, canComment } from '../src/lib/permissions';

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString, { max: 1 });
const db = drizzle(client, { schema });

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAILED: ${label}`);
    failed++;
  }
}

async function run() {
  console.log('═══════════════════════════════════════════');
  console.log(' CRITERIOS DE ACEPTACIÓN — FASE 1');
  console.log('═══════════════════════════════════════════\n');

  // ─── CRITERIO 1 ─────────────────────────────────────
  // Crear un proyecto con 5 tareas de distintos responsables
  // → verificar distribución en "Mi trabajo"
  console.log('CA-1: Proyecto con 5 tareas, distribución por responsable');

  const allTasks = await db
    .select({
      id: schema.tasks.id,
      title: schema.tasks.title,
      responsibleId: schema.tasks.responsibleId,
      dueDate: schema.tasks.dueDate,
      dueDateOriginal: schema.tasks.dueDateOriginal,
      status: schema.tasks.status,
      spaceId: schema.tasks.spaceId,
    })
    .from(schema.tasks);

  const allSpaces = await db.select().from(schema.spaces);
  const projectSpace = allSpaces.find(s => s.name === 'Presupuesto 2027');
  assert(!!projectSpace, 'Espacio "Presupuesto 2027" existe');

  const projectTasks = allTasks.filter(t => t.spaceId === projectSpace?.id);
  assert(projectTasks.length === 5, `Proyecto tiene 5 tareas (tiene ${projectTasks.length})`);

  const uniqueResponsibles = new Set(projectTasks.map(t => t.responsibleId));
  assert(uniqueResponsibles.size >= 3, `Al menos 3 responsables distintos (hay ${uniqueResponsibles.size})`);

  const persons = await db.select().from(schema.persons);
  for (const person of persons) {
    const myTasks = allTasks.filter(t => t.responsibleId === person.id);
    console.log(`    ${person.name}: ${myTasks.length} tarea(s)`);
  }

  // ─── CRITERIO 2 ─────────────────────────────────────
  // Tarea sin fecha nunca aparece como vencida
  console.log('\nCA-2: Tarea sin fecha nunca aparece vencida');

  const taskNoDate = allTasks.find(t => t.dueDate === null);
  assert(!!taskNoDate, `Existe una tarea sin fecha: "${taskNoDate?.title}"`);
  assert(
    !isOverdue(taskNoDate?.dueDateOriginal ?? null, taskNoDate?.status ?? 'no_iniciada'),
    'isOverdue() retorna false para tarea sin fecha'
  );

  // ─── CRITERIO 3 ─────────────────────────────────────
  // Miembro no puede acceder a Panorama; observador no puede comentar
  console.log('\nCA-3: Permisos — miembro no ve Panorama, observador no comenta');

  assert(!canViewManagementPanel('miembro'), 'miembro no ve Panorama');
  assert(!canViewManagementPanel('observador'), 'observador no ve Panorama');
  assert(canViewManagementPanel('admin'), 'admin sí ve Panorama');
  assert(!canComment('observador'), 'observador no puede comentar');
  assert(canComment('miembro'), 'miembro puede comentar');

  // ─── CRITERIO 4 ─────────────────────────────────────
  // Tarea con fecha_limite_original de ayer aparece vencida a las 00:00 RD
  console.log('\nCA-4: Tarea con fecha de ayer aparece vencida');

  const today = todayRD();
  const yesterday = new Date(today + 'T12:00:00');
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  assert(
    isOverdue(yesterdayStr, 'en_proceso'),
    `isOverdue("${yesterdayStr}", "en_proceso") = true`
  );
  assert(
    !isOverdue(yesterdayStr, 'completada'),
    `isOverdue("${yesterdayStr}", "completada") = false (completada no es vencida)`
  );
  assert(
    !isOverdue(today, 'en_proceso'),
    `isOverdue("${today}", "en_proceso") = false (hoy no es vencida)`
  );

  // ─── CRITERIO 5 ─────────────────────────────────────
  // UPDATE directo en fecha_limite_original rechazado por el trigger
  console.log('\nCA-5: Trigger protege due_date_original de UPDATE directo');

  const taskWithDate = allTasks.find(t => t.dueDateOriginal !== null);
  assert(!!taskWithDate, `Existe tarea con due_date_original: "${taskWithDate?.title}"`);

  if (taskWithDate) {
    try {
      await client.unsafe(
        `UPDATE tasks SET due_date_original = '2099-12-31' WHERE id = '${taskWithDate.id}'`
      );
      assert(false, 'UPDATE debería haber sido rechazado por el trigger');
    } catch (err: any) {
      assert(
        err.message.includes('due_date_original cannot be modified'),
        `Trigger rechazó el UPDATE: "${err.message}"`
      );
    }

    const [unchanged] = await db
      .select({ dueDateOriginal: schema.tasks.dueDateOriginal })
      .from(schema.tasks)
      .where(eq(schema.tasks.id, taskWithDate.id));
    assert(
      unchanged.dueDateOriginal === taskWithDate.dueDateOriginal,
      `Valor sin cambios: ${unchanged.dueDateOriginal}`
    );
  }

  // ─── RESUMEN ────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════');
  console.log(` RESULTADO: ${passed} pasaron, ${failed} fallaron`);
  console.log('═══════════════════════════════════════════');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
