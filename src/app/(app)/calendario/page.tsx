'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession } from '@/lib/hooks/use-session';
import { ChevronLeft, ChevronRight, CalendarDays, Users } from 'lucide-react';

type CalTask = {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  priority: string;
  spaceName: string;
  responsibleName?: string;
  responsibleId?: string;
};

const STATUS_DOT: Record<string, string> = {
  no_iniciada: 'bg-gray-400',
  en_proceso: 'bg-blue-500',
  en_revision: 'bg-yellow-500',
  completada: 'bg-green-500',
  bloqueada: 'bg-red-500',
};

const PRIORITY_BORDER: Record<string, string> = {
  critica: 'border-l-2 border-l-red-500',
  alta: 'border-l-2 border-l-amber-500',
  normal: '',
  baja: 'border-l-2 border-l-gray-300',
};

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export default function CalendarioPage() {
  const { user } = useSession();
  const [tasks, setTasks] = useState<CalTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [selectedPerson, setSelectedPerson] = useState('all');
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (isAdmin) {
      fetch('/api/users').then(r => r.ok ? r.json() : []).then(setPeople);
    }
  }, [isAdmin]);

  useEffect(() => {
    const url = isAdmin
      ? `/api/calendar?personId=${selectedPerson}`
      : '/api/calendar';
    fetch(url)
      .then(r => r.ok ? r.json() : [])
      .then(setTasks)
      .finally(() => setLoading(false));
  }, [isAdmin, selectedPerson]);

  const tasksByDate = useMemo(() => {
    const map: Record<string, CalTask[]> = {};
    for (const t of tasks) {
      if (t.dueDate) {
        if (!map[t.dueDate]) map[t.dueDate] = [];
        map[t.dueDate].push(t);
      }
    }
    return map;
  }, [tasks]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    let startDow = firstDay.getDay();
    if (startDow === 0) startDow = 7;

    const days: (number | null)[] = [];
    for (let i = 1; i < startDow; i++) days.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) days.push(d);
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }, [year, month]);

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }

  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  function toDateStr(day: number) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-64 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-gray-900">Calendario</h1>
          {isAdmin && (
            <div className="flex items-center gap-2 ml-4">
              <Users size={16} className="text-gray-400" />
              <select
                value={selectedPerson}
                onChange={e => setSelectedPerson(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
              >
                <option value="all">Todos los usuarios</option>
                {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => { setYear(new Date().getFullYear()); setMonth(new Date().getMonth()); }}
            className="px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-md">
            Hoy
          </button>
          <button onClick={prevMonth} className="p-1.5 rounded hover:bg-gray-100 text-gray-600">
            <ChevronLeft size={20} />
          </button>
          <span className="text-sm font-medium text-gray-900 w-40 text-center">
            {MONTH_NAMES[month]} {year}
          </span>
          <button onClick={nextMonth} className="p-1.5 rounded hover:bg-gray-100 text-gray-600">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
          {DAY_NAMES.map(d => (
            <div key={d} className="px-2 py-2 text-xs font-medium text-gray-500 text-center uppercase">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {calendarDays.map((day, i) => {
            if (day === null) return <div key={i} className="min-h-[80px] border-b border-r border-gray-100 bg-gray-50/50" />;
            const dateStr = toDateStr(day);
            const dayTasks = tasksByDate[dateStr] || [];
            const isToday = dateStr === todayStr;
            const isPast = dateStr < todayStr;

            return (
              <div key={i} className={`min-h-[80px] border-b border-r border-gray-100 p-1 ${isToday ? 'bg-blue-50/50' : ''}`}>
                <div className="flex items-center justify-between px-1">
                  <span className={`text-xs font-medium ${
                    isToday ? 'bg-blue-600 text-white w-5 h-5 rounded-full flex items-center justify-center' :
                    isPast ? 'text-gray-400' : 'text-gray-700'
                  }`}>
                    {day}
                  </span>
                  {dayTasks.length > 3 && (
                    <span className="text-[10px] text-gray-400">
                      {dayTasks.length}
                    </span>
                  )}
                </div>
                <div className="mt-1 space-y-0.5">
                  {dayTasks.slice(0, 3).map(t => (
                    <a
                      key={t.id}
                      href={`/tareas/${t.id}`}
                      className={`flex items-center gap-1 px-1 py-0.5 rounded hover:bg-gray-100 transition-colors group ${PRIORITY_BORDER[t.priority] || ''}`}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[t.status] || 'bg-gray-400'}`} />
                      <span className="text-[11px] text-gray-700 truncate group-hover:text-blue-600">
                        {t.title}
                      </span>
                    </a>
                  ))}
                  {dayTasks.length > 3 && (
                    <span className="text-[10px] text-gray-400 px-1">
                      +{dayTasks.length - 3} más
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {tasks.length === 0 && (
        <div className="text-center py-12 mt-4">
          <CalendarDays size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 text-sm">No hay tareas programadas</p>
          <p className="text-xs text-gray-400 mt-1">
            {isAdmin && selectedPerson === 'all'
              ? 'No hay tareas con fecha límite asignadas a ningún usuario'
              : 'Asigna fechas límite a tus tareas para verlas aquí'}
          </p>
        </div>
      )}
    </div>
  );
}
