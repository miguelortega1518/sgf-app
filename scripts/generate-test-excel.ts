import * as XLSX from 'xlsx';
import path from 'path';

const wb = XLSX.utils.book_new();

// Sheet matching company "BLUEAGRO"
const blueagroData = [
  { Actividad: 'Conciliación bancaria', Responsable: 'José Manuel', Duracion: 2, Estado: '' },
  { Actividad: 'Revisión de nómina', Responsable: 'Ileana', Duracion: 3, Estado: '' },
  { Actividad: 'Archivo digital', Responsable: 'Rosanna', Duracion: 1, Estado: 'x' },
];
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(blueagroData), 'BLUEAGRO');

// Sheet matching company "GLB"
const glbData = [
  { Actividad: 'Declaración DGII', Responsable: 'Miguel', Duracion: 5, Estado: '' },
  { Actividad: 'Pago de impuestos', Responsable: 'José Manuel', Duracion: 2, Estado: '' },
];
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(glbData), 'GLB');

// Sheet matching company "Caramella"
const caramellaData = [
  { Actividad: 'Registro de facturas', Responsable: 'Luz Elaine', Duracion: 4, Estado: '' },
  { Actividad: 'Reporte mensual', Responsable: 'Ileana', Duracion: 3, Estado: 'no aplica' },
];
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(caramellaData), 'Caramella');

// Sheet that won't match any company (should be skipped)
const unknownData = [
  { Actividad: 'Tarea fantasma', Responsable: 'Nadie', Duracion: 1, Estado: '' },
];
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(unknownData), 'EmpresaDesconocida');

const outPath = path.join(__dirname, '..', 'test-import.xlsx');
XLSX.writeFile(wb, outPath);
console.log(`Test Excel written to ${outPath}`);
