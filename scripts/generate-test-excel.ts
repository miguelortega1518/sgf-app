import { writeFileSync } from 'fs';
import path from 'path';
import { buildWorkbook } from '../src/lib/excel';

// Sheet matching company "BLUEAGRO"
const blueagroData = [
  { Actividad: 'Conciliación bancaria', Responsable: 'José Manuel', Duracion: 2, Estado: '' },
  { Actividad: 'Revisión de nómina', Responsable: 'Ileana', Duracion: 3, Estado: '' },
  { Actividad: 'Archivo digital', Responsable: 'Rosanna', Duracion: 1, Estado: 'x' },
];

// Sheet matching company "GLB"
const glbData = [
  { Actividad: 'Declaración DGII', Responsable: 'Miguel', Duracion: 5, Estado: '' },
  { Actividad: 'Pago de impuestos', Responsable: 'José Manuel', Duracion: 2, Estado: '' },
];

// Sheet matching company "Caramella"
const caramellaData = [
  { Actividad: 'Registro de facturas', Responsable: 'Luz Elaine', Duracion: 4, Estado: '' },
  { Actividad: 'Reporte mensual', Responsable: 'Ileana', Duracion: 3, Estado: 'no aplica' },
];

// Sheet that won't match any company (should be skipped)
const unknownData = [
  { Actividad: 'Tarea fantasma', Responsable: 'Nadie', Duracion: 1, Estado: '' },
];

const outPath = path.join(__dirname, '..', 'test-import.xlsx');

buildWorkbook([{ name: 'BLUEAGRO', rows: blueagroData }, { name: 'GLB', rows: glbData }, { name: 'Caramella', rows: caramellaData }, { name: 'EmpresaDesconocida', rows: unknownData }]).then(buf => {
  writeFileSync(outPath, buf);
  console.log(`Test Excel written to ${outPath}`);
});
