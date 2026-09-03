import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { hashSync } from 'bcryptjs';
import * as schema from '../src/lib/db/schema';

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString, { max: 1 });
const db = drizzle(client, { schema });

async function seed() {
  console.log('Seeding database...');

  // ─── Companies ──────────────────────────────────────
  const companyNames = [
    'BLUEAGRO', 'GLB', 'Tenedora Canett', 'Caramella',
    'Macalu', 'CALUMA', 'Gold Natural', 'CORVUS',
  ];

  const companiesInserted = await db.insert(schema.companies)
    .values(companyNames.map(name => ({ name })))
    .returning();

  console.log(`✓ ${companiesInserted.length} empresas creadas`);

  // ─── Persons ────────────────────────────────────────
  const password = hashSync('SGF2026!', 12);

  const personsData = [
    { name: 'Miguel Ortega', email: 'mortega@grupoblb.do', role: 'admin' as const },
    { name: 'José Manuel León', email: 'jleon@grupoblb.do', role: 'miembro' as const },
    { name: 'Ileana Encarnación', email: 'iencarnacion@grupoblb.do', role: 'miembro' as const },
    { name: 'Rosanna Acosta', email: 'racosta@grupoblb.do', role: 'miembro' as const },
    { name: 'Luz Elaine', email: 'lelaine@grupoblb.do', role: 'miembro' as const },
  ];

  const personsInserted = await db.insert(schema.persons)
    .values(personsData.map(p => ({ ...p, passwordHash: password })))
    .returning();

  console.log(`✓ ${personsInserted.length} personas creadas`);
  console.log('  Contraseña para todos: SGF2026!');

  const personByName = (name: string) =>
    personsInserted.find(p => p.name.includes(name))!;

  const admin = personByName('Miguel');

  // ─── Continuous space ───────────────────────────────
  const [operativo] = await db.insert(schema.spaces).values({
    name: 'Operativo finanzas',
    type: 'continuo',
    objective: 'Solicitudes operativas y pendientes sueltos del departamento',
    ownerId: admin.id,
    status: 'activo',
    openDate: '2026-09-01',
  }).returning();

  await db.insert(schema.spaceMembers).values(
    personsInserted.map(p => ({
      spaceId: operativo.id,
      personId: p.id,
      spaceRole: p.id === admin.id ? 'dueño' as const : 'colaborador' as const,
    }))
  );

  console.log(`✓ Espacio continuo "Operativo finanzas" creado`);

  // ─── Holidays 2026-2027 (Dominican Republic) ───────
  const holidays = [
    // 2026
    { date: '2026-01-01', description: 'Año Nuevo' },
    { date: '2026-01-06', description: 'Día de Reyes' },
    { date: '2026-01-21', description: 'Día de la Altagracia' },
    { date: '2026-01-26', description: 'Día de Duarte' },
    { date: '2026-02-27', description: 'Día de la Independencia' },
    { date: '2026-04-03', description: 'Viernes Santo' },
    { date: '2026-05-01', description: 'Día del Trabajo' },
    { date: '2026-06-11', description: 'Corpus Christi' },
    { date: '2026-08-16', description: 'Día de la Restauración' },
    { date: '2026-09-24', description: 'Día de las Mercedes' },
    { date: '2026-11-06', description: 'Día de la Constitución' },
    { date: '2026-12-25', description: 'Navidad' },
    // 2027
    { date: '2027-01-01', description: 'Año Nuevo' },
    { date: '2027-01-06', description: 'Día de Reyes' },
    { date: '2027-01-21', description: 'Día de la Altagracia' },
    { date: '2027-01-25', description: 'Día de Duarte' },
    { date: '2027-02-27', description: 'Día de la Independencia' },
    { date: '2027-03-26', description: 'Viernes Santo' },
    { date: '2027-05-01', description: 'Día del Trabajo' },
    { date: '2027-06-03', description: 'Corpus Christi' },
    { date: '2027-08-16', description: 'Día de la Restauración' },
    { date: '2027-09-24', description: 'Día de las Mercedes' },
    { date: '2027-11-06', description: 'Día de la Constitución' },
    { date: '2027-12-25', description: 'Navidad' },
  ];

  await db.insert(schema.holidays).values(holidays);
  console.log(`✓ ${holidays.length} feriados cargados (2026-2027)`);

  // ─── Demo project space ─────────────────────────────
  const [proyecto] = await db.insert(schema.spaces).values({
    name: 'Presupuesto 2027',
    type: 'proyecto',
    objective: 'Elaborar el presupuesto anual de las 8 empresas del grupo',
    ownerId: admin.id,
    status: 'activo',
    targetDate: '2026-11-30',
    openDate: '2026-09-01',
  }).returning();

  await db.insert(schema.spaceMembers).values(
    personsInserted.map(p => ({
      spaceId: proyecto.id,
      personId: p.id,
      spaceRole: p.id === admin.id ? 'dueño' as const : 'colaborador' as const,
    }))
  );

  const projectTasks = [
    { title: 'Recopilar datos históricos 2024-2026', responsible: 'José Manuel', dueDate: '2026-09-12', status: 'completada' as const },
    { title: 'Reunión con gerentes de cada empresa', responsible: 'Miguel', dueDate: '2026-09-19' },
    { title: 'Proyección de ingresos por empresa', responsible: 'Rosanna', dueDate: '2026-09-26' },
    { title: 'Proyección de gastos operativos', responsible: 'José Manuel', dueDate: '2026-10-03' },
    { title: 'Consolidar presupuesto del grupo', responsible: 'Luz Elaine', dueDate: '2026-10-17' },
  ];

  for (const t of projectTasks) {
    const resp = personByName(t.responsible);
    await db.insert(schema.tasks).values({
      spaceId: proyecto.id,
      title: t.title,
      responsibleId: resp.id,
      creatorId: admin.id,
      dueDate: t.dueDate,
      dueDateOriginal: t.dueDate,
      status: t.status || 'no_iniciada',
      completedAt: t.status === 'completada' ? new Date() : null,
    });
  }

  console.log(`✓ Proyecto "Presupuesto 2027" creado con ${projectTasks.length} tareas`);

  // ─── Some tasks in the continuous space ─────────────
  const opTasks = [
    { title: 'Solicitar estado de cuenta Banco Popular - CALUMA', responsible: 'Ileana', dueDate: '2026-09-05' },
    { title: 'Revisar factura proveedor #4521', responsible: 'Rosanna' },
    { title: 'Actualizar registro de activos fijos GLB', responsible: 'José Manuel', dueDate: '2026-09-10' },
  ];

  for (const t of opTasks) {
    const resp = personByName(t.responsible);
    await db.insert(schema.tasks).values({
      spaceId: operativo.id,
      title: t.title,
      responsibleId: resp.id,
      creatorId: admin.id,
      dueDate: t.dueDate || null,
      dueDateOriginal: t.dueDate || null,
    });
  }

  console.log(`✓ ${opTasks.length} tareas operativas creadas`);

  console.log('\n✅ Seed completado');
  process.exit(0);
}

seed().catch(err => {
  console.error('Error en seed:', err);
  process.exit(1);
});
