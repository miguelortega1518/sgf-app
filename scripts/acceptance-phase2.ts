import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and } from 'drizzle-orm';
import * as schema from '../src/lib/db/schema';
import { addBusinessDays } from '../src/lib/business-days';

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
  console.log(' CRITERIOS DE ACEPTACIÓN — FASE 2');
  console.log(' Espacios recurrentes: plantillas, ciclo,');
  console.log(' importador Excel');
  console.log('═══════════════════════════════════════════\n');

  // ─── C1: Plantilla de espacio ────────────────────────
  console.log('C1. Plantilla de espacio CRUD');
  const templates = await db.select().from(schema.spaceTemplates);
  assert(templates.length >= 2, 'Existen al menos 2 plantillas');

  const manual = templates.find(t => t.name === 'Cierre mensual estándar');
  assert(!!manual, 'Plantilla "Cierre mensual estándar" existe');
  assert(manual?.periodicity === 'mensual', 'Periodicidad = mensual');
  assert(manual?.targetCycleDays === 10, 'Días de ciclo = 10');
  assert(manual?.active === true, 'Plantilla está activa');

  const imported = templates.find(t => t.name === 'Cierre importado desde Excel');
  assert(!!imported, 'Plantilla importada desde Excel existe');

  // ─── C2: Plantillas de tarea ─────────────────────────
  console.log('\nC2. Plantillas de tarea');
  const manualTasks = manual
    ? await db.select().from(schema.taskTemplates).where(eq(schema.taskTemplates.spaceTemplateId, manual.id))
    : [];
  assert(manualTasks.length >= 1, 'Plantilla manual tiene al menos 1 tarea');

  const importedTasks = imported
    ? await db.select().from(schema.taskTemplates).where(eq(schema.taskTemplates.spaceTemplateId, imported.id))
    : [];
  assert(importedTasks.length === 7, `Plantilla importada tiene 7 tareas (got ${importedTasks.length})`);

  const naTasks = importedTasks.filter(t => t.applies === false);
  assert(naTasks.length === 2, `2 tareas marcadas como N/A en importación (got ${naTasks.length})`);

  const matchedResp = importedTasks.filter(t => t.defaultResponsibleId !== null);
  assert(matchedResp.length >= 4, `Al menos 4 tareas con responsable mapeado (got ${matchedResp.length})`);

  // ─── C3: Generación de ciclo ─────────────────────────
  console.log('\nC3. Generación de ciclo recurrente');
  const recSpaces = await db
    .select()
    .from(schema.spaces)
    .where(eq(schema.spaces.type, 'recurrente'));
  assert(recSpaces.length >= 1, 'Existe al menos 1 espacio recurrente');

  const sept = recSpaces.find(s => s.period === '2026-09');
  assert(!!sept, 'Espacio período 2026-09 existe');
  assert(sept?.status === 'borrador', `Estado del espacio = borrador (got ${sept?.status})`);
  assert(sept?.name === 'Cierre Septiembre 2026', `Nombre auto-generado correcto (got ${sept?.name})`);
  assert(sept?.spaceTemplateId === manual?.id, 'Vinculado a la plantilla correcta');
  assert(!!sept?.templateSnapshot, 'Tiene snapshot de la plantilla');

  // ─── C4: Tareas generadas con fechas correctas ───────
  console.log('\nC4. Tareas generadas con fechas calculadas');
  if (sept) {
    const genTasks = await db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.spaceId, sept.id));
    assert(genTasks.length >= 1, `Ciclo tiene al menos 1 tarea (got ${genTasks.length})`);

    const allHolidays = await db.select().from(schema.holidays);
    const holidaySet = new Set(allHolidays.map(h => h.date));

    for (const task of genTasks) {
      const tplTask = manualTasks.find(t => t.id === task.templateId);
      if (tplTask) {
        const expectedDate = addBusinessDays('2026-08-31', tplTask.businessDayLimit, holidaySet);
        assert(
          task.dueDate === expectedDate,
          `Tarea "${task.title}" fecha = ${expectedDate} (got ${task.dueDate})`
        );
        assert(
          task.dueDateOriginal === task.dueDate,
          `dueDateOriginal == dueDate para "${task.title}"`
        );
      }
    }

    assert(genTasks.every(t => t.responsibleId !== null), 'Todas las tareas tienen responsable');
  }

  // ─── C5: Miembros auto-agregados ─────────────────────
  console.log('\nC5. Miembros auto-agregados al espacio');
  if (sept) {
    const members = await db
      .select()
      .from(schema.spaceMembers)
      .where(eq(schema.spaceMembers.spaceId, sept.id));
    assert(members.length >= 2, `Al menos 2 miembros auto-agregados (got ${members.length})`);

    const owner = members.find(m => m.spaceRole === 'dueño');
    assert(!!owner, 'Existe un miembro con rol "dueño"');
  }

  // ─── C6: Unicidad de período ─────────────────────────
  console.log('\nC6. Unicidad de período por plantilla');
  if (manual && sept) {
    const duplicates = await db
      .select()
      .from(schema.spaces)
      .where(
        and(
          eq(schema.spaces.spaceTemplateId, manual.id),
          eq(schema.spaces.period, '2026-09'),
        ),
      );
    assert(duplicates.length === 1, 'Solo 1 espacio para período 2026-09 en la plantilla');
  }

  // ─── C7: Importador Excel ────────────────────────────
  console.log('\nC7. Importador Excel');
  if (imported) {
    const tasks = await db
      .select()
      .from(schema.taskTemplates)
      .where(eq(schema.taskTemplates.spaceTemplateId, imported.id));

    const companies = await db.select().from(schema.companies);

    const taskCompanyIds = tasks.filter(t => t.companyId).map(t => t.companyId);
    const matchedCompanies = new Set(taskCompanyIds);
    assert(matchedCompanies.size >= 3, `Tareas cubren al menos 3 empresas (got ${matchedCompanies.size})`);

    const persons = await db.select().from(schema.persons);
    const respIds = tasks.filter(t => t.defaultResponsibleId).map(t => t.defaultResponsibleId);
    const matchedPersons = new Set(respIds);
    assert(matchedPersons.size >= 3, `Responsables mapeados a al menos 3 personas (got ${matchedPersons.size})`);

    const archivoDigital = tasks.find(t => t.taskName === 'Archivo digital');
    assert(archivoDigital?.applies === false, 'Tarea con estado "x" → applies=false');
    assert(archivoDigital?.notApplicableReason !== null, 'Tiene razón de N/A');

    const reporteMensual = tasks.find(t => t.taskName === 'Reporte mensual');
    assert(reporteMensual?.applies === false, 'Tarea con "no aplica" → applies=false');
  }

  // ─── Resumen ─────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════');
  console.log(` RESULTADO: ${passed}/${passed + failed} aserciones pasaron`);
  if (failed > 0) {
    console.log(` ✗ ${failed} falla(s)`);
  } else {
    console.log(' ✓ FASE 2 ACEPTADA');
  }
  console.log('═══════════════════════════════════════════');

  await client.end();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
