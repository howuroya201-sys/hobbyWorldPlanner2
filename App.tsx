/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  ChevronLeft, 
  ChevronRight, 
  ChevronUp,
  ChevronDown,
  Plus, 
  Settings, 
  Users, 
  Search,
  Layers,
  Cpu,
  Sparkles,
  Calendar,
  MoreVertical,
  Trash2,
  X,
  Upload,
  ArrowRight,
  Play,
  Check,
  Activity,
  AlertCircle,
  Download,
  Lock,
  Unlock,
  LogOut,
  Minus,
  SortAsc,
  EyeOff,
  Undo2,
  ExternalLink,
  MessageSquare
} from 'lucide-react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameDay, 
  addDays, 
  differenceInDays,
  differenceInWeeks,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  isWithinInterval,
  getDaysInMonth
} from 'date-fns';
import { ru } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---

const WEIGHT_OPTIONS: Array<number | string> = [1, 2, 3, '3Н', 4, 5, '5Н'];

const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

const getNumericWeight = (w: number | string | undefined | null): number => {
  if (w === undefined || w === null) return 1;
  if (typeof w === 'number') return w;
  const num = parseInt(String(w), 10);
  return isNaN(num) ? 1 : num;
};

const getRegulatoryDurationsForWeight = (weightOpt: number | string): Record<string, number> => {
  const w = String(weightOpt).trim().toUpperCase();
  const ruWeight = w.replace('H', 'Н'); // Replace Latin H with Russian Н for uniformity
  
  const dForce: Record<string, number> = {
    'Концептирование': 2,
    'Девелопмент': 2,
    'Арт Продакшн': 2,
    'Редактирование': 14, // default
    'Дизайн и вёрстка': 9, // default
    'Производство и старт продаж': 8 // "Также всегда ставь стартовое значение сроков на производство на 8 недель"
  };

  // Редактура:
  if (ruWeight === '1') dForce['Редактирование'] = 8;
  else if (ruWeight === '2') dForce['Редактирование'] = 11;
  else if (ruWeight === '3') dForce['Редактирование'] = 14;
  else if (ruWeight === '3Н') dForce['Редактирование'] = 17;
  else if (ruWeight === '4') dForce['Редактирование'] = 20;
  else if (ruWeight === '5') dForce['Редактирование'] = 27;
  else if (ruWeight === '5Н') dForce['Редактирование'] = 27;

  // Дизайн и Верстка:
  if (ruWeight === '1') dForce['Дизайн и вёрстка'] = 6;
  else if (ruWeight === '2') dForce['Дизайн и вёрстка'] = 7;
  else if (ruWeight === '3') dForce['Дизайн и вёрстка'] = 9;
  else if (ruWeight === '3Н') dForce['Дизайн и вёрстка'] = 11;
  else if (ruWeight === '4') dForce['Дизайн и вёрстка'] = 13;
  else if (ruWeight === '5') dForce['Дизайн и вёрстка'] = 17;
  else if (ruWeight === '5Н') dForce['Дизайн и вёрстка'] = 17;

  // Девелопмент:
  if (ruWeight === '1') dForce['Девелопмент'] = 5;
  else if (ruWeight === '2') dForce['Девелопмент'] = 13;
  else if (ruWeight === '3') dForce['Девелопмент'] = 19;
  else if (ruWeight === '3Н') dForce['Девелопмент'] = 27;
  else if (ruWeight === '4') dForce['Девелопмент'] = 31;
  else if (ruWeight === '5') dForce['Девелопмент'] = 34;
  else if (ruWeight === '5Н') dForce['Девелопмент'] = 52;

  // Арт Продакшн: starts alongside Девелопмент, but must run long enough to
  // end exactly when Дизайн и вёрстка starts. Редактирование and Дизайн и
  // вёрстка both end together (see recalculateAllDates), so Дизайн и вёрстка
  // starts (Редактирование − Дизайн и вёрстка) weeks after Девелопмент ends —
  // hence Арт Продакшн is always longer than Девелопмент by that same margin.
  dForce['Арт Продакшн'] = dForce['Девелопмент'] + dForce['Редактирование'] - dForce['Дизайн и вёрстка'];

  return dForce;
};

// Helper to convert Google Drive share links to direct image links
const getDriveDirectLink = (url: string) => {
  if (!url || url.startsWith('data:') || url.length > 512) return url;
  const driveRegex = /\/file\/d\/([^\/?]+)/;
  const match = url.match(driveRegex);
  if (match && match[1]) {
    // Note: This works for public files. For private files, proper OAuth would be needed.
    return `https://drive.google.com/uc?export=view&id=${match[1]}`;
  }
  return url;
};

const getProjectReleaseDate = (project: Project): Date => {
  return project.resources.reduce((maxDate, r) => {
    const taskMax = r.tasks.reduce((maxT, t) => {
      const end = addDays(new Date(t.startDate), t.duration);
      return end > maxT ? end : maxT;
    }, new Date(0));
    return taskMax > maxDate ? taskMax : maxDate;
  }, new Date(0));
};

const getEarliestTaskStartDate = (project: Project): Date => {
  let minDate = new Date(8640000000000000); // Max Date
  project.resources.forEach(r => {
    r.tasks.forEach(t => {
      const d = new Date(t.startDate);
      if (d < minDate) {
        minDate = d;
      }
    });
  });
  if (minDate.getTime() === 8640000000000000) {
    return new Date();
  }
  return minDate;
};

const getProjectReleaseTask = (project: Project): Task | undefined => {
  let latestTask: Task | undefined = undefined;
  let latestEndDate = new Date(0);

  project.resources.forEach(r => {
    r.tasks.forEach(t => {
      const end = addDays(new Date(t.startDate), t.duration);
      if (end > latestEndDate) {
        latestEndDate = end;
        latestTask = t;
      }
    });
  });
  return latestTask;
};

type TaskColor = 'green' | 'red' | 'blue' | 'yellow' | 'gray' | 'purple' | 'indigo' | 'darkred' | 'lightpink';

type TaskStatus = 'neutral' | 'started' | 'finished' | 'overdue';

interface Task {
  id: string;
  label: string;
  startDate: Date;
  duration: number; // in days
  color: TaskColor;
  status: TaskStatus;
  segment?: string;
  isDelay?: boolean;
  isRisk?: boolean;
  comment?: string;
}

interface Resource {
  id: string;
  role: string;
  name: string;
  tasks: Task[];
  isSpecialRow?: boolean;
}

interface Project {
  id: string;
  name: string;
  weight: number | string;
  imageUrl?: string;
  trackerUrl?: string;
  segment?: string;
  resources: Resource[];
  isPrototype?: boolean;
  isMhi?: boolean;
  sortOrder?: number;
  excludeFromReleases?: boolean;
  releaseYear?: number;
  artDirectorRole?: 'artist' | 'curator';
  isCollapsed?: boolean;
  hasForeignComponents?: boolean;
  hasSmallBatch?: boolean;
  componentsNote?: string;
  publisher?: string;
  editorialStatus?: string;
  // Date (yyyy-MM-dd) the editorial "Факт" bar's growing end was frozen at,
  // set when editorialStatus enters PAUSE_STATUS_VALUE and cleared when it
  // leaves — see PAUSE_STATUS_VALUE for why this only matters absent an
  // explicit printReadyDate override.
  editorialPausedAt?: string;
  currentTaskNote?: string;
  editorialComment?: string;
  tzLayoutDate?: string;
  editStartDate?: string;
  printReadyDate?: string;
  inEditorialLayout?: boolean;
  rulesDate?: string;
  layoutStartDate?: string;
  componentsLayoutDate?: string;
  boxLayoutDate?: string;
  rulesLayoutDate?: string;
  approvalDate?: string;
  postLayoutDate?: string;
  // "Девелопмент" tab — separate opt-in list and fields from the editorial
  // ones above, even where conceptually parallel (e.g. devStatus vs
  // editorialStatus), since a project can be in both tables independently
  // and the two workflows' notes/status shouldn't leak into each other.
  inDevelopmentLayout?: boolean;
  devStatus?: string;
  devPausedAt?: string;
  devDocNote?: string;
  devComment?: string;
  devStartDate?: string;
  devToEditorialDate?: string;
  devDocDate?: string;
  devCoreDate?: string;
  devGameDate?: string;
  devFinalizationDate?: string;
  // "Концептирование и арт-продакшн" tab — same independence rationale as
  // the Девелопмент fields above.
  inArtLayout?: boolean;
  artStatus?: string;
  artPausedAt?: string;
  artTaskNote?: string;
  artComment?: string;
  artStartDate?: string;
  artToLayoutDate?: string;
  artTzDate?: string;
  artContractorDate?: string;
  artStyleDate?: string;
  artDrawingDate?: string;
  artFinalizationDate?: string;
}

interface User {
  id: string;
  name: string;
  imageUrl?: string;
  roles: string[];
  isCollapsed?: boolean;
  vacations?: Array<{
    id: string;
    startDate: string;
    endDate: string;
    isHoliday?: boolean;
    holidayName?: string;
  }>;
}

const getRussianHolidaysForYear = (year: number) => {
  return [
    {
      id: `ru-holiday-${year}-01-01`,
      startDate: `${year}-01-01`,
      endDate: `${year}-01-09`,
      holidayName: 'Новогодние каникулы',
      isHoliday: true
    },
    {
      id: `ru-holiday-${year}-02-23`,
      startDate: `${year}-02-23`,
      endDate: `${year}-02-24`,
      holidayName: 'День защитника Отечества',
      isHoliday: true
    },
    {
      id: `ru-holiday-${year}-03-08`,
      startDate: `${year}-03-08`,
      endDate: `${year}-03-09`,
      holidayName: 'Международный женский день',
      isHoliday: true
    },
    {
      id: `ru-holiday-${year}-05-01`,
      startDate: `${year}-05-01`,
      endDate: `${year}-05-02`,
      holidayName: 'Праздник Весны и Труда',
      isHoliday: true
    },
    {
      id: `ru-holiday-${year}-05-09`,
      startDate: `${year}-05-09`,
      endDate: `${year}-05-10`,
      holidayName: 'День Победы',
      isHoliday: true
    },
    {
      id: `ru-holiday-${year}-06-12`,
      startDate: `${year}-06-12`,
      endDate: `${year}-06-13`,
      holidayName: 'День России',
      isHoliday: true
    },
    {
      id: `ru-holiday-${year}-11-04`,
      startDate: `${year}-11-04`,
      endDate: `${year}-11-05`,
      holidayName: 'День народного единства',
      isHoliday: true
    }
  ];
};

// --- Constants ---

const TASK_STATUS_ICONS: Record<TaskStatus, React.ReactNode | null> = {
  neutral: null,
  started: <Play size={10} className="fill-current" />,
  finished: <Check size={10} strokeWidth={3} />,
  overdue: <X size={10} strokeWidth={3} />,
};

const ROLES = {
  PRODUCER: 'Продюсер',
  DEVELOPER: 'Девелопер',
  ART_DIRECTOR: 'Арт-директор',
  EDITOR: 'Редактор',
  LAYOUT_ARTIST: 'Верстальщик'
} as const;

// Shared "На паузе" status value, added last (behind its own extra divider,
// separate from each tab's own below-line status group) to the status list
// on all three of Редактура-и-вёрстка/Девелопмент/Концептирование-и-арт-
// продакшн. Falling after each tab's UPPER_GROUP_SIZE boundary, it's already
// included in that tab's own BELOW_LINE_STATUSES set, so no extra code is
// needed for it to override the "Факт" bar's label — see
// getEditorialFactLabel/getDevFactLabel/getArtFactLabel. What IS special
// about it: while a project's status is PAUSE_STATUS_VALUE, the growing
// "Факт" bar's end (which otherwise advances to `new Date()` every render
// until the corresponding override date is filled in) freezes at the date
// the pause began (project.editorialPausedAt/devPausedAt/artPausedAt) — see
// the factEndRaw computation in the Проекты-tab Gantt render. Clearing the
// pause (selecting any other status) drops back to `new Date()`, so growth
// resumes from that day forward rather than jumping to make up the paused
// days.
const PAUSE_STATUS_VALUE = 'На паузе';

const EDITORIAL_STATUSES: { value: string; className: string }[] = [
  { value: 'Арт', className: 'bg-green-100 text-green-700' },
  { value: 'Редактура', className: 'bg-rose-100 text-rose-700' },
  { value: 'Дизайн', className: 'bg-fuchsia-100 text-fuchsia-700' },
  { value: 'Вёрстка', className: 'bg-purple-100 text-purple-700' },
  { value: 'Тестирование', className: 'bg-cyan-100 text-cyan-700' },
  { value: 'Пост-вёрстка', className: 'bg-emerald-100 text-emerald-700' },
  { value: 'Согласование', className: 'bg-sky-100 text-sky-700' },
  { value: 'Затык', className: 'bg-red-100 text-red-700' },
  { value: 'Ждём тираж', className: 'bg-amber-100 text-amber-700' },
  { value: 'Препресс', className: 'bg-indigo-100 text-indigo-700' },
  { value: 'Сдано', className: 'bg-teal-100 text-teal-700' },
  { value: PAUSE_STATUS_VALUE, className: 'bg-slate-200 text-slate-600' },
];

// In the "Редактура и вёрстка" status dropdown, everything through
// "Пост-вёрстка" renders above a visual divider, the rest below — see
// CLAUDE.md for why "Тестирование" sits in the upper group.
const EDITORIAL_STATUS_UPPER_GROUP_SIZE = 6;

// The statuses below that divider (Согласование/Затык/Ждём тираж/Сдано)
// aren't tied to a single stage, so when one of them is set it overrides
// the stage-derived "Факт" bar label on the Проекты tab for both the
// Редактирование and Дизайн-и-вёрстка rows — see getEditorialFactLabel.
const EDITORIAL_BELOW_LINE_STATUSES = EDITORIAL_STATUSES.slice(EDITORIAL_STATUS_UPPER_GROUP_SIZE).map(s => s.value);

// Label for the "Факт" overlay bar on the Проекты tab's Gantt: reflects
// whichever editorial-table date column was most recently filled in for
// that stage (Редактирование vs Дизайн и вёрстка chase different column
// chains), unless editorialStatus is one of EDITORIAL_BELOW_LINE_STATUSES,
// which overrides both rows' labels outright. Checked from the most
// advanced state backward so it's correct even if earlier columns in the
// chain were skipped.
const getEditorialFactLabel = (project: Project, role: 'Редактирование' | 'Дизайн и вёрстка'): string => {
  if (project.editorialStatus && EDITORIAL_BELOW_LINE_STATUSES.includes(project.editorialStatus)) {
    return project.editorialStatus;
  }
  if (role === 'Редактирование') {
    if (project.postLayoutDate) return 'Сдано';
    if (project.rulesDate) return 'Менеджмент вёрстки';
    if (project.tzLayoutDate) return 'Написание правил';
    return 'ТЗ на вёрстку';
  }
  if (project.postLayoutDate) return 'Сдано';
  if (project.rulesLayoutDate) return 'Согласование и пост-вёрстка';
  if (project.boxLayoutDate) return 'Вёрстка правил';
  if (project.componentsLayoutDate) return 'Вёрстка коробки';
  return 'Вёрстка компонентов';
};

// "Девелопмент" tab's own status list — separate from EDITORIAL_STATUSES,
// a different workflow with its own (shorter) set of stages/states.
const DEV_STATUSES: { value: string; className: string }[] = [
  { value: 'Девелопмент', className: 'bg-purple-100 text-purple-700' },
  { value: 'Тестирование', className: 'bg-cyan-100 text-cyan-700' },
  { value: 'Финализация', className: 'bg-emerald-100 text-emerald-700' },
  { value: 'Согласование', className: 'bg-sky-100 text-sky-700' },
  { value: 'Затык', className: 'bg-red-100 text-red-700' },
  { value: 'Сдано', className: 'bg-teal-100 text-teal-700' },
  { value: PAUSE_STATUS_VALUE, className: 'bg-slate-200 text-slate-600' },
];

// Same divider convention as EDITORIAL_STATUS_UPPER_GROUP_SIZE: statuses
// through this index render above the dropdown's divider and don't affect
// the "Факт" label; the rest render below it and do.
const DEV_STATUS_UPPER_GROUP_SIZE = 3;
const DEV_BELOW_LINE_STATUSES = DEV_STATUSES.slice(DEV_STATUS_UPPER_GROUP_SIZE).map(s => s.value);

// Column display order for the "Девелопмент" table's 4 rightmost date
// columns — unlike EDITORIAL_PLAN_DISPLAY_ORDER there's no regulatory plan
// chain behind these at all (every project is treated like a МХИ project in
// the editorial table: no suggested dates, only manual entries).
const DEV_STAGE_DISPLAY_ORDER = ['devDocDate', 'devCoreDate', 'devGameDate', 'devFinalizationDate'] as const;

// Label for the "Факт" overlay bar on the Девелопмент resource row: mirrors
// getEditorialFactLabel's shape (most-advanced-state-backward, below-line
// status overrides outright) but with a single chain instead of two, and
// each column's own name doubling as the "what's next" label — there's no
// separate label vocabulary for this tab the way editorial has one.
const getDevFactLabel = (project: Project): string => {
  if (project.devStatus && DEV_BELOW_LINE_STATUSES.includes(project.devStatus)) {
    return project.devStatus;
  }
  if (project.devFinalizationDate) return 'Сдано';
  if (project.devGameDate) return 'Финализация';
  if (project.devCoreDate) return 'Девелопмент игры';
  if (project.devDocDate) return 'Работа над ядром';
  return 'Создание девдока';
};

// "Концептирование и арт-продакшн" tab's own status list — separate from
// EDITORIAL_STATUSES/DEV_STATUSES, own (short) workflow vocabulary.
const ART_STATUSES: { value: string; className: string }[] = [
  { value: 'Составление ТЗ', className: 'bg-cyan-100 text-cyan-700' },
  { value: 'Поиск подрядчика', className: 'bg-purple-100 text-purple-700' },
  { value: 'Отрисовка', className: 'bg-fuchsia-100 text-fuchsia-700' },
  { value: 'Согласование', className: 'bg-sky-100 text-sky-700' },
  { value: 'Затык', className: 'bg-red-100 text-red-700' },
  { value: 'Сдано', className: 'bg-teal-100 text-teal-700' },
  { value: PAUSE_STATUS_VALUE, className: 'bg-slate-200 text-slate-600' },
];

const ART_STATUS_UPPER_GROUP_SIZE = 3;
const ART_BELOW_LINE_STATUSES = ART_STATUSES.slice(ART_STATUS_UPPER_GROUP_SIZE).map(s => s.value);

// Column display order for the "Концептирование и арт-продакшн" table's 5
// rightmost date columns — same "no regulatory plan chain, MHI-style blank
// until filled in" rule as DEV_STAGE_DISPLAY_ORDER.
const ART_STAGE_DISPLAY_ORDER = ['artTzDate', 'artContractorDate', 'artStyleDate', 'artDrawingDate', 'artFinalizationDate'] as const;

// Label for the "Факт" overlay bar on the Арт Продакшн resource row —
// same shape as getDevFactLabel (most-advanced-state-backward, below-line
// status overrides outright, intermediate labels are the column names).
const getArtFactLabel = (project: Project): string => {
  if (project.artStatus && ART_BELOW_LINE_STATUSES.includes(project.artStatus)) {
    return project.artStatus;
  }
  if (project.artFinalizationDate) return 'Сдано';
  if (project.artDrawingDate) return 'Финализация';
  if (project.artStyleDate) return 'Отрисовка';
  if (project.artContractorDate) return 'Согласование стиля';
  if (project.artTzDate) return 'Поиск подрядчика';
  return 'Составление ТЗ';
};

// Working-day durations for each auto-planned stage in the "Редактура и
// вёрстка" table, keyed by project weight. Each stage's plan date is the
// previous stage's plan date plus its own entry here (a running chain that
// starts from "Старт"), matching the fixed order the columns are shown in.
const EDITORIAL_PLAN_DAYS: Record<string, Record<string, number>> = {
  tzLayoutDate: { '1': 6, '2': 8, '3': 12, '3Н': 20, '4': 15, '5': 17 },
  rulesDate: { '1': 7, '2': 12, '3': 15, '3Н': 12, '4': 22, '5': 32 },
  componentsLayoutDate: { '1': 5, '2': 10, '3': 15, '3Н': 25, '4': 25, '5': 40 },
  boxLayoutDate: { '1': 5, '2': 6, '3': 6, '3Н': 7, '4': 7, '5': 8 },
  rulesLayoutDate: { '1': 3, '2': 6, '3': 10, '3Н': 6, '4': 15, '5': 20 },
  approvalDate: { '1': 10, '2': 10, '3': 10, '3Н': 10, '4': 14, '5': 14 },
  postLayoutDate: { '1': 5, '2': 5, '3': 5, '3Н': 5, '4': 5, '5': 5 },
};

const EDITORIAL_PLAN_CHAIN_ORDER = ['tzLayoutDate', 'rulesDate', 'componentsLayoutDate', 'boxLayoutDate', 'rulesLayoutDate', 'approvalDate', 'postLayoutDate'] as const;

// "Старт вёрстки" isn't part of the cumulative chain above — by regulation it
// always starts 1 working day after "ТЗ на вёрстку" regardless of weight, not
// after "Правила" even though it's displayed between those two columns.
const EDITORIAL_PLAN_DISPLAY_ORDER = ['tzLayoutDate', 'rulesDate', 'layoutStartDate', 'componentsLayoutDate', 'boxLayoutDate', 'rulesLayoutDate', 'approvalDate', 'postLayoutDate'] as const;

// "3Н"/"3H" (Cyrillic vs Latin Н) both occur in the data; "5Н" has no row of
// its own in the table above, so it falls back to the plain "5" durations.
const normalizeWeightKey = (weight: number | string): string => {
  const w = String(weight).trim().toUpperCase().replace('H', 'Н');
  if (w === '5Н') return '5';
  return w;
};

const isRussianHoliday = (date: Date): boolean => {
  const holidays = getRussianHolidaysForYear(date.getFullYear());
  return holidays.some(h => date >= new Date(h.startDate) && date < new Date(h.endDate));
};

const isWorkingDay = (date: Date): boolean => {
  const dow = date.getDay();
  return dow !== 0 && dow !== 6 && !isRussianHoliday(date);
};

// Skips weekends and Russian public holidays while counting; `days` may be
// negative to walk backward (used when a deadline is fixed and the start
// date has to be derived from it).
const addWorkingDays = (date: Date, days: number): Date => {
  let result = date;
  const step = days >= 0 ? 1 : -1;
  let remaining = Math.abs(days);
  while (remaining > 0) {
    result = addDays(result, step);
    if (isWorkingDay(result)) remaining--;
  }
  return result;
};

// Inverse of addWorkingDays — how many working days fall in [start, end).
// Used to recover a stage's "weeks" input from its stored calendar-day
// duration, since that duration is no longer a flat weeks*7 and depends on
// which holidays happened to fall inside that specific stretch.
const countWorkingDays = (start: Date, end: Date): number => {
  let count = 0;
  let cur = start;
  while (cur < end) {
    if (isWorkingDay(cur)) count++;
    cur = addDays(cur, 1);
  }
  return count;
};

const getEditorialPlanChain = (startDate: Date | null, weight: number | string): Record<string, Date | null> => {
  const chain: Record<string, Date | null> = {};
  if (!startDate) {
    EDITORIAL_PLAN_CHAIN_ORDER.forEach(field => { chain[field] = null; });
    chain['layoutStartDate'] = null;
    return chain;
  }
  const weightKey = normalizeWeightKey(weight);
  let cursor = startDate;
  EDITORIAL_PLAN_CHAIN_ORDER.forEach(field => {
    const days = EDITORIAL_PLAN_DAYS[field][weightKey];
    cursor = days !== undefined ? addWorkingDays(cursor, days) : cursor;
    chain[field] = cursor;
  });
  chain['layoutStartDate'] = chain['tzLayoutDate'] ? addWorkingDays(chain['tzLayoutDate'] as Date, 1) : null;
  return chain;
};

const STAGE_TO_ROLE: Record<string, string> = {
  'Концептирование': ROLES.PRODUCER,
  'Девелопмент': ROLES.DEVELOPER,
  'Арт Продакшн': ROLES.ART_DIRECTOR,
  'Редактирование': ROLES.EDITOR,
  'Дизайн и вёрстка': ROLES.LAYOUT_ARTIST
};

const getTaskColor = (role: string): TaskColor => {
  const r = role.toLowerCase();
  if (r.includes('девелопмент') || r.includes('development')) return 'purple';
  if (r.includes('арт продакшн') || r.includes('art production')) return 'red';
  if (r.includes('редактирование')) return 'blue';
  if (r.includes('дизайн') || r.includes('вёрстка')) return 'green';
  if (r.includes('производство')) return 'gray';
  if (r.includes('концептирование')) return 'yellow';
  return 'blue';
};

const COLORS: Record<TaskColor, string> = {
  green: 'bg-emerald-500 border-emerald-600',
  red: 'bg-rose-500 border-rose-600',
  blue: 'bg-sky-500 border-sky-600',
  yellow: 'bg-amber-400 border-amber-500',
  gray: 'bg-slate-400 border-slate-500',
  purple: 'bg-purple-500 border-purple-600',
  indigo: 'bg-indigo-500 border-indigo-600',
  darkred: 'bg-red-800 border-red-900',
  lightpink: 'bg-pink-300 border-pink-400 text-pink-950',
};

const CELL_WIDTH = 80; // width of one week in the grid (Week zoom level)
const MONTH_ZOOM_CELL_WIDTH = 26; // width of one week in the grid at the Month zoom level
const DAY_ZOOM_CELL_WIDTH = 336; // width of one week in the grid at the Day zoom level (48px/day)
const ROW_HEIGHT = 48; // height of a resource row

const DEFAULT_STAGES = [
  'Концептирование',
  'Девелопмент',
  'Арт Продакшн',
  'Редактирование',
  'Дизайн и вёрстка'
];

// --- Mock Data ---

const INITIAL_DATA: Project[] = [
  {
    id: 'p1',
    name: 'Три на Три',
    weight: 2,
    imageUrl: 'https://picsum.photos/seed/p1/200/120',
    resources: [
      { id: 'r1', role: 'Концептирование', name: 'Владимир Грачев', tasks: [] },
      { id: 'r2', role: 'Девелопмент', name: 'Матвей Чистяков', tasks: [] },
      { id: 'r3', role: 'Арт Продакшн', name: 'Наталья Кондратюк', tasks: [] },
      { id: 'r4', role: 'Редактирование', name: 'Анна Давыдова', tasks: [] },
      { id: 'r5', role: 'Дизайн и вёрстка', name: 'Юлия Калиновская', tasks: [
        { id: 't1', label: 'печать', startDate: new Date(2026, 4, 5), duration: 14, color: 'green', status: 'finished' },
        { id: 't2', label: 'СТАРТ ПРОДАЖ', startDate: new Date(2026, 5, 2), duration: 7, color: 'green', status: 'neutral' }
      ] },
      { id: 'p1-special', role: 'Производство и старт продаж', name: '', tasks: [], isSpecialRow: true },
    ]
  },
  {
    id: 'p2',
    name: 'Турбозавры: Турбогонки',
    weight: 2,
    imageUrl: 'https://picsum.photos/seed/p2/200/120',
    resources: [
      { id: 'r6', role: 'Концептирование', name: 'Артем Шорохов', tasks: [] },
      { id: 'r7', role: 'Девелопмент', name: 'Сергей Притула', tasks: [] },
      { id: 'r8', role: 'Арт Продакшн', name: 'Ольга Дребас', tasks: [] },
      { id: 'r9', role: 'Редактирование', name: 'Луиза Кретова', tasks: [] },
      { id: 'r10', role: 'Дизайн и вёрстка', name: 'Сергей Агапов', tasks: [
        { id: 't3', label: 'печать', startDate: new Date(2026, 4, 12), duration: 14, color: 'green', status: 'neutral' },
        { id: 't4', label: 'СТАРТ ПРОДАЖ', startDate: new Date(2026, 5, 10), duration: 7, color: 'green', status: 'neutral' }
      ] },
      { id: 'p2-special', role: 'Производство и старт продаж', name: '', tasks: [], isSpecialRow: true },
    ]
  }
];

const INITIAL_USERS: User[] = [
  { id: 'u1', name: 'Владимир Грачев', imageUrl: 'https://i.pravatar.cc/150?u=u1', roles: [ROLES.PRODUCER] },
  { id: 'u2', name: 'Матвей Чистяков', imageUrl: 'https://i.pravatar.cc/150?u=u2', roles: [ROLES.DEVELOPER] },
  { id: 'u3', name: 'Наталья Кондратюк', imageUrl: 'https://i.pravatar.cc/150?u=u3', roles: [ROLES.ART_DIRECTOR] },
  { id: 'u4', name: 'Анна Давыдова', imageUrl: 'https://i.pravatar.cc/150?u=u4', roles: [ROLES.EDITOR] },
  { id: 'u5', name: 'Юлия Калиновская', imageUrl: 'https://i.pravatar.cc/150?u=u5', roles: [ROLES.LAYOUT_ARTIST] },
  { id: 'u6', name: 'Артем Шорохов', imageUrl: 'https://i.pravatar.cc/150?u=u6', roles: [ROLES.PRODUCER, ROLES.ART_DIRECTOR] },
  { id: 'u7', name: 'Сергей Притула', imageUrl: 'https://i.pravatar.cc/150?u=u7', roles: [ROLES.DEVELOPER] },
].map(u => {
  const holidays: any[] = [];
  [2025, 2026, 2027, 2028].forEach(year => {
    holidays.push(...getRussianHolidaysForYear(year));
  });
  return {
    ...u,
    vacations: holidays
  };
});

// --- Components ---

const UserModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSave: (user: User) => void;
  onDelete?: (userId: string) => void;
  initialData?: User;
}> = ({ isOpen, onClose, onSave, onDelete, initialData }) => {
  const [name, setName] = useState(initialData?.name || '');
  const [selectedRoles, setSelectedRoles] = useState<string[]>(initialData?.roles || []);
  const [imageUrl, setImageUrl] = useState(initialData?.imageUrl || '');
  const [vacations, setVacations] = useState<User['vacations']>(initialData?.vacations || []);
  const [isSaving, setIsSaving] = useState(false);

  const compressAvatar = (base64Str: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = base64Str;
      img.onerror = () => reject(new Error('Avatar load failed'));
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const MAX_SIZE = 300;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_SIZE) {
              height *= MAX_SIZE / width;
              width = MAX_SIZE;
            }
          } else {
            if (height > MAX_SIZE) {
              width *= MAX_SIZE / height;
              height = MAX_SIZE;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);
          }
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        } catch (e) {
          reject(e);
        }
      };
    });
  };

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setSelectedRoles(initialData.roles || []);
      setImageUrl(initialData.imageUrl || '');
      setVacations(initialData.vacations || []);
    } else {
      setName('');
      setSelectedRoles([]);
      setImageUrl('');
      setVacations([]);
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const toggleRole = (role: string) => {
    setSelectedRoles(prev => 
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  const addVacation = () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const nextWeek = format(addDays(new Date(), 7), 'yyyy-MM-dd');
    setVacations(prev => [
      ...(prev || []),
      { id: Math.random().toString(36).substr(2, 9), startDate: today, endDate: nextWeek }
    ]);
  };

  const updateVacation = (id: string, field: 'startDate' | 'endDate', value: string) => {
    setVacations(prev => prev?.map(v => v.id === id ? { ...v, [field]: value } : v));
  };

  const removeVacation = (id: string) => {
    setVacations(prev => prev?.filter(v => v.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSave({
        id: initialData?.id || Math.random().toString(36).substr(2, 9),
        name,
        roles: selectedRoles,
        imageUrl: imageUrl || `https://i.pravatar.cc/150?u=${name || 'user'}`,
        vacations
      });
      onClose();
    } catch (error) {
      console.error("Save error:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h2 className="text-lg font-bold text-slate-800">{initialData ? 'Редактировать пользователя' : 'Добавить виртуального пользователя'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-colors text-slate-400">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto max-h-[85vh]">
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">ФИО</label>
              <input 
                required
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 font-black text-indigo-600">Роли</label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {Object.values(ROLES).map(role => (
                  <label key={role} className="flex items-center gap-3 p-2 rounded-lg border border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors">
                    <input 
                      type="checkbox"
                      checked={selectedRoles.includes(role)}
                      onChange={() => toggleRole(role)}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-xs font-medium text-slate-700">{role}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 font-black text-indigo-600">Аватар сотрудника (макс. 3МБ)</label>
              <div className="space-y-4">
                {imageUrl && (
                  <div className="relative group rounded-full overflow-hidden w-24 h-24 border border-slate-200 shadow-sm mx-auto">
                    <img src={imageUrl} alt="Avatar Preview" className="w-full h-full object-cover" />
                    <button 
                      type="button"
                      onClick={() => setImageUrl('')}
                      className="absolute inset-0 bg-rose-500/85 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white backdrop-blur-[1px]"
                      title="Удалить аватар"
                    >
                      <Trash2 size={16} strokeWidth={3} />
                      <span className="text-[8px] font-black uppercase tracking-widest mt-1">Удалить</span>
                    </button>
                  </div>
                )}
                <div className="flex flex-col gap-3">
                  <label 
                    className={`flex flex-col items-center justify-center px-4 py-6 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${
                      imageUrl ? 'border-indigo-100 bg-indigo-50/10' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="p-2.5 rounded-full bg-white shadow-sm mb-1.5">
                      <Upload size={16} className={imageUrl ? 'text-indigo-500' : 'text-slate-400'} />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                      {imageUrl ? 'Заменить изображение' : 'Загрузить файл'}
                    </span>
                    <span className="text-[8px] text-slate-400 mt-0.5 uppercase font-bold">Image (max. 3MB)</span>
                    <input 
                      type="file" 
                      className="hidden" 
                      accept="image/*"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          if (file.size > 3 * 1024 * 1024) {
                            alert('Размер файла не должен превышать 3 МБ');
                            return;
                          }
                          const reader = new FileReader();
                          reader.onerror = () => {
                            console.error("File reading error");
                            setIsSaving(false);
                            alert("Ошибка при чтении файла");
                          };
                          reader.onloadstart = () => setIsSaving(true);
                          reader.onloadend = async () => {
                            try {
                              if (typeof reader.result === 'string') {
                                const compressed = await compressAvatar(reader.result);
                                setImageUrl(compressed);
                              } else {
                                setIsSaving(false);
                              }
                            } catch (error) {
                              console.error("Avatar compression error:", error);
                              alert("Ошибка при обработке изображения");
                              setIsSaving(false);
                            } finally {
                              setIsSaving(false);
                            }
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </label>
                  
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center" aria-hidden="true">
                      <div className="w-full border-t border-slate-100"></div>
                    </div>
                    <div className="relative flex justify-center text-[8px] uppercase font-black text-slate-300 tracking-tighter">
                      <span className="px-2 bg-white">Или прямая ссылка</span>
                    </div>
                  </div>

                  <input 
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 text-[11px] font-medium placeholder:text-slate-300"
                    placeholder="https://..."
                    value={(imageUrl || '').startsWith('data:') ? '' : (imageUrl || '')}
                    onChange={(e) => setImageUrl(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 font-black text-indigo-600">Отпуска</label>
                <button 
                  type="button" 
                  onClick={addVacation}
                  className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black uppercase tracking-wider hover:bg-indigo-100 transition-colors"
                >
                  <Plus size={12} />
                  Добавить отпуск
                </button>
              </div>
              
              {/* Notice of State Holidays */}
              <div className="mb-4 p-3 bg-indigo-50/50 rounded-xl border border-indigo-100/60 flex items-start gap-2.5">
                <span className="text-base">🇷🇺</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-black text-indigo-700 uppercase tracking-wider">Государственные праздники РФ</div>
                  <div className="text-[9px] text-slate-500 font-medium leading-relaxed mt-0.5">
                    Автоматически добавлены в календарь сотрудника как выходные дни (Новый Год, 23 Февраля, 8 Марта, 1 и 9 Мая, 12 Июня, 4 Ноября).
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                {(() => {
                  const personalVacations = (vacations || []).filter(v => !v.isHoliday && !v.id.startsWith('ru-holiday'));
                  return personalVacations.length > 0 ? (
                    personalVacations.map((vacation) => (
                      <div key={vacation.id} className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100 group shadow-sm">
                        <div className="flex-1 grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">С</label>
                            <input 
                              type="date"
                              value={vacation.startDate}
                              onChange={(e) => updateVacation(vacation.id, 'startDate', e.target.value)}
                              className="w-full text-[11px] font-bold bg-white border border-slate-200 rounded-lg p-1.5 outline-none focus:border-indigo-400"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">По</label>
                            <input 
                              type="date"
                              value={vacation.endDate}
                              onChange={(e) => updateVacation(vacation.id, 'endDate', e.target.value)}
                              className="w-full text-[11px] font-bold bg-white border border-slate-200 rounded-lg p-1.5 outline-none focus:border-indigo-400"
                            />
                          </div>
                        </div>
                        <button 
                          type="button"
                          onClick={() => removeVacation(vacation.id)}
                          className="p-2 text-slate-300 hover:text-rose-500 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-6 border-2 border-dashed border-slate-100 rounded-2xl">
                      <p className="text-[11px] font-bold text-slate-400 uppercase italic">График личных отпусков пуст</p>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            {initialData && onDelete ? (
              <button 
                type="button"
                onClick={() => onDelete(initialData.id)}
                className="text-rose-500 text-[10px] font-black uppercase hover:underline"
              >
                Удалить пользователя
              </button>
            ) : <div />}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} disabled={isSaving} className="px-4 py-2 text-xs font-bold text-slate-500 disabled:opacity-50">Отмена</button>
              <button 
                type="submit" 
                disabled={isSaving}
                className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-xs font-bold shadow-lg shadow-indigo-100 disabled:bg-slate-400 disabled:shadow-none flex items-center gap-2"
              >
                {isSaving && <Activity size={14} className="animate-spin" />}
                {isSaving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

const ProjectModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSave: (project: Project) => void;
  onDelete?: (projectId: string) => void;
  initialData?: Project;
  users: User[];
  projects: Project[];
}> = ({ isOpen, onClose, onSave, onDelete, initialData, users, projects }) => {
  const [name, setName] = useState(initialData?.name || '');
  const [weight, setWeight] = useState<number | string>(initialData?.weight || 1);
  const [imageUrl, setImageUrl] = useState(initialData?.imageUrl || '');
  const [trackerUrl, setTrackerUrl] = useState(initialData?.trackerUrl || '');
  const [segment, setSegment] = useState(initialData?.segment || 'детская');
  const [shouldRegenerateTasks, setShouldRegenerateTasks] = useState(false);
  const [projectType, setProjectType] = useState<'game' | 'prototype' | 'mhi'>(() => {
    if (initialData?.isPrototype) return 'prototype';
    if (initialData?.isMhi) return 'mhi';
    return 'game';
  });
  const [excludeFromReleases, setExcludeFromReleases] = useState(initialData?.excludeFromReleases || false);
  const [hasForeignComponents, setHasForeignComponents] = useState(initialData?.hasForeignComponents || false);
  const [hasSmallBatch, setHasSmallBatch] = useState(initialData?.hasSmallBatch || false);
  const [artDirectorRole, setArtDirectorRole] = useState<'artist' | 'curator'>(initialData?.artDirectorRole || 'artist');
  const [releaseMonth, setReleaseMonth] = useState<number>(new Date().getMonth());
  const [releaseYear, setReleaseYear] = useState<number>(new Date().getFullYear());
  const [releaseDay, setReleaseDay] = useState<number>(new Date().getDate());
  const [planningMode, setPlanningMode] = useState<'release' | 'start'>('release');
  const [startMonth, setStartMonth] = useState<number>(new Date().getMonth());
  const [startYear, setStartYear] = useState<number>(new Date().getFullYear());
  const [projectStartDate, setProjectStartDate] = useState<string>(
    initialData?.resources[0]?.tasks[0] 
      ? format(new Date(initialData.resources[0].tasks[0].startDate), 'yyyy-MM-dd')
      : format(new Date(), 'yyyy-MM-dd')
  );

  const [stageStartDates, setStageStartDates] = useState<Record<string, string>>({});
  
  const [assignments, setAssignments] = useState<Record<string, string>>(() => {
    if (initialData) {
      return initialData.resources.reduce((acc, r) => {
        if (!r.isSpecialRow) acc[r.role] = r.name;
        return acc;
      }, {} as Record<string, string>);
    }
    return DEFAULT_STAGES.reduce((acc, stage) => ({ ...acc, [stage]: '' }), {});
  });

  const [durations, setDurations] = useState<Record<string, number>>(() => {
    const defaultObj: Record<string, number> = {};
    const defaultReg = getRegulatoryDurationsForWeight(initialData?.weight || 1);
    [...DEFAULT_STAGES, 'Производство и старт продаж'].forEach(stage => {
      if (initialData) {
        const res = initialData.resources.find(r => r.role === stage);
        defaultObj[stage] = res?.tasks[0]
          ? Math.max(1, Math.round(countWorkingDays(new Date(res.tasks[0].startDate), addDays(new Date(res.tasks[0].startDate), res.tasks[0].duration)) / 5))
          : (defaultReg[stage] || 2);
      } else {
        defaultObj[stage] = defaultReg[stage] || 2;
      }
    });
    return defaultObj;
  });

  const calculateProjectStartDate = (
    month: number,
    year: number,
    day: number,
    currentDurations: Record<string, number>,
    currentWeight: number | string
  ): string => {
    const targetSalesStart = new Date(year, month, day);

    const cDur = projectType === 'mhi' ? 0 : (currentDurations['Концептирование'] || 2);
    const dDur = projectType === 'mhi' ? 0 : (currentDurations['Девелопмент'] || 2);
    const rDur = currentDurations['Редактирование'] || 2;
    const dvDur = currentDurations['Дизайн и вёрстка'] || 2;
    const prodDur = currentDurations['Производство и старт продаж'] || 2;

    const numericWeight = getNumericWeight(currentWeight);
    const riskWeeks = numericWeight <= 3 ? 4 : 8;

    let weeksBeforeSales = 0;
    if (projectType === 'mhi') {
      weeksBeforeSales = rDur + dvDur + 2;
    } else {
      const endOffset = cDur + dDur + Math.max(rDur, dvDur);
      weeksBeforeSales = endOffset + riskWeeks + prodDur;
    }

    const calculatedStart = addWorkingDays(targetSalesStart, -weeksBeforeSales * 5);
    return format(calculatedStart, 'yyyy-MM-dd');
  };

  const getCalculatedReleaseDate = (
    startDateStr: string,
    currentDurations: Record<string, number>,
    currentWeight: number | string
  ): Date => {
    const start = new Date(startDateStr);

    const cDur = projectType === 'mhi' ? 0 : (currentDurations['Концептирование'] || 2);
    const dDur = projectType === 'mhi' ? 0 : (currentDurations['Девелопмент'] || 2);
    const rDur = currentDurations['Редактирование'] || 2;
    const dvDur = currentDurations['Дизайн и вёрстка'] || 2;
    const prodDur = currentDurations['Производство и старт продаж'] || 2;

    const numericWeight = getNumericWeight(currentWeight);
    const riskWeeks = numericWeight <= 3 ? 4 : 8;

    let weeksBeforeSales = 0;
    if (projectType === 'mhi') {
      weeksBeforeSales = rDur + dvDur + 2;
    } else {
      const endOffset = cDur + dDur + Math.max(rDur, dvDur);
      weeksBeforeSales = endOffset + riskWeeks + prodDur;
    }
    return addWorkingDays(start, weeksBeforeSales * 5);
  };

  // Helper to recalculate all dates for the project's stages, in sequence
  const recalculateAllDates = (baseStart: string, currentDurations: Record<string, number>) => {
    const start = new Date(baseStart);
    const newStageDates: Record<string, string> = {};

    const cDur = projectType === 'mhi' ? 0 : (currentDurations['Концептирование'] || 2);
    const dDur = projectType === 'mhi' ? 0 : (currentDurations['Девелопмент'] || 2);
    const rDur = currentDurations['Редактирование'] || 2;
    const dvDur = currentDurations['Дизайн и вёрстка'] || 2;

    if (projectType === 'mhi') {
      newStageDates['Концептирование'] = format(start, 'yyyy-MM-dd');
      newStageDates['Девелопмент'] = format(start, 'yyyy-MM-dd');
      newStageDates['Арт Продакшн'] = format(start, 'yyyy-MM-dd');
      newStageDates['Редактирование'] = format(start, 'yyyy-MM-dd');
      newStageDates['Дизайн и вёрстка'] = format(addWorkingDays(start, rDur * 5), 'yyyy-MM-dd');
      newStageDates['Производство и старт продаж'] = format(addWorkingDays(start, (rDur + dvDur) * 5), 'yyyy-MM-dd');
    } else {
      // Девелопмент and Арт Продакшн both start here. Девелопмент ends at
      // cDur+dDur, exactly when Редактирование starts (below); Арт Продакшн's
      // own (longer) regulatory duration — see getRegulatoryDurationsForWeight
      // — makes it end exactly when Дизайн и вёрстка starts instead.
      newStageDates['Концептирование'] = format(start, 'yyyy-MM-dd');
      newStageDates['Девелопмент'] = format(addWorkingDays(start, cDur * 5), 'yyyy-MM-dd');
      newStageDates['Арт Продакшн'] = format(addWorkingDays(start, cDur * 5), 'yyyy-MM-dd');

      const endOffset = cDur + dDur + Math.max(rDur, dvDur);

      newStageDates['Редактирование'] = format(addWorkingDays(start, (endOffset - rDur) * 5), 'yyyy-MM-dd');
      newStageDates['Дизайн и вёрстка'] = format(addWorkingDays(start, (endOffset - dvDur) * 5), 'yyyy-MM-dd');

      newStageDates['Производство и старт продаж'] = format(addWorkingDays(start, endOffset * 5), 'yyyy-MM-dd');
    }
    setStageStartDates(newStageDates);
  };

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setWeight(initialData.weight);
      setImageUrl(initialData.imageUrl || '');
      setTrackerUrl(initialData.trackerUrl || '');
      setSegment(initialData.segment || 'детская');
      setShouldRegenerateTasks(false);
      setArtDirectorRole(initialData.artDirectorRole || 'artist');
      
      const newDurations: Record<string, number> = {};
      const newStageDates: Record<string, string> = {};

      [...DEFAULT_STAGES, 'Производство и старт продаж'].forEach(stage => {
        const res = initialData.resources.find(r => r.role === stage);
        if (res && res.tasks[0]) {
          const taskStart = new Date(res.tasks[0].startDate);
          newDurations[stage] = Math.max(1, Math.round(countWorkingDays(taskStart, addDays(taskStart, res.tasks[0].duration)) / 5));
          newStageDates[stage] = format(taskStart, 'yyyy-MM-dd');
        } else {
          newDurations[stage] = 2;
        }
      });
      
      setDurations(newDurations);
      setStageStartDates(newStageDates);

      const startS = initialData.resources[0]?.tasks[0]
        ? format(new Date(initialData.resources[0].tasks[0].startDate), 'yyyy-MM-dd')
        : format(new Date(), 'yyyy-MM-dd');
      setProjectStartDate(startS);
      const startD = new Date(startS);
      setStartMonth(startD.getMonth());
      setStartYear(startD.getFullYear());
      setPlanningMode('release');

      let initialSalesDate = new Date();
      const specRes = initialData.resources.find(r => r.role === 'Производство и старт продаж');
      const salesT = specRes?.tasks.find(t => t.label === 'СТАРТ ПРОДАЖ');
      if (salesT) {
        initialSalesDate = new Date(salesT.startDate);
      } else {
        initialSalesDate = getProjectReleaseDate(initialData);
      }
      setReleaseMonth(initialSalesDate.getMonth());
      setReleaseYear(initialSalesDate.getFullYear());
      setReleaseDay(initialSalesDate.getDate());

      setAssignments(initialData.resources.reduce((acc, r) => {
        if (!r.isSpecialRow) acc[r.role] = r.name;
        return acc;
      }, {} as Record<string, string>));
    } else {
      setName('');
      setWeight(1);
      setImageUrl('');
      setTrackerUrl('');
      setSegment('детская');
      setShouldRegenerateTasks(true);
      setArtDirectorRole('artist');

      const today = new Date();
      setReleaseMonth(today.getMonth());
      setReleaseYear(today.getFullYear());
      setReleaseDay(today.getDate());
      setStartMonth(today.getMonth());
      setStartYear(today.getFullYear());
      setPlanningMode('release');
      setAssignments(DEFAULT_STAGES.reduce((acc, stage) => ({ ...acc, [stage]: '' }), {}));

      const newDurations = getRegulatoryDurationsForWeight(1);
      setDurations(newDurations);

      const calculatedStart = calculateProjectStartDate(today.getMonth(), today.getFullYear(), today.getDate(), newDurations, 1);
      setProjectStartDate(calculatedStart);
      recalculateAllDates(calculatedStart, newDurations);
    }
  }, [initialData, isOpen]);

  // Synchronize durations when weight or project type changes during project creation (unless editing)
  useEffect(() => {
    if (!initialData && isOpen) {
      const regDurations = getRegulatoryDurationsForWeight(weight);
      setDurations(regDurations);
      if (planningMode === 'release') {
        const startStr = calculateProjectStartDate(releaseMonth, releaseYear, releaseDay, regDurations, weight);
        setProjectStartDate(startStr);
        recalculateAllDates(startStr, regDurations);
      } else {
        const startStr = format(new Date(startYear, startMonth, 1), 'yyyy-MM-dd');
        setProjectStartDate(startStr);
        recalculateAllDates(startStr, regDurations);
        const computedReleaseDate = getCalculatedReleaseDate(startStr, regDurations, weight);
        setReleaseMonth(computedReleaseDate.getMonth());
        setReleaseYear(computedReleaseDate.getFullYear());
        setReleaseDay(computedReleaseDate.getDate());
      }
    }
  }, [weight, isOpen, initialData, releaseMonth, releaseYear, releaseDay, startMonth, startYear, projectType, planningMode]);

  const getFilteredUsers = (stage: string) => {
    const requiredRole = STAGE_TO_ROLE[stage];
    if (!requiredRole) return users;
    return users.filter(u => u.roles.includes(requiredRole));
  };

  const getUserConflictForStage = (userName: string, stage: string) => {
    if (!userName || userName === 'Не назначен') return false;
    
    const stageStartStr = stageStartDates[stage] || projectStartDate;
    const stageStart = new Date(stageStartStr);
    const stageEnd = addWorkingDays(stageStart, (durations[stage] || 2) * 5);

    return projects.some(p => {
      if (initialData && p.id === initialData.id) return false;
      return p.resources.some(r => {
        if (r.name !== userName) return false;
        return r.tasks.some(t => {
          const tStart = new Date(t.startDate);
          const tEnd = addDays(tStart, t.duration);
          // Overlap: (tStart < stageEnd && stageStart < tEnd)
          return tStart < stageEnd && stageStart < tEnd;
        });
      });
    });
  };

  if (!isOpen) return null;

  const [isSaving, setIsSaving] = useState(false);

  const compressImage = (base64Str: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = base64Str;
      img.onerror = () => reject(new Error('Image load failed'));
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1000;
          const MAX_HEIGHT = 600;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);
          }
          // Compress more heavily to avoid large strings slowing down UI
          resolve(canvas.toDataURL('image/jpeg', 0.6));
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = (e) => reject(e);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const projectId = initialData?.id || Math.random().toString(36).substr(2, 9);
      
      let finalResources: Resource[] = [];

      if (initialData && !shouldRegenerateTasks) {
        // Keep existing resources and tasks, only update names (assignments)
        finalResources = initialData.resources.map(r => {
          let updatedTasks = r.tasks;
          if (r.role === 'Арт Продакшн') {
            updatedTasks = r.tasks.map(t => ({
              ...t,
              color: artDirectorRole === 'artist' ? 'darkred' : 'lightpink'
            }));
          }
          return {
            ...r,
            name: r.isSpecialRow ? r.name : (assignments[r.role] || r.name),
            tasks: updatedTasks
          };
        });
      } else {
        // Дата окончания задачи «Старт продаж», используется ниже для
        // размещения «Заказ компонентов» (см. stage === 'Концептирование').
        // Считается той же цепочкой, что и сама задача «Старт продаж» внутри
        // специальной строки «Производство и старт продаж» ниже.
        const prodStageStart = stageStartDates['Производство и старт продаж']
          ? new Date(stageStartDates['Производство и старт продаж'])
          : new Date(projectStartDate);
        const riskWeeksForSales = getNumericWeight(weight) <= 3 ? 4 : 8;
        const prodWeeksForSales = durations['Производство и старт продаж'] || 2;
        // Same moment the «ПРОИЗВОДСТВО» task itself starts (right after risks) —
        // used below for «Заказ мелкотиражки».
        const productionStartDate = addWorkingDays(prodStageStart, riskWeeksForSales * 5);
        const salesStartDate = addWorkingDays(productionStartDate, prodWeeksForSales * 5);
        const salesEndDate = addWorkingDays(salesStartDate, 2 * 5);

        // Regenerate resources and tasks
        finalResources = [...DEFAULT_STAGES, 'Производство и старт продаж'].map(stage => {
          const isSpecial = stage === 'Производство и старт продаж';
          const existingResource = initialData?.resources.find(r => r.role === stage);
          const weeks = durations[stage] || 2;

          const taskStartDate = stageStartDates[stage] ? new Date(stageStartDates[stage]) : new Date(projectStartDate);
          // Regulatory durations are specified in working weeks — the actual
          // calendar span skips weekends and Russian public holidays, so it's
          // computed fresh from each task's own start (holidays fall on
          // different calendar days depending on where a stage lands).
          const durationDays = differenceInDays(addWorkingDays(taskStartDate, weeks * 5), taskStartDate);

          const tasks: Task[] = [];
          let currentSubTaskStart = taskStartDate;
          
          if (isSpecial) {
            // 1. Add "Risks" task
            const riskTask = existingResource?.tasks.find(t => t.isRisk);
            const riskWeeks = getNumericWeight(weight) <= 3 ? 4 : 8;
            const riskDuration = differenceInDays(addWorkingDays(currentSubTaskStart, riskWeeks * 5), currentSubTaskStart);
            tasks.push({
              id: riskTask?.id || Math.random().toString(36).substr(2, 9),
              label: 'РИСКИ',
              startDate: currentSubTaskStart,
              duration: riskDuration,
              color: 'gray',
              status: riskTask?.status || 'neutral',
              isRisk: true
            });
            currentSubTaskStart = addDays(currentSubTaskStart, riskDuration);

            // 2. Add "Production" task
            const prodTask = existingResource?.tasks.find(t => t.label === 'ПРОИЗВОДСТВО');
            const prodDurationDays = differenceInDays(addWorkingDays(currentSubTaskStart, weeks * 5), currentSubTaskStart);
            tasks.push({
              id: prodTask?.id || Math.random().toString(36).substr(2, 9),
              label: 'ПРОИЗВОДСТВО',
              startDate: currentSubTaskStart,
              duration: prodDurationDays,
              color: 'gray',
              status: prodTask?.status || 'neutral'
            });
            currentSubTaskStart = addDays(currentSubTaskStart, prodDurationDays);

            // 3. Add "Start Sales" task (fixed 2 working weeks)
            const salesTask = existingResource?.tasks.find(t => t.label === 'СТАРТ ПРОДАЖ');
            const salesDuration = differenceInDays(addWorkingDays(currentSubTaskStart, 2 * 5), currentSubTaskStart);
            tasks.push({
              id: salesTask?.id || Math.random().toString(36).substr(2, 9),
              label: 'СТАРТ ПРОДАЖ',
              startDate: currentSubTaskStart,
              duration: salesDuration,
              color: 'gray',
              status: salesTask?.status || 'neutral'
            });
          } else if (stage === 'Концептирование' && getNumericWeight(weight) >= 2) {
            // Weight ≥2 projects revisit Концептирование a second time,
            // ~1 month (4 weeks) after Девелопмент starts, per the studio's
            // regulatory schedule — in addition to the usual pass that ends
            // right as Девелопмент begins.
            const existingConceptTasks = existingResource?.tasks.filter(t => !t.isRisk && !t.isDelay) || [];
            const devStart = new Date(stageStartDates['Девелопмент'] || projectStartDate);
            const secondConceptStart = addWorkingDays(devStart, 4 * 5);
            const secondConceptDuration = differenceInDays(addWorkingDays(secondConceptStart, weeks * 5), secondConceptStart);

            tasks.push({
              id: existingConceptTasks[0]?.id || Math.random().toString(36).substr(2, 9),
              label: stage,
              startDate: taskStartDate,
              duration: durationDays,
              color: getTaskColor(stage),
              status: existingConceptTasks[0]?.status || 'neutral'
            });
            tasks.push({
              id: existingConceptTasks[1]?.id || Math.random().toString(36).substr(2, 9),
              label: stage,
              startDate: secondConceptStart,
              duration: secondConceptDuration,
              color: getTaskColor(stage),
              status: existingConceptTasks[1]?.status || 'neutral'
            });
          } else {
            tasks.push({
              id: existingResource?.tasks.find(t => !t.isRisk && !t.isDelay)?.id || Math.random().toString(36).substr(2, 9),
              label: stage,
              startDate: taskStartDate,
              duration: durationDays,
              color: stage === 'Арт Продакшн' ? (artDirectorRole === 'artist' ? 'darkred' : 'lightpink') : getTaskColor(stage),
              status: existingResource?.tasks.find(t => !t.isRisk && !t.isDelay)?.status || 'neutral'
            });
          }

          // «Зарубежные компоненты»: продюсер (тот же человек, что ведёт
          // Концептирование) получает задачу «Заказ компонентов» — 2 недели,
          // стартующие за 6 месяцев до окончания «Старт продаж».
          if (stage === 'Концептирование' && hasForeignComponents) {
            const existingOrderTask = existingResource?.tasks.find(t => t.label === 'Заказ компонентов');
            const orderStart = addMonths(salesEndDate, -6);
            tasks.push({
              id: existingOrderTask?.id || Math.random().toString(36).substr(2, 9),
              label: 'Заказ компонентов',
              startDate: orderStart,
              duration: differenceInDays(addWorkingDays(orderStart, 2 * 5), orderStart),
              color: getTaskColor(stage),
              status: existingOrderTask?.status || 'neutral'
            });
          }

          // «Мелкотиражка»: задача «Заказ мелкотиражки» — 2 недели, стартует
          // одновременно с задачей «ПРОИЗВОДСТВО», в строке Концептирование.
          if (stage === 'Концептирование' && hasSmallBatch) {
            const existingBatchTask = existingResource?.tasks.find(t => t.label === 'Заказ мелкотиражки');
            tasks.push({
              id: existingBatchTask?.id || Math.random().toString(36).substr(2, 9),
              label: 'Заказ мелкотиражки',
              startDate: productionStartDate,
              duration: differenceInDays(addWorkingDays(productionStartDate, 2 * 5), productionStartDate),
              color: getTaskColor(stage),
              status: existingBatchTask?.status || 'neutral'
            });
          }

          return {
            id: existingResource?.id || Math.random().toString(36).substr(2, 9),
            role: stage,
            name: isSpecial ? '' : (assignments[stage] || 'Не назначен'),
            tasks: tasks,
            isSpecialRow: isSpecial
          };
        });
      }

      if (projectType === 'mhi') {
        finalResources = finalResources.map(r => {
          if (r.role === 'Концептирование' || r.role === 'Арт Продакшн' || r.role === 'Девелопмент') {
            return {
              ...r,
              tasks: []
            };
          }
          if (r.role === 'Производство и старт продаж') {
            const existingMhiTask = r.tasks.find(t => t.label === 'Передача в МХИ');
            const mhiStartDate = stageStartDates['Производство и старт продаж'] ? new Date(stageStartDates['Производство и старт продаж']) : new Date(projectStartDate);

            return {
              ...r,
              tasks: [
                {
                  id: existingMhiTask?.id || Math.random().toString(36).substr(2, 9),
                  label: 'Передача в МХИ',
                  startDate: mhiStartDate,
                  duration: differenceInDays(addWorkingDays(mhiStartDate, 2 * 5), mhiStartDate),
                  color: 'purple',
                  status: existingMhiTask?.status || 'neutral'
                }
              ]
            };
          }
          return r;
        });
      }

      const projectData: Project = {
        id: projectId,
        name,
        weight,
        imageUrl: (imageUrl || '').startsWith('data:') 
          ? imageUrl 
          : (getDriveDirectLink(imageUrl || '') || `https://picsum.photos/seed/${name || 'new'}/200/200`),
        trackerUrl,
        segment,
        resources: finalResources,
        isPrototype: projectType === 'prototype',
        isMhi: projectType === 'mhi',
        excludeFromReleases,
        artDirectorRole,
        hasForeignComponents,
        hasSmallBatch,
        sortOrder: initialData?.sortOrder ?? 0
      };

      await onSave(projectData);
      onClose();
    } catch (error) {
      console.error("Save error:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h2 className="text-lg font-bold text-slate-800">{initialData ? 'Редактировать проект' : 'Добавить новый проект'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-colors text-slate-400">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto max-h-[80vh]">
          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-4">
                <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest">Основная информация</h3>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Название проекта</label>
                  <input 
                    required
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50"
                    placeholder="Введите название проекта..."
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Вес</label>
                    <select 
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-indigo-500 cursor-pointer font-bold text-slate-700 text-xs"
                      value={weight}
                      onChange={(e) => {
                        const val = e.target.value;
                        const num = Number(val);
                        setWeight(isNaN(num) ? val : num);
                      }}
                    >
                      {WEIGHT_OPTIONS.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Режим планирования</label>
                    <div className="flex bg-white border border-slate-200 p-1 rounded-xl gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setPlanningMode('release');
                          const startStr = calculateProjectStartDate(releaseMonth, releaseYear, releaseDay, durations, weight);
                          setProjectStartDate(startStr);
                          recalculateAllDates(startStr, durations);
                        }}
                        className={`flex-1 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${
                          planningMode === 'release'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-600'
                        }`}
                      >
                        По выходу
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPlanningMode('start');
                          const d = new Date(projectStartDate);
                          setStartMonth(d.getMonth());
                          setStartYear(d.getFullYear());
                          recalculateAllDates(projectStartDate, durations);
                          const computedReleaseDate = getCalculatedReleaseDate(projectStartDate, durations, weight);
                          setReleaseMonth(computedReleaseDate.getMonth());
                          setReleaseYear(computedReleaseDate.getFullYear());
                          setReleaseDay(computedReleaseDate.getDate());
                        }}
                        className={`flex-1 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${
                          planningMode === 'start'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-600'
                        }`}
                      >
                        По старту
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  {planningMode === 'release' ? (
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Дата выхода проекта</label>
                      <div className="grid grid-cols-3 gap-2">
                        <select
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-bold text-slate-700 cursor-pointer text-xs"
                          value={releaseDay}
                          onChange={(e) => {
                            const newDay = Number(e.target.value);
                            setReleaseDay(newDay);
                            const startStr = calculateProjectStartDate(releaseMonth, releaseYear, newDay, durations, weight);
                            setProjectStartDate(startStr);
                            recalculateAllDates(startStr, durations);
                          }}
                        >
                          {Array.from({ length: getDaysInMonth(new Date(releaseYear, releaseMonth)) }, (_, i) => i + 1).map(d => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                        <select
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-bold text-slate-700 cursor-pointer text-xs"
                          value={releaseMonth}
                          onChange={(e) => {
                            const newMonth = Number(e.target.value);
                            const clampedDay = Math.min(releaseDay, getDaysInMonth(new Date(releaseYear, newMonth)));
                            setReleaseMonth(newMonth);
                            setReleaseDay(clampedDay);
                            const startStr = calculateProjectStartDate(newMonth, releaseYear, clampedDay, durations, weight);
                            setProjectStartDate(startStr);
                            recalculateAllDates(startStr, durations);
                          }}
                        >
                          {MONTH_NAMES.map((name, idx) => (
                            <option key={idx} value={idx}>{name}</option>
                          ))}
                        </select>
                        <select
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-bold text-slate-700 cursor-pointer text-xs"
                          value={releaseYear}
                          onChange={(e) => {
                            const newYear = Number(e.target.value);
                            const clampedDay = Math.min(releaseDay, getDaysInMonth(new Date(newYear, releaseMonth)));
                            setReleaseYear(newYear);
                            setReleaseDay(clampedDay);
                            const startStr = calculateProjectStartDate(releaseMonth, newYear, clampedDay, durations, weight);
                            setProjectStartDate(startStr);
                            recalculateAllDates(startStr, durations);
                          }}
                        >
                          {Array.from({ length: 8 }, (_, i) => 2025 + i).map(yr => (
                            <option key={yr} value={yr}>{yr}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Месяц и год старта проекта</label>
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-bold text-slate-700 cursor-pointer text-xs"
                          value={startMonth}
                          onChange={(e) => {
                            const newMonth = Number(e.target.value);
                            setStartMonth(newMonth);
                            const startStr = format(new Date(startYear, newMonth, 1), 'yyyy-MM-dd');
                            setProjectStartDate(startStr);
                            recalculateAllDates(startStr, durations);
                            
                            const computedReleaseDate = getCalculatedReleaseDate(startStr, durations, weight);
                            setReleaseMonth(computedReleaseDate.getMonth());
                            setReleaseYear(computedReleaseDate.getFullYear());
                            setReleaseDay(computedReleaseDate.getDate());
                          }}
                        >
                          {MONTH_NAMES.map((name, idx) => (
                            <option key={idx} value={idx}>{name}</option>
                          ))}
                        </select>
                        <select
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-bold text-slate-700 cursor-pointer text-xs"
                          value={startYear}
                          onChange={(e) => {
                            const newYear = Number(e.target.value);
                            setStartYear(newYear);
                            const startStr = format(new Date(newYear, startMonth, 1), 'yyyy-MM-dd');
                            setProjectStartDate(startStr);
                            recalculateAllDates(startStr, durations);
                            
                            const computedReleaseDate = getCalculatedReleaseDate(startStr, durations, weight);
                            setReleaseMonth(computedReleaseDate.getMonth());
                            setReleaseYear(computedReleaseDate.getFullYear());
                            setReleaseDay(computedReleaseDate.getDate());
                          }}
                        >
                          {Array.from({ length: 8 }, (_, i) => 2025 + i).map(yr => (
                            <option key={yr} value={yr}>{yr}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Тип проекта</label>
                  <div className="flex bg-white border border-slate-200 p-1 rounded-xl gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (projectType === 'game') return;
                        setProjectType('game');
                        setShouldRegenerateTasks(true);
                        if (initialData) recalculateAllDates(projectStartDate, durations);
                      }}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${
                        projectType === 'game'
                          ? 'bg-indigo-600 text-white shadow-md'
                          : 'text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      <Layers size={14} />
                      <span>Игра</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (projectType === 'prototype') return;
                        setProjectType('prototype');
                        setShouldRegenerateTasks(true);
                        if (initialData) recalculateAllDates(projectStartDate, durations);
                      }}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${
                        projectType === 'prototype'
                          ? 'bg-amber-600 text-white shadow-md'
                          : 'text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      <Cpu size={14} />
                      <span>Прототип</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (projectType === 'mhi') return;
                        setProjectType('mhi');
                        setShouldRegenerateTasks(true);
                        if (initialData) recalculateAllDates(projectStartDate, durations);
                      }}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${
                        projectType === 'mhi'
                          ? 'bg-purple-600 text-white shadow-md'
                          : 'text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      <Sparkles size={14} />
                      <span>МХИ</span>
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Настройки релиза</label>
                  <button
                    type="button"
                    onClick={() => setExcludeFromReleases(!excludeFromReleases)}
                    className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all border-2 ${
                      excludeFromReleases 
                        ? 'bg-red-50 border-red-200 text-red-600 shadow-inner' 
                        : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-200 hover:bg-slate-50'
                    }`}
                  >
                    <EyeOff size={14} className={excludeFromReleases ? 'animate-pulse' : ''} />
                    <span>{excludeFromReleases ? 'Исключено из релизов' : 'Отображать в релизах'}</span>
                  </button>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Компоненты</label>
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setHasForeignComponents(!hasForeignComponents)}
                      className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all border-2 ${
                        hasForeignComponents
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-600 shadow-inner'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-200 hover:bg-slate-50'
                      }`}
                      title="Если включено, продюсеру автоматически создаётся задача «Заказ компонентов» за 6 месяцев до старта продаж"
                    >
                      <Cpu size={14} />
                      <span>Зарубежные компоненты</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setHasSmallBatch(!hasSmallBatch)}
                      className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all border-2 ${
                        hasSmallBatch
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-600 shadow-inner'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-200 hover:bg-slate-50'
                      }`}
                      title="Если включено, продюсеру автоматически создаётся задача «Заказ мелкотиражки» одновременно с началом «ПРОИЗВОДСТВО»"
                    >
                      <Layers size={14} />
                      <span>Мелкотиражка</span>
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 font-black text-indigo-600">Обложка проекта (макс. 3МБ)</label>
                  <div className="space-y-4">
                    {imageUrl && (
                      <div className="relative group rounded-xl overflow-hidden aspect-video border border-slate-200 shadow-sm">
                        <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
                        <button 
                          type="button"
                          onClick={() => setImageUrl('')}
                          className="absolute inset-0 bg-rose-500/80 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white backdrop-blur-[2px]"
                        >
                          <Trash2 size={24} strokeWidth={3} />
                          <span className="mt-2 font-black text-xs uppercase tracking-widest">Удалить обложку</span>
                        </button>
                      </div>
                    )}
                    <div className="flex flex-col gap-3">
                      <label 
                        className={`flex flex-col items-center justify-center px-4 py-8 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${
                          imageUrl ? 'border-indigo-100 bg-indigo-50/20' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="p-3 rounded-full bg-white shadow-sm mb-2">
                          <Upload size={20} className={imageUrl ? 'text-indigo-500' : 'text-slate-400'} />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                          {imageUrl ? 'Заменить изображение' : 'Загрузить файл'}
                        </span>
                        <span className="text-[9px] text-slate-400 mt-1 uppercase font-bold">Image (max. 3MB)</span>
                        <input 
                          type="file" 
                          className="hidden" 
                          accept="image/*"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              if (file.size > 3 * 1024 * 1024) {
                                alert('Размер файла не должен превышать 3 МБ');
                                return;
                              }
                              const reader = new FileReader();
                              reader.onerror = () => {
                                console.error("File reading error");
                                setIsSaving(false);
                                alert("Ошибка при чтении файла");
                              };
                              reader.onloadstart = () => setIsSaving(true);
                              reader.onloadend = async () => {
                                try {
                                  if (typeof reader.result === 'string') {
                                    const compressed = await compressImage(reader.result);
                                    setImageUrl(compressed);
                                  } else {
                                    setIsSaving(false);
                                  }
                                } catch (error) {
                                  console.error("Image compression error:", error);
                                  alert("Ошибка при обработке изображения");
                                  setIsSaving(false);
                                } finally {
                                  // This finally only runs if the if condition was true, 
                                  // but our logic above handles it better now.
                                  // Let's just make sure it's always false at the end of onloadend
                                  setIsSaving(false);
                                }
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                      </label>
                      
                      <div className="relative">
                        <div className="absolute inset-0 flex items-center" aria-hidden="true">
                          <div className="w-full border-t border-slate-100"></div>
                        </div>
                        <div className="relative flex justify-center text-[8px] uppercase font-black text-slate-300 tracking-tighter">
                          <span className="px-2 bg-slate-50">Или прямая ссылка</span>
                        </div>
                      </div>

                      <input 
                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:border-indigo-500 text-[11px] font-medium placeholder:text-slate-300"
                        placeholder="https://..."
                        value={(imageUrl || '').startsWith('data:') ? '' : (imageUrl || '')}
                        onChange={(e) => setImageUrl(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">ссылка на проект в трекере</label>
                  <input 
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-indigo-500"
                    placeholder="Вставьте ссылку на трекер..."
                    value={trackerUrl}
                    onChange={(e) => setTrackerUrl(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Сегмент</label>
                  <select 
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-indigo-500"
                    value={segment}
                    onChange={(e) => setSegment(e.target.value)}
                  >
                    <option value="детская">Детская</option>
                    <option value="широкая">Широкая</option>
                    <option value="семейная">Семейная</option>
                    <option value="экспертная">Экспертная</option>
                    <option value="корп. заказ">Корп. заказ</option>
                  </select>
                </div>

                {initialData && (
                  <div className="pt-2">
                    <label className="flex items-center gap-3 p-3 bg-indigo-50 border border-indigo-100 rounded-xl cursor-pointer group">
                      <div className="relative flex items-center">
                        <input 
                          type="checkbox"
                          className="peer sr-only"
                          checked={shouldRegenerateTasks}
                          onChange={(e) => setShouldRegenerateTasks(e.target.checked)}
                        />
                        <div className="w-10 h-5 bg-slate-200 rounded-full peer peer-checked:bg-indigo-600 transition-colors"></div>
                        <div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full transition-transform peer-checked:translate-x-5"></div>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase text-indigo-700 tracking-wider">Пересоздать задачи и сроки</span>
                        <span className="text-[9px] text-indigo-500/80 leading-tight">Включите, если изменились сроки этапов</span>
                      </div>
                    </label>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center gap-2">
                <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest">Этапы, сроки и сотрудники</h3>
                {initialData && (
                  <button
                    type="button"
                    onClick={() => {
                      const regDurations = getRegulatoryDurationsForWeight(weight);
                      setDurations(regDurations);
                      recalculateAllDates(projectStartDate, regDurations);
                    }}
                    className="text-[10px] font-black uppercase tracking-wider text-indigo-600 hover:text-indigo-800 bg-indigo-55/60 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1.5 rounded-lg transition-all shadow-sm"
                  >
                    Регламентные сроки
                  </button>
                )}
              </div>
              <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                {DEFAULT_STAGES.filter(stage => {
                  if (projectType === 'mhi') {
                    return stage !== 'Концептирование' && stage !== 'Девелопмент' && stage !== 'Арт Продакшн';
                  }
                  return true;
                }).map((stage, sIdx, filteredArr) => {
                  const startDate = stageStartDates[stage] || projectStartDate;
                  const durationWeeks = durations[stage] || 2;
                  const endDate = format(addWorkingDays(new Date(startDate), durationWeeks * 5), 'yyyy-MM-dd');
                  const isLastStage = sIdx === filteredArr.length - 1;

                  return (
                    <div key={stage} className={`space-y-2 pb-4 ${isLastStage ? '' : 'border-b border-slate-200'} last:border-0 last:pb-0`}>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-tight">{stage}</span>
                      </div>
                      <div className="grid grid-cols-[1.8fr,0.8fr,1.2fr] gap-3 items-end">
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-400 uppercase">Сотрудник</label>
                          <select 
                            className={`w-full px-3 py-2 bg-white border rounded-lg text-xs outline-none focus:border-indigo-500 ${
                              getUserConflictForStage(assignments[stage], stage) ? 'border-red-300 bg-red-50 text-red-700' : 'border-slate-200'
                            }`}
                            value={assignments[stage] === 'Не назначен' ? '' : assignments[stage]}
                            onChange={(e) => setAssignments(prev => ({ ...prev, [stage]: e.target.value }))}
                          >
                            <option value="">Не назначен</option>
                            {getFilteredUsers(stage).map(u => {
                              const isBusy = getUserConflictForStage(u.name, stage);
                              return (
                                <option 
                                  key={u.id} 
                                  value={u.name}
                                  className={isBusy ? 'text-red-600 font-bold' : ''}
                                  style={isBusy ? { color: '#e11d48', fontWeight: 'bold' } : {}}
                                >
                                  {u.name} {isBusy ? '⚠️' : ''}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-400 uppercase">Недели</label>
                          <input 
                            type="number"
                            min="1"
                            className="w-full px-2 py-2 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-500"
                            value={durations[stage]}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              const newDurations = { ...durations, [stage]: val };
                              setDurations(newDurations);
                              if (planningMode === 'release') {
                                const startStr = calculateProjectStartDate(releaseMonth, releaseYear, releaseDay, newDurations, weight);
                                setProjectStartDate(startStr);
                                recalculateAllDates(startStr, newDurations);
                              } else {
                                recalculateAllDates(projectStartDate, newDurations);
                                const computedReleaseDate = getCalculatedReleaseDate(projectStartDate, newDurations, weight);
                                setReleaseMonth(computedReleaseDate.getMonth());
                                setReleaseYear(computedReleaseDate.getFullYear());
                                setReleaseDay(computedReleaseDate.getDate());
                              }
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-400 uppercase">Финиш</label>
                          <div className="w-full px-2 py-2 bg-slate-100 border border-slate-200 rounded-lg text-xs text-slate-500 font-medium">
                            {format(addWorkingDays(new Date(startDate), durationWeeks * 5), 'dd.MM.yyyy')}
                          </div>
                        </div>
                      </div>
                      {stage === 'Арт Продакшн' && (
                        <div className="mt-2.5 p-3 bg-rose-50/50 border border-rose-100 rounded-xl space-y-2">
                          <span className="block text-[10px] font-black uppercase tracking-wider text-rose-700">Роль Арт-Директора</span>
                          <div className="flex gap-2 bg-white p-1 border border-rose-200/60 rounded-lg">
                            <button
                              type="button"
                              onClick={() => setArtDirectorRole('artist')}
                              className={`flex-1 py-1.5 px-3 rounded-md text-[10px] font-bold uppercase transition-all ${
                                artDirectorRole === 'artist'
                                  ? 'bg-rose-800 text-white shadow-sm font-black'
                                  : 'text-rose-600 hover:bg-rose-50'
                              }`}
                            >
                              Художник (темно-красный)
                            </button>
                            <button
                              type="button"
                              onClick={() => setArtDirectorRole('curator')}
                              className={`flex-1 py-1.5 px-3 rounded-md text-[10px] font-bold uppercase transition-all ${
                                artDirectorRole === 'curator'
                                  ? 'bg-pink-300 text-pink-950 shadow-sm font-black'
                                  : 'text-pink-600 hover:bg-pink-50'
                              }`}
                            >
                              Куратор (светло-розовый)
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {projectType === 'mhi' ? (
                  <div className="pt-4 mt-2 border-t border-dashed border-slate-200 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-purple-700 uppercase">Передача в МХИ</span>
                    </div>
                    <div className="p-3 bg-purple-50/50 border border-purple-100 rounded-xl">
                      <span className="text-[11px] text-purple-950 font-medium leading-tight block">
                        Будет создана двухнедельная задача «Передача в МХИ». Сроки и старт продаж по регламенту не планируются.
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="pt-4 mt-2 border-t-2 border-dashed border-slate-200">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] font-bold text-indigo-700 uppercase">Производство и старт продаж</span>
                    </div>
                    <div className="grid grid-cols-[1.2fr,1.8fr] gap-3 items-end">
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase">Недели (Прод.)</label>
                        <input 
                          type="number"
                          min="1"
                          className="w-full px-2 py-2 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-500"
                          value={durations['Производство и старт продаж']}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            const newDurations = { ...durations, ['Производство и старт продаж']: val };
                            setDurations(newDurations);
                            if (planningMode === 'release') {
                              const startStr = calculateProjectStartDate(releaseMonth, releaseYear, releaseDay, newDurations, weight);
                              setProjectStartDate(startStr);
                              recalculateAllDates(startStr, newDurations);
                            } else {
                              recalculateAllDates(projectStartDate, newDurations);
                              const computedReleaseDate = getCalculatedReleaseDate(projectStartDate, newDurations, weight);
                              setReleaseMonth(computedReleaseDate.getMonth());
                              setReleaseYear(computedReleaseDate.getFullYear());
                              setReleaseDay(computedReleaseDate.getDate());
                            }
                          }}
                        />
                      </div>
                      <div className="space-y-1 pb-2">
                        <div className="text-[9px] font-bold text-slate-400 uppercase">Суммарный срок этапа</div>
                        <div className="text-[10px] text-slate-500 italic">С учетом рисков и продаж</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-6 border-t border-slate-100">
            {initialData && onDelete ? (
              <button 
                type="button"
                onClick={() => onDelete(initialData.id)}
                className="flex items-center gap-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 px-4 py-2 rounded-lg font-bold text-sm transition-all"
              >
                <Trash2 size={18} />
                <span>Удалить проект</span>
              </button>
            ) : <div />}
            
            <div className="flex items-center gap-3">
              <button 
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="px-6 py-2.5 text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50"
              >
                Отмена
              </button>
              <button 
                type="submit"
                disabled={isSaving}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-10 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 transition-all flex items-center gap-2 disabled:bg-slate-400 disabled:shadow-none"
              >
                {isSaving ? (
                  <>
                    <Activity size={18} className="animate-spin" />
                    <span>Сохранение...</span>
                  </>
                ) : (
                  <>
                    <span>{initialData ? 'Сохранить изменения' : 'Создать проект'}</span>
                    <Check size={18} strokeWidth={3} />
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

const TaskBlock: React.FC<{
  task: Task;
  onUpdate: (updates: Partial<Task>) => void;
  onDelete: () => void;
  timelineStart: Date;
  cellWidth?: number;
  zoomLevel?: 'day' | 'week' | 'month';
  lane?: number;
  isFocused?: boolean;
  isReadOnly?: boolean;
  projectWeight?: number | string;
  role?: string;
  dimmed?: boolean;
}> = ({ task, onUpdate, onDelete, timelineStart, cellWidth = CELL_WIDTH, zoomLevel = 'week', lane = 0, isFocused = false, isReadOnly = false, projectWeight, role, dimmed = false }) => {
  const left = (differenceInDays(task.startDate, timelineStart) / 7) * cellWidth;
  const width = (task.duration / 7) * cellWidth;
  const top = lane * ROW_HEIGHT + 4;
  const height = ROW_HEIGHT - 8;

  const isEditorTask = role && (role.toLowerCase().includes('редакт') || role.toLowerCase().includes('editor'));
  const isUpwardDropdown = role && (
    role.toLowerCase().includes('дизайн') || 
    role.toLowerCase().includes('верстка') || 
    role.toLowerCase().includes('вёрстка') || 
    role.toLowerCase().includes('производ') || 
    role.toLowerCase().includes('старт продаж')
  );
  let editorColorClass = '';
  if (isEditorTask && projectWeight !== undefined) {
    const wStr = String(projectWeight).trim().toUpperCase();
    if (wStr === '1' || wStr === '2' || wStr === '3') {
      editorColorClass = 'bg-sky-500 border-sky-600';
    } else if (wStr === '3Н' || wStr === '3H' || wStr === '4' || wStr === '5' || wStr === '5Н' || wStr === '5H') {
      editorColorClass = 'bg-blue-800 border-blue-900';
    }
  }

  const [isDragging, setIsDragging] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  // Raw pixel offset from the pointer's position at drag start, updated every frame
  // for a 1:1 visual follow. The task itself is only committed (snapped to a
  // whole week) once, on mouseup — see the comment on handleMouseUp below.
  const [pixelDelta, setPixelDelta] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showCommentBox, setShowCommentBox] = useState(false);
  const [tempComment, setTempComment] = useState(task.comment || '');
  const [tempLabel, setTempLabel] = useState(task.label);
  const commentBoxRef = useRef<HTMLDivElement>(null);
  const commentButtonRef = useRef<HTMLButtonElement>(null);
  const commentPopoverRef = useRef<HTMLDivElement>(null);
  const [commentBoxPos, setCommentBoxPos] = useState<{ top: number; left: number } | null>(null);

  const commitComment = () => {
    if (tempComment !== (task.comment || '')) {
      onUpdate({ comment: tempComment });
    }
    setShowCommentBox(false);
  };

  // Close (and save) the comment box on a click outside it, instead of
  // leaving it open indefinitely — without this, moving the mouse off the
  // task and back later would reveal the box still open, looking like it
  // had popped open on hover. Checks both the button and the portaled
  // popover, since the popover is no longer a DOM descendant of the button.
  useEffect(() => {
    if (!showCommentBox) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideButton = commentBoxRef.current?.contains(target);
      const insidePopover = commentPopoverRef.current?.contains(target);
      if (!insideButton && !insidePopover) {
        commitComment();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCommentBox, tempComment]);

  // The comment popover is rendered through a portal straight into <body> and
  // positioned in fixed (viewport) coordinates computed from the button, so it
  // always paints above every task bar and the sticky sidebar — a z-index set
  // on the task itself can't escape stacking contexts it doesn't own (like the
  // sticky team column), which is why it kept getting hidden underneath them.
  useLayoutEffect(() => {
    if (!showCommentBox) {
      setCommentBoxPos(null);
      return;
    }
    const updatePosition = () => {
      const btn = commentButtonRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const popoverWidth = 224;
      const popoverHeight = commentPopoverRef.current?.offsetHeight || 140;
      let left = rect.right - popoverWidth;
      left = Math.max(8, Math.min(left, window.innerWidth - popoverWidth - 8));
      let top = rect.bottom + 4;
      if (top + popoverHeight > window.innerHeight) {
        top = rect.top - popoverHeight - 4;
      }
      setCommentBoxPos({ top, left });
    };
    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [showCommentBox]);

  const startXRef = useRef(0);
  const latestClientXRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isEditing || isReadOnly) return;
    startXRef.current = e.clientX;
    setPixelDelta(0);
    setIsDragging(true);
    e.stopPropagation();
  };

  const handleResizeRightMouseDown = (e: React.MouseEvent) => {
    if (isReadOnly) return;
    startXRef.current = e.clientX;
    setPixelDelta(0);
    setIsResizingRight(true);
    e.stopPropagation();
  };

  const handleResizeLeftMouseDown = (e: React.MouseEvent) => {
    if (isReadOnly) return;
    startXRef.current = e.clientX;
    setPixelDelta(0);
    setIsResizingLeft(true);
    e.stopPropagation();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging && !isResizingRight && !isResizingLeft) return;

      // Throttle to one state update per animation frame instead of once per
      // mousemove event — keeps the drag smooth even with high-poll-rate mice.
      latestClientXRef.current = e.clientX;
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setPixelDelta(latestClientXRef.current - startXRef.current);
      });
    };

    // Commit the drag/resize exactly once, on release: snap the accumulated
    // pixel offset to whole weeks and fire a single onUpdate. Doing this only
    // here (instead of on every mousemove) avoids re-triggering the lane
    // reassignment for every task of this resource mid-drag, which is what
    // caused other tasks to visibly jump around while dragging.
    const handleMouseUp = () => {
      if (isDragging) {
        const weeksMoved = Math.round(pixelDelta / cellWidth);
        if (weeksMoved !== 0) {
          onUpdate({ startDate: addWeeks(task.startDate, weeksMoved) });
        }
      } else if (isResizingRight) {
        const weeksMoved = Math.round(pixelDelta / cellWidth);
        const newDuration = Math.max(7, task.duration + weeksMoved * 7);
        if (newDuration !== task.duration) {
          onUpdate({ duration: newDuration });
        }
      } else if (isResizingLeft) {
        const weeksMoved = Math.round(pixelDelta / cellWidth);
        const newDuration = Math.max(7, task.duration - weeksMoved * 7);
        const actualWeeksMoved = (task.duration - newDuration) / 7;
        if (actualWeeksMoved !== 0) {
          onUpdate({
            startDate: addWeeks(task.startDate, actualWeeksMoved),
            duration: newDuration
          });
        }
      }

      setIsDragging(false);
      setIsResizingRight(false);
      setIsResizingLeft(false);
      setPixelDelta(0);
    };

    if (isDragging || isResizingRight || isResizingLeft) {
      (window as any).__isInteracting = true;
      document.body.classList.add('user-is-interacting');
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      (window as any).__isInteracting = false;
      document.body.classList.remove('user-is-interacting');
    }

    return () => {
      (window as any).__isInteracting = false;
      document.body.classList.remove('user-is-interacting');
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isDragging, isResizingRight, isResizingLeft, pixelDelta, task.startDate, task.duration, onUpdate, cellWidth]);

  // Live preview position while dragging/resizing: follows the pointer
  // pixel-for-pixel (unsnapped) so the motion feels smooth; the actual task
  // dates only get snapped to whole weeks when the drag is committed above.
  const minWidthPx = cellWidth;
  let previewLeft = left;
  let previewWidth = width;
  if (isDragging) {
    previewLeft = left + pixelDelta;
  } else if (isResizingRight) {
    const clampedDelta = Math.max(pixelDelta, minWidthPx - width);
    previewWidth = width + clampedDelta;
  } else if (isResizingLeft) {
    const clampedDelta = Math.min(pixelDelta, width - minWidthPx);
    previewLeft = left + clampedDelta;
    previewWidth = width - clampedDelta;
  }

  const isInteracting = isDragging || isResizingRight || isResizingLeft;

  const handleLabelSubmit = () => {
    onUpdate({ label: tempLabel });
    setIsEditing(false);
  };

  // The nudge arrows move the task by whatever unit the timeline is
  // currently zoomed to — a day, a week, or a month — so the step always
  // matches what's visually one grid column.
  const moveTaskBy = (direction: 1 | -1) => {
    if (zoomLevel === 'day') {
      onUpdate({ startDate: addDays(task.startDate, direction) });
    } else if (zoomLevel === 'month') {
      onUpdate({ startDate: addMonths(task.startDate, direction) });
    } else {
      onUpdate({ startDate: addWeeks(task.startDate, direction) });
    }
  };
  const moveUnitLabel = zoomLevel === 'day' ? 'день' : zoomLevel === 'month' ? 'месяц' : 'неделю';

  // The +/- duration buttons resize the task by whatever unit the timeline
  // is currently zoomed to — a day, a week, or a month — matching moveTaskBy
  // above. Months are applied to the end date (not added as a flat 30 days)
  // so a step always lands on the same day-of-month regardless of length.
  const resizeTaskBy = (direction: 1 | -1) => {
    const endDate = addDays(task.startDate, task.duration);
    const newEndDate = zoomLevel === 'day'
      ? addDays(endDate, direction)
      : zoomLevel === 'month'
      ? addMonths(endDate, direction)
      : addWeeks(endDate, direction);
    const newDuration = differenceInDays(newEndDate, task.startDate);
    if (newDuration >= 1) {
      onUpdate({ duration: newDuration });
    }
  };
  const resizeUnitLabel = zoomLevel === 'day' ? 'дн' : zoomLevel === 'month' ? 'мес' : 'нед';

  return (
    <motion.div
      layoutId={task.id}
      initial={false}
      animate={{
        left: previewLeft,
        width: previewWidth,
        top,
        height,
        opacity: dimmed ? 0.45 : 1,
        scale: isDragging ? 1.02 : (isFocused ? 1.25 : 1),
        boxShadow: isDragging
          ? "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)"
          : "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        zIndex: isDragging ? 3000 : (showStatusMenu || showCommentBox ? 2500 : (isFocused ? 2000 : 10))
      }}
      transition={isInteracting ? { duration: 0 } : {
        type: "spring",
        stiffness: 400,
        damping: 30,
        mass: 0.8
      }}
      className={`absolute flex ${dimmed ? 'items-start pt-1' : 'items-center'} px-2 text-[10px] uppercase font-bold ${task.color === 'lightpink' ? 'text-pink-950' : 'text-white'} rounded cursor-move select-none border group/task ${
        editorColorClass ? editorColorClass : (
          (task.segment && !['darkred', 'lightpink'].includes(task.color)) ? (
            task.segment.toLowerCase() === 'детская' ? 'bg-pink-500 border-pink-600' :
            task.segment.toLowerCase() === 'широкая' ? 'bg-sky-500 border-sky-600' :
            task.segment.toLowerCase() === 'семейная' ? 'bg-emerald-500 border-emerald-600' :
            task.segment.toLowerCase() === 'экспертная' ? 'bg-orange-500 border-orange-600' :
            task.segment.toLowerCase() === 'корп. заказ' ? 'bg-slate-400 border-slate-500' :
            COLORS[task.color]
          ) : (
            task.isRisk ? 'bg-stripe-risks border-slate-500' : 
            task.isDelay ? `bg-stripe-${task.color} border-slate-500` : COLORS[task.color]
          )
        )
      } ${
        isFocused ? 'ring-2 ring-blue-500 !border-white pb-[2px]' : ''
      } ${isDragging ? 'opacity-90 cursor-grabbing' : ''}`}
      onMouseDown={handleMouseDown}
      whileHover={{ scaleY: isDragging ? 1.02 : 1.05 }}
      whileTap={!isEditing ? { cursor: 'grabbing' } : undefined}
      onDoubleClick={(e) => {
        if (isReadOnly) return;
        e.stopPropagation();
        setIsEditing(true);
      }}
    >
      {isEditing ? (
        <div className="flex items-center w-full bg-black/20 rounded px-1 gap-1">
          <input
            autoFocus
            className="flex-1 bg-transparent text-white outline-none placeholder:text-white/50 py-0.5"
            value={tempLabel}
            onChange={(e) => setTempLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLabelSubmit()}
          />
          <button 
            type="button"
            onMouseDown={(e) => {
              e.stopPropagation();
              handleLabelSubmit();
            }}
            className="hover:scale-110 active:scale-95 transition-transform text-white/90 hover:text-white"
          >
            <Check size={14} strokeWidth={3} />
          </button>
        </div>
      ) : (
        <>
          {TASK_STATUS_ICONS[task.status] && (
            <div className="mr-1.5 flex-shrink-0 opacity-80">
              {TASK_STATUS_ICONS[task.status]}
            </div>
          )}
          <div className="flex flex-col min-w-0 flex-1 leading-tight py-0.5">
            <span className="truncate">{task.label}</span>
            {task.segment && (
              <span className="text-[8px] opacity-90 font-black tracking-tighter truncate uppercase italic">
                {task.segment}
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-1 opacity-0 group-hover/task:opacity-100 transition-opacity ml-1 relative">
            <div className="flex items-center relative" ref={commentBoxRef}>
              <button
                ref={commentButtonRef}
                onClick={(e) => {
                  if (isReadOnly) return;
                  e.stopPropagation();
                  setTempComment(task.comment || '');
                  setShowCommentBox(!showCommentBox);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className={`p-1 rounded transition-colors ${showCommentBox ? 'bg-white/30' : 'hover:bg-white/20'}`}
                title={task.comment ? 'Комментарий к задаче' : 'Добавить комментарий'}
              >
                <MessageSquare size={10} fill={task.comment ? 'currentColor' : 'none'} />
              </button>

              {showCommentBox && commentBoxPos && createPortal(
                <div
                  ref={commentPopoverRef}
                  style={{ position: 'fixed', top: commentBoxPos.top, left: commentBoxPos.left, zIndex: 9999 }}
                  className="flex flex-col gap-1.5 bg-slate-800 border border-slate-700 rounded-lg shadow-2xl p-2 w-56 normal-case font-normal"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <textarea
                    autoFocus
                    value={tempComment}
                    onChange={(e) => setTempComment(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                    placeholder="Комментарий к задаче..."
                    className="w-full h-20 bg-slate-900 border border-slate-700 rounded-md p-2 text-[10px] text-white placeholder:text-slate-500 outline-none focus:border-indigo-500 resize-none"
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={commitComment}
                      className="text-[9px] px-2 py-1 bg-indigo-600 hover:bg-indigo-500 rounded-md font-bold uppercase tracking-tighter text-white transition-colors"
                    >
                      Сохранить
                    </button>
                  </div>
                </div>,
                document.body
              )}
            </div>

            <div className="flex items-center">
              <button
                onClick={(e) => {
                  if (isReadOnly) return;
                  e.stopPropagation();
                  setShowStatusMenu(!showStatusMenu);
                }}
                className={`p-1 rounded transition-colors ${showStatusMenu ? 'bg-white/30' : 'hover:bg-white/20'}`}
                title={`Статус: ${task.status}`}
              >
                <Activity size={10} />
              </button>
              
              {showStatusMenu && (
                <div 
                  className={`absolute right-0 ${isUpwardDropdown ? 'bottom-full mb-1' : 'top-full mt-1'} flex flex-col bg-slate-800 border border-slate-700 rounded-lg shadow-2xl p-1 z-[100] min-w-[90px]`}
                  onMouseLeave={() => setShowStatusMenu(false)}
                >
                  {(['neutral', 'started', 'finished', 'overdue'] as TaskStatus[]).map(s => {
                    const statusLabels: Record<string, string> = {
                      neutral: 'нейтрально',
                      started: 'начато',
                      finished: 'завершено',
                      overdue: 'просрочено'
                    };
                    return (
                      <button
                        key={s}
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdate({ status: s });
                          setShowStatusMenu(false);
                        }}
                        className={`text-[9px] px-2 py-1.5 hover:bg-white/10 rounded-md text-left transition-colors flex items-center gap-2 font-bold uppercase tracking-tighter ${task.status === s ? 'text-indigo-300 bg-white/5' : 'text-slate-300'}`}
                      >
                        <div className="w-[10px] flex items-center justify-center">
                          {TASK_STATUS_ICONS[s]}
                        </div>
                        <span className="truncate">{statusLabels[s] || s}</span>
                      </button>
                    );
                  })}
                  <div className="h-px bg-slate-700 my-1" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowStatusMenu(false);
                      onDelete();
                    }}
                    className="text-[9px] px-2 py-1.5 hover:bg-red-500/20 rounded-md text-left transition-colors flex items-center gap-2 font-bold uppercase tracking-tighter text-red-400"
                    title="Удалить задачу"
                  >
                    <div className="w-[10px] flex items-center justify-center">
                      <Trash2 size={10} />
                    </div>
                    <span className="truncate">Удалить</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
      
      {/* Resize Handles */}
      {!isEditing && !isReadOnly && (
        <>
          {/* Left Handle */}
          <div 
            onMouseDown={handleResizeLeftMouseDown}
            className="absolute left-0 top-0 w-4 h-full cursor-w-resize z-20 group/handle-l"
          >
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                moveTaskBy(-1);
              }}
              className={`absolute left-[-44px] ${dimmed ? 'top-0' : 'top-1/2 -translate-y-1/2'} w-7 h-7 bg-white rounded-full shadow-xl border-2 border-slate-100 flex items-center justify-center text-blue-600 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all opacity-0 group-hover/task:opacity-100 scale-90 hover:scale-110 active:scale-95 z-30`}
              title={`Сдвинуть на ${moveUnitLabel} назад`}
            >
              <ChevronLeft size={16} strokeWidth={3} />
            </button>
            <button 
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                resizeTaskBy(-1);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                resizeTaskBy(1);
              }}
              className={`absolute left-[-14px] ${dimmed ? 'top-0' : 'top-1/2 -translate-y-1/2'} w-7 h-7 bg-white rounded-full shadow-xl border-2 border-slate-100 flex items-center justify-center text-red-500 hover:bg-red-500 hover:text-white hover:border-red-500 transition-all opacity-0 group-hover/task:opacity-100 scale-90 hover:scale-110 active:scale-95 z-30`}
              title={`Уменьшить (клик: -1 ${resizeUnitLabel}, дабл-клик: +1 ${resizeUnitLabel})`}
            >
              <Minus size={14} strokeWidth={4} />
            </button>
          </div>

          {/* Right Handle */}
          <div 
            onMouseDown={handleResizeRightMouseDown}
            className="absolute right-0 top-0 w-4 h-full cursor-e-resize z-20 group/handle-r"
          >
            <button 
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                resizeTaskBy(1);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                resizeTaskBy(-1);
              }}
              className={`absolute right-[-14px] ${dimmed ? 'top-0' : 'top-1/2 -translate-y-1/2'} w-7 h-7 bg-white rounded-full shadow-xl border-2 border-slate-100 flex items-center justify-center text-green-600 hover:bg-green-600 hover:text-white hover:border-green-600 transition-all opacity-0 group-hover/task:opacity-100 scale-90 hover:scale-110 active:scale-95 z-30`}
              title={`Увеличить (клик: +1 ${resizeUnitLabel}, дабл-клик: -1 ${resizeUnitLabel})`}
            >
              <Plus size={16} strokeWidth={3} />
            </button>
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                moveTaskBy(1);
              }}
              className={`absolute right-[-44px] ${dimmed ? 'top-0' : 'top-1/2 -translate-y-1/2'} w-7 h-7 bg-white rounded-full shadow-xl border-2 border-slate-100 flex items-center justify-center text-blue-600 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all opacity-0 group-hover/task:opacity-100 scale-90 hover:scale-110 active:scale-95 z-30`}
              title={`Сдвинуть на ${moveUnitLabel} вперёд`}
            >
              <ChevronRight size={16} strokeWidth={3} />
            </button>
          </div>
        </>
      )}
    </motion.div>
  );
};

// Date cell used throughout the Редактура-и-вёрстка/Девелопмент/Концептирование-
// и-арт-продакшн tables for any column that falls back to a faded "plan"
// estimate until a person confirms it. A plain `<input type="date">` whose
// `value` falls back to the plan's ISO string (the previous approach) shows
// the right date, but if a person opens the picker and picks that exact same
// day, the DOM value never actually changes — so no change event fires, the
// override field never gets saved, and everything gated on it (status
// changes, "Факт" bars/labels, growth) silently never kicks in. Fixed by
// keeping the real input's value truly empty until an override exists (so
// picking ANY date, plan-day included, is always a real "" → date change and
// reliably fires), and rendering the faded plan date as a separate
// pointer-events-none overlay in its place; `text-transparent` hides the
// native input's own date text/placeholder digits without touching its
// calendar-icon affordance.
const PlanDateInput: React.FC<{
  value?: string;
  planDate: Date | null;
  onChange: (value: string | undefined) => void;
  disabled?: boolean;
}> = ({ value, planDate, onChange, disabled }) => {
  const hasOverride = !!value;
  // Some cells have no plan to fall back to at all (e.g. the plan chain is
  // skipped entirely for МХИ projects) — those stay a plain dimmed-blank
  // input rather than hiding the native placeholder digits behind a
  // (non-existent) overlay.
  const showPlanOverlay = !hasOverride && !!planDate;
  return (
    <div className="relative">
      {showPlanOverlay && (
        <span className="pointer-events-none absolute inset-0 flex items-center px-1.5 py-1 text-slate-600 opacity-40 whitespace-nowrap">
          {format(planDate as Date, 'dd.MM.yyyy')}
        </span>
      )}
      <input
        type="date"
        value={value || ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        disabled={disabled}
        className={`w-full bg-transparent border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded px-1.5 py-1 outline-none transition-colors text-slate-600 ${showPlanOverlay ? 'text-transparent' : !hasOverride ? 'opacity-40' : ''}`}
      />
    </div>
  );
};

// The studio's tracker app icon: five white squares forming a "Т" on a
// rounded-square blue badge — no raster asset was supplied, so it's built as
// an inline SVG, letting the two states below just toggle a CSS filter
// instead of needing separate asset files.
const TrackerLogo: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 96 96" className={className} xmlns="http://www.w3.org/2000/svg">
    <rect width="96" height="96" rx="22" fill="#5D7DF5" />
    <rect x="16" y="16" width="18" height="18" rx="3" fill="#FFFFFF" />
    <rect x="38" y="16" width="18" height="18" rx="3" fill="#FFFFFF" />
    <rect x="60" y="16" width="18" height="18" rx="3" fill="#FFFFFF" />
    <rect x="38" y="38" width="18" height="18" rx="3" fill="#FFFFFF" />
    <rect x="38" y="60" width="18" height="18" rx="3" fill="#FFFFFF" />
  </svg>
);

// Small button pinned next to the sidebar project card's "Выход"/"Продлено"
// info block, linking out to project.trackerUrl (the project's tracker-link
// field). Full color and clickable when the link is set; otherwise a
// grayscale, inert placeholder — never an <a>, so it truly isn't clickable
// rather than just styled to look disabled.
const TrackerLinkButton: React.FC<{ trackerUrl?: string }> = ({ trackerUrl }) => {
  if (trackerUrl) {
    return (
      <a
        href={trackerUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="flex-shrink-0 hover:scale-105 active:scale-95 transition-transform"
        title="Открыть в трекере"
      >
        <TrackerLogo className="w-6 h-6" />
      </a>
    );
  }
  return (
    <div className="flex-shrink-0 grayscale opacity-40" title="Ссылка на трекер не указана">
      <TrackerLogo className="w-6 h-6" />
    </div>
  );
};

export default function App() {
  const [projects, setProjects] = useState<Project[]>(() => {
    return INITIAL_DATA.map(p => ({
      ...p,
      releaseYear: p.releaseYear || getProjectReleaseDate(p).getFullYear()
    }));
  });
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  const [lockedProjects, setLockedProjects] = useState<Record<string, boolean>>({});
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});
  const [collapsedUsers, setCollapsedUsers] = useState<Record<string, boolean>>({});

  const getProjectRowHeight = (project: Project, isReleasesTab = false) => {
    if (isReleasesTab) return ROW_HEIGHT + 2;
    if (collapsedProjects[project.id]) return ROW_HEIGHT + 2;
    return (project.resources.length * ROW_HEIGHT) + 2;
  };

  const getUserRowHeight = (user: User) => {
    if (collapsedUsers[user.id]) return ROW_HEIGHT + 2;
    const lanesInfo = userTasksWithLanes[user.name];
    return ((lanesInfo?.maxLanes || 1) * ROW_HEIGHT) + 2;
  };

  const [history, setHistory] = useState<{ projects: Project[]; users: User[] }[]>(() => {
    const saved = localStorage.getItem('hw_planner_history');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Process dates if necessary
        return parsed.map((h: any) => ({
          ...h,
          projects: h.projects.map((p: any) => ({
            ...p,
            releaseYear: p.releaseYear || getProjectReleaseDate(p).getFullYear(),
            resources: p.resources.map((r: any) => ({
              ...r,
              tasks: r.tasks.map((t: any) => ({
                ...t,
                startDate: new Date(t.startDate)
              }))
            }))
          }))
        }));
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem('hw_planner_history', JSON.stringify(history));
    } catch (e) {
      console.warn("Could not save history to localStorage:", e);
      // If quota exceeded, we might want to prune history
      if (e instanceof Error && e.name === 'QuotaExceededError' && history.length > 1) {
        setHistory(prev => prev.slice(-1));
      }
    }
  }, [history]);

  const recordAction = () => {
    try {
      // Manual deep clone instead of JSON.stringify to handle large data better
      const snapshot = {
        projects: projects.map(p => ({
          ...p,
          resources: p.resources.map(r => ({
            ...r,
            tasks: r.tasks.map(t => ({
              ...t,
              startDate: new Date(t.startDate)
            }))
          }))
        })),
        users: users.map(u => ({ ...u }))
      };
      setHistory(prev => [...prev.slice(-3), snapshot]);
    } catch (e) {
      console.error("Failed to record history:", e);
    }
  };

  const handleUndo = async () => {
    if (history.length === 0) return;
    
    const lastState = history[history.length - 1];
    setHistory(prev => prev.slice(0, -1));
    
    // Determine what changed and sync accordingly
    // To be safe and simple, we identify differences and sync them
    
    // Sync restored projects
    for (const project of lastState.projects) {
      const current = projects.find(p => p.id === project.id);
      if (JSON.stringify(current) !== JSON.stringify(project)) {
        await syncProjectToServer(project);
      }
    }
    // Handle deleted projects in history (re-add to server)
    // Actually syncProjectToServer handles ON CONFLICT, so it's fine for existing/new.
    // What if a project was deleted? The snapshot has it. syncProjectToServer will re-add it.
    
    // Sync restored users
    for (const user of lastState.users) {
      const current = users.find(u => u.id === user.id);
      if (JSON.stringify(current) !== JSON.stringify(user)) {
        await syncUserToServer(user);
      }
    }

    // Identify projects that are in current state but NOT in restored state (were added)
    // and delete them from server
    const currentProjectIds = projects.map(p => p.id);
    const restoredProjectIds = lastState.projects.map(p => p.id);
    for (const id of currentProjectIds) {
      if (!restoredProjectIds.includes(id)) {
        try {
          await trackedFetch(`/api/projects/${id}`, { method: 'DELETE' });
        } catch (err) {
          console.error("Failed to remove added project during undo:", err);
        }
      }
    }

    // Same for users
    const currentUserIds = users.map(u => u.id);
    const restoredUserIds = lastState.users.map(u => u.id);
    for (const id of currentUserIds) {
      if (!restoredUserIds.includes(id)) {
        try {
          await trackedFetch(`/api/users/${id}`, { method: 'DELETE' });
        } catch (err) {
          console.error("Failed to remove added user during undo:", err);
        }
      }
    }

    setProjects(lastState.projects);
    setUsers(lastState.users);
  };

  const handleExportData = () => {
    try {
      const data = {
        projects,
        users,
        version: '1.0',
        timestamp: new Date().toISOString()
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `hw_planner_backup_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Ошибка при экспорте данных.");
    }
  };

  const handleImportData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.projects && data.users) {
          if (window.confirm('Это действие заменит ВСЕ текущие данные данными из файла. Продолжить?')) {
            recordAction();
            
            const processedProjects = data.projects.map((p: any) => ({
              ...p,
              resources: p.resources.map((r: any) => ({
                ...r,
                tasks: r.tasks.map((t: any) => ({
                  ...t,
                  startDate: new Date(t.startDate)
                }))
              }))
            }));

            setProjects(processedProjects);
            setUsers(data.users);

            const collapsedMap: Record<string, boolean> = {};
            processedProjects.forEach((p: Project) => {
              if (p.isCollapsed !== undefined) {
                collapsedMap[p.id] = p.isCollapsed;
              }
            });
            setCollapsedProjects(collapsedMap);

            const collapsedUsersMap: Record<string, boolean> = {};
            data.users.forEach((u: User) => {
              if (u.isCollapsed !== undefined) {
                collapsedUsersMap[u.id] = u.isCollapsed;
              }
            });
            setCollapsedUsers(collapsedUsersMap);

            // Try to sync to server
            for (const p of processedProjects) {
              await syncProjectToServer(p);
            }
            for (const u of data.users) {
              await syncUserToServer(u);
            }

            alert('Данные успешно импортированы!');
          }
        } else {
          alert('Некорректный формат файла резервной копии.');
        }
      } catch (error) {
        console.error("Import error:", error);
        alert('Ошибка при чтении файла. Убедитесь, что это правильный JSON файл.');
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const [dbStatus, setDbStatus] = useState<{connected: boolean, message: string} | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);

    const fetchProjects = fetch('/api/projects')
      .then(res => res.json())
      .then(data => {
        if (data && data.length > 0) {
          const processedData = data.map((p: Project) => ({
            ...p,
            resources: p.resources.map(r => ({
              ...r,
              tasks: r.tasks.map(t => ({
                ...t,
                startDate: new Date(t.startDate)
              }))
            }))
          })).sort((a: Project, b: Project) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
          setProjects(processedData);

          const collapsedMap: Record<string, boolean> = {};
          processedData.forEach((p: Project) => {
            if (p.isCollapsed !== undefined) {
              collapsedMap[p.id] = p.isCollapsed;
            }
          });
          setCollapsedProjects(collapsedMap);
        }
      })
      .catch(err => console.error('Failed to fetch projects', err));

    const fetchUsers = fetch('/api/users')
      .then(res => res.json())
      .then(data => {
        if (data && data.length > 0) {
          let updatedAny = false;
          const updatedUsers = data.map((user: User) => {
            const currentVacations = user.vacations || [];
            const holidayIds = new Set(currentVacations.map(v => v.id));
            
            const holidaysToAdd: any[] = [];
            [2025, 2026, 2027, 2028].forEach(year => {
              const yearHolidays = getRussianHolidaysForYear(year);
              yearHolidays.forEach(h => {
                if (!holidayIds.has(h.id)) {
                  holidaysToAdd.push(h);
                }
              });
            });
            
            if (holidaysToAdd.length > 0) {
              updatedAny = true;
              return {
                ...user,
                vacations: [...currentVacations, ...holidaysToAdd]
              };
            }
            return user;
          });
          
          setUsers(updatedUsers);

          const collapsedUsersMap: Record<string, boolean> = {};
          updatedUsers.forEach((user: User) => {
            if (user.isCollapsed !== undefined) {
              collapsedUsersMap[user.id] = user.isCollapsed;
            }
          });
          setCollapsedUsers(collapsedUsersMap);

          if (updatedAny) {
            updatedUsers.forEach((user: User) => {
              const original = data.find((u: User) => u.id === user.id);
              if (original && JSON.stringify(original.vacations) !== JSON.stringify(user.vacations)) {
                syncUserToServer(user);
              }
            });
          }
        }
      })
      .catch(err => console.error('Failed to fetch users', err));

    const fetchDbStatus = fetch('/api/db-status')
      .then(res => res.json())
      .then(setDbStatus)
      .catch(err => setDbStatus({ connected: false, message: 'Failed to fetch status' }));

    Promise.all([fetchProjects, fetchUsers, fetchDbStatus])
      .finally(() => {
        setTimeout(() => {
          setIsLoading(false);
        }, 800);
      });
  }, []);



  const [diceValue, setDiceValue] = useState(5);
  const [userRole, setUserRole] = useState<'editor' | 'viewer' | null>(() => {
    return sessionStorage.getItem('hw_planner_role') as 'editor' | 'viewer' | null;
  });
  const isAuthenticated = !!userRole;
  const isReadOnly = userRole === 'viewer';
  
  const toggleProjectCollapse = (projectId: string, isCollapsed: boolean) => {
    setCollapsedProjects(prev => ({
      ...prev,
      [projectId]: isCollapsed
    }));

    if (isReadOnly) return;

    setProjects(prevProjects => {
      const updated = prevProjects.map(p => {
        if (p.id === projectId) {
          const updatedProject = { ...p, isCollapsed };
          syncProjectToServer(updatedProject);
          return updatedProject;
        }
        return p;
      });
      return updated;
    });
  };

  const toggleUserCollapse = (userId: string, isCollapsed: boolean) => {
    setCollapsedUsers(prev => ({
      ...prev,
      [userId]: isCollapsed
    }));

    if (isReadOnly) return;

    setUsers(prevUsers => {
      const updated = prevUsers.map(u => {
        if (u.id === userId) {
          const updatedUser = { ...u, isCollapsed };
          syncUserToServer(updatedUser);
          return updatedUser;
        }
        return u;
      });
      return updated;
    });
  };

  // Used by the "Редактура и вёрстка" table for its inline-editable columns
  // (доп. компоненты / статус / текущая задача / комментарий) — these live on
  // the project itself rather than on a task, so they persist the same way
  // as any other project field.
  const updateEditorialField = (projectId: string, updates: Partial<Project>) => {
    if (isReadOnly) return;
    setProjects(prev => prev.map(p => {
      if (p.id !== projectId) return p;
      const updated = { ...p, ...updates };
      syncProjectToServer(updated);
      return updated;
    }));
  };

  // The Редактор/Дизайнер names and the three stage dates on that same table
  // aren't stored separately — they're read straight off the resource rows
  // and tasks that already drive the Gantt, so the table always matches it.
  const getStageResource = (project: Project, role: string) =>
    project.resources.find(r => r.role === role);

  const getStageStartDate = (project: Project, role: string): Date | null => {
    const resource = getStageResource(project, role);
    if (!resource) return null;
    const mainTasks = resource.tasks.filter(t => !t.isDelay);
    if (mainTasks.length === 0) return null;
    return mainTasks.reduce((earliest: Date | null, t) =>
      !earliest || t.startDate < earliest ? t.startDate : earliest, null);
  };

  const getStageEndDate = (project: Project, role: string): Date | null => {
    const resource = getStageResource(project, role);
    if (!resource) return null;
    const mainTasks = resource.tasks.filter(t => !t.isDelay);
    if (mainTasks.length === 0) return null;
    return mainTasks.reduce((latest: Date | null, t) => {
      const end = addDays(t.startDate, t.duration);
      return !latest || end > latest ? end : latest;
    }, null);
  };

  // "В печать" (all project types, including МХИ) reads the start of the
  // "ПРОИЗВОДСТВО" sub-task inside the special "Производство и старт
  // продаж" row — the print/production stage on the Gantt "план" — not its
  // end, and not Дизайн-и-вёрстка's end (that was the previous behavior;
  // changed by explicit request).
  const getProductionTaskStartDate = (project: Project): Date | null => {
    const resource = getStageResource(project, 'Производство и старт продаж');
    if (!resource) return null;
    const prodTask = resource.tasks.find(t => t.label?.trim().toUpperCase() === 'ПРОИЗВОДСТВО');
    return prodTask ? prodTask.startDate : null;
  };

  // The "В печать" column's computed (non-override) date — factored out so
  // the editorial table's row rendering and the edit_layout tab's sort-by
  // order use the exact same rule: production's start only when it falls
  // before Дизайн-и-вёрстка wraps up, else the design end (see
  // getProductionTaskStartDate's comment above for the full rationale).
  const getEditorialPrintDate = (project: Project): Date | null => {
    const designEndDate = getStageEndDate(project, 'Дизайн и вёрстка');
    const productionStartDate = getProductionTaskStartDate(project);
    return productionStartDate && (!designEndDate || productionStartDate < designEndDate)
      ? productionStartDate
      : designEndDate;
  };

  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === 'HobbyWorldPlanner2026!') {
      setUserRole('editor');
      sessionStorage.setItem('hw_planner_role', 'editor');
      setPasswordError(false);
    } else if (passwordInput === 'ViewPlanner2026!') {
      setUserRole('viewer');
      sessionStorage.setItem('hw_planner_role', 'viewer');
      setPasswordError(false);
    } else {
      setPasswordError(true);
      setPasswordInput('');
    }
  };

  const handleLogout = () => {
    setUserRole(null);
    sessionStorage.removeItem('hw_planner_role');
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (!isReadOnly && history.length > 0) {
          handleUndo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [history, isReadOnly]);

  const rollDice = () => {
    let newVal;
    do {
      newVal = Math.floor(Math.random() * 6) + 1;
    } while (newVal === diceValue);
    setDiceValue(newVal);
  };

  const renderDiceFace = (val: number) => {
    const dotClass = "w-1.5 h-1.5 bg-indigo-600 rounded-full";
    const containerClass = "grid grid-cols-3 gap-1 p-1 relative w-full h-full items-center justify-items-center";

    switch (val) {
      case 1:
        return (
          <div className="flex items-center justify-center w-full h-full">
            <div className={dotClass} />
          </div>
        );
      case 2:
        return (
          <div className="flex flex-col justify-between items-center w-full h-full py-1.5">
            <div className="self-start ml-2 scale-90"><div className={dotClass} /></div>
            <div className="self-end mr-2 scale-90"><div className={dotClass} /></div>
          </div>
        );
      case 3:
        return (
          <div className="flex flex-col justify-between items-center w-full h-full py-1">
            <div className="self-start ml-1.5 scale-75"><div className={dotClass} /></div>
            <div className="scale-75"><div className={dotClass} /></div>
            <div className="self-end mr-1.5 scale-75"><div className={dotClass} /></div>
          </div>
        );
      case 4:
        return (
          <div className="grid grid-cols-2 gap-2 p-1.5">
            <div className={dotClass} />
            <div className={dotClass} />
            <div className={dotClass} />
            <div className={dotClass} />
          </div>
        );
      case 5:
        return (
          <div className="grid grid-cols-2 gap-1.5 p-1 relative">
            <div className={dotClass} />
            <div className={dotClass} />
            <div className={dotClass} />
            <div className={dotClass} />
            <div className="absolute inset-0 m-auto w-1.5 h-1.5 bg-indigo-600 rounded-full" />
          </div>
        );
      case 6:
        return (
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 p-1">
            <div className={dotClass} />
            <div className={dotClass} />
            <div className={dotClass} />
            <div className={dotClass} />
            <div className={dotClass} />
            <div className={dotClass} />
          </div>
        );
      default:
        return null;
    }
  };

  const [activeTab, setActiveTab] = useState<string>('projects');
  const [showProjectTabsMenu, setShowProjectTabsMenu] = useState(false);
  const projectTabsMenuRef = useRef<HTMLDivElement>(null);
  const [extraProjectYears, setExtraProjectYears] = useState<number[]>([]);
  const [userRoleFilter, setUserRoleFilter] = useState<string>('all');

  // "Импорт" button dropdown: lists the last MAX_BACKUPS daily auto-backups
  // (see server.ts) alongside the pre-existing manual file-import option.
  // Rendered through a portal into <body>, positioned in fixed (viewport)
  // coordinates computed from the button — same reason as the task comment
  // popover above: a z-index set here can't escape the sticky Gantt
  // timeline header's own stacking context, which is why it kept getting
  // hidden underneath the month bands.
  const [showBackupsMenu, setShowBackupsMenu] = useState(false);
  const backupsMenuButtonRef = useRef<HTMLButtonElement>(null);
  const backupsMenuPanelRef = useRef<HTMLDivElement>(null);
  const [backupsMenuPos, setBackupsMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [backupsList, setBackupsList] = useState<{ id: string; createdAt: string }[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);

  useEffect(() => {
    if (!showBackupsMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideButton = backupsMenuButtonRef.current?.contains(target);
      const insidePanel = backupsMenuPanelRef.current?.contains(target);
      if (!insideButton && !insidePanel) {
        setShowBackupsMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showBackupsMenu]);

  useLayoutEffect(() => {
    if (!showBackupsMenu) {
      setBackupsMenuPos(null);
      return;
    }
    const updatePosition = () => {
      const btn = backupsMenuButtonRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const panelWidth = 288;
      let left = rect.right - panelWidth;
      left = Math.max(8, Math.min(left, window.innerWidth - panelWidth - 8));
      const top = rect.bottom + 8;
      setBackupsMenuPos({ top, left });
    };
    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [showBackupsMenu]);

  const fetchBackupsList = async () => {
    setIsLoadingBackups(true);
    try {
      const res = await fetch('/api/backups');
      const data = await res.json();
      setBackupsList(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Fetch backups error:', err);
      setBackupsList([]);
    } finally {
      setIsLoadingBackups(false);
    }
  };

  const handleRestoreBackup = async (id: string, createdAt: string) => {
    if (isReadOnly) return;
    const dateLabel = format(new Date(createdAt), 'd MMMM yyyy, HH:mm', { locale: ru });
    if (!window.confirm(`Восстановить версию от ${dateLabel}? Это действие заменит ВСЕ текущие данные версией на этот момент.`)) return;
    setShowBackupsMenu(false);
    try {
      const res = await fetch(`/api/backups/${id}/restore`, { method: 'POST' });
      const result = await res.json();
      if (result.success) {
        alert('Данные восстановлены из бэкапа!');
        window.location.reload();
      } else {
        alert('Не удалось восстановить бэкап.');
      }
    } catch (err) {
      console.error('Restore backup error:', err);
      alert('Ошибка при восстановлении бэкапа.');
    }
  };

  useEffect(() => {
    if (!showProjectTabsMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (projectTabsMenuRef.current && !projectTabsMenuRef.current.contains(e.target as Node)) {
        setShowProjectTabsMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProjectTabsMenu]);

  // "+" picker in the "Игра" column header of the Редактура и вёрстка table —
  // that table only shows projects explicitly added to it, not every project.
  const [showAddEditorialProjectMenu, setShowAddEditorialProjectMenu] = useState(false);
  const [editorialAddSearch, setEditorialAddSearch] = useState('');
  const addEditorialProjectMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showAddEditorialProjectMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (addEditorialProjectMenuRef.current && !addEditorialProjectMenuRef.current.contains(e.target as Node)) {
        setShowAddEditorialProjectMenu(false);
        setEditorialAddSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAddEditorialProjectMenu]);

  // Same "+" picker, for the "Девелопмент" table's opt-in list.
  const [showAddDevProjectMenu, setShowAddDevProjectMenu] = useState(false);
  const [devAddSearch, setDevAddSearch] = useState('');
  const addDevProjectMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showAddDevProjectMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (addDevProjectMenuRef.current && !addDevProjectMenuRef.current.contains(e.target as Node)) {
        setShowAddDevProjectMenu(false);
        setDevAddSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAddDevProjectMenu]);

  // Same "+" picker, for the "Концептирование и арт-продакшн" table's opt-in list.
  const [showAddArtProjectMenu, setShowAddArtProjectMenu] = useState(false);
  const [artAddSearch, setArtAddSearch] = useState('');
  const addArtProjectMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showAddArtProjectMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (addArtProjectMenuRef.current && !addArtProjectMenuRef.current.contains(e.target as Node)) {
        setShowAddArtProjectMenu(false);
        setArtAddSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAddArtProjectMenu]);

  // Review Tasks Mode State
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const [reviewTasks, setReviewTasks] = useState<{
    project: Project;
    resource: Resource;
    task: Task;
  }[]>([]);

  const [currentDate, setCurrentDate] = useState(new Date(2026, 0, 1));
  const [viewportWeeks, setViewportWeeks] = useState(104);
  const [zoomLevel, setZoomLevel] = useState<'day' | 'week' | 'month'>('week');
  const cellWidth = zoomLevel === 'month' ? MONTH_ZOOM_CELL_WIDTH : zoomLevel === 'day' ? DAY_ZOOM_CELL_WIDTH : CELL_WIDTH;
  const [modalMode, setModalMode] = useState<'add' | 'edit' | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [reassigning, setReassigning] = useState<{ projectId: string; resourceId: string; role: string } | null>(null);

  const isProjectTab = activeTab.startsWith('projects_') || activeTab === 'projects' || activeTab === 'prototypes' || activeTab === 'releases' || activeTab === 'mhi' || activeTab === 'corps' || activeTab === 'no_mhi';
  const isProjectFamilyTab = activeTab.startsWith('projects_') || activeTab === 'projects' || activeTab === 'mhi' || activeTab === 'corps' || activeTab === 'no_mhi';
  // Placeholder stage tabs — views for these are built one at a time, so for
  // now they just render an empty state instead of falling through to the
  // team/users Gantt rendering that every other unrecognized tab lands on.

  const getUserConflict = (userName: string, projectId: string, resourceId: string) => {
    if (!userName || userName === 'Не назначен') return false;

    const project = projects.find(p => p.id === projectId);
    if (!project) return false;

    const resource = project.resources.find(r => r.id === resourceId);
    if (!resource) return false;

    if (resource.tasks.length === 0) return false;

    const projectTasks = resource.tasks;
    const projectStart = new Date(Math.min(...projectTasks.map(t => new Date(t.startDate).getTime())));
    const projectEnd = new Date(Math.max(...projectTasks.map(t => addDays(new Date(t.startDate), t.duration).getTime())));

    return projects.some(p => {
      return p.resources.some(r => {
        if (r.name !== userName) return false;
        if (p.id === projectId && r.id === resourceId) return false;

        return r.tasks.some(t => {
          const tStart = new Date(t.startDate);
          const tEnd = addDays(tStart, t.duration);
          return tStart < projectEnd && projectStart < tEnd;
        });
      });
    });
  };
  const [delayConfirmation, setDelayConfirmation] = useState<{ projectId: string; resourceId: string; taskId: string; delayTask: Task } | null>(null);

  useEffect(() => {
    if (isLoading) return;

    let isPolling = false;
    
    const interval = setInterval(async () => {
      // Check if user is actively interacting to prevent overriding active states
      if (
        (window as any).__isInteracting ||
        modalMode !== null ||
        editingProjectId !== null ||
        editingUserId !== null ||
        reassigning !== null ||
        delayConfirmation !== null
      ) {
        return;
      }

      // Also check if any text input/textarea is currently focused to avoid stealing focus during typing
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.hasAttribute('contenteditable'))) {
        return;
      }

      // Never poll while a local edit is still being written, or just after
      // one settled — a GET that races a POST can read pre-write data, which
      // would otherwise overwrite the just-made edit until a manual reload.
      if (pendingWritesRef.current > 0 || Date.now() - lastWriteSettledAtRef.current < 2000) {
        return;
      }

      if (isPolling) return;
      isPolling = true;

      try {
        const fetchProjects = fetch('/api/projects').then(res => res.json());
        const fetchUsers = fetch('/api/users').then(res => res.json());

        const [projectsData, usersData] = await Promise.all([fetchProjects, fetchUsers]);

        // Ensure no other updates happened while we fetched, and user is still not interacting
        if (
          (window as any).__isInteracting ||
          modalMode !== null ||
          editingProjectId !== null ||
          editingUserId !== null ||
          reassigning !== null ||
          delayConfirmation !== null ||
          pendingWritesRef.current > 0 ||
          Date.now() - lastWriteSettledAtRef.current < 2000
        ) {
          isPolling = false;
          return;
        }

        // 1. Process projects
        if (projectsData && projectsData.length > 0) {
          const processedProjects = projectsData.map((p: Project) => ({
            ...p,
            resources: p.resources.map(r => ({
              ...r,
              tasks: r.tasks.map(t => ({
                ...t,
                startDate: new Date(t.startDate)
              }))
            }))
          })).sort((a: Project, b: Project) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

          // Compare JSON stringified forms to only update when there is an actual difference
          const projectsChanged = JSON.stringify(projects) !== JSON.stringify(processedProjects);
          if (projectsChanged) {
            setProjects(processedProjects);
            
            // Sync collapsed state mapping if there are any new projects
            setCollapsedProjects(prev => {
              const updated = { ...prev };
              let changed = false;
              processedProjects.forEach((p: Project) => {
                if (p.isCollapsed !== undefined && updated[p.id] !== p.isCollapsed) {
                  updated[p.id] = p.isCollapsed;
                  changed = true;
                }
              });
              return changed ? updated : prev;
            });
          }
        }

        // 2. Process users
        if (usersData && usersData.length > 0) {
          const processedUsers = usersData.map((user: User) => {
            const currentVacations = user.vacations || [];
            const holidayIds = new Set(currentVacations.map(v => v.id));
            
            const holidaysToAdd: any[] = [];
            [2025, 2026, 2027, 2028].forEach(year => {
              const yearHolidays = getRussianHolidaysForYear(year);
              yearHolidays.forEach(h => {
                if (!holidayIds.has(h.id)) {
                  holidaysToAdd.push(h);
                }
              });
            });
            
            if (holidaysToAdd.length > 0) {
              return {
                ...user,
                vacations: [...currentVacations, ...holidaysToAdd]
              };
            }
            return user;
          });

          const usersChanged = JSON.stringify(users) !== JSON.stringify(processedUsers);
          if (usersChanged) {
            setUsers(processedUsers);
          }
        }
      } catch (err) {
        console.error("Auto-update fetch failed:", err);
      } finally {
        isPolling = false;
      }
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(interval);
  }, [isLoading, projects, users, modalMode, editingProjectId, editingUserId, reassigning, delayConfirmation]);

  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  const appRootRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Date under the viewport's horizontal center at the moment the zoom level
  // is switched, so the change in cellWidth doesn't shift what's on screen.
  const zoomAnchorDateRef = useRef<Date | null>(null);

  const [projectSearch, setProjectSearch] = useState('');
  const [teamSearch, setTeamSearch] = useState('');
  const [releaseYearFilter, setReleaseYearFilter] = useState<string>('all');

  const timelineStart = useMemo(() => {
    if (activeTab === 'releases' && releaseYearFilter !== 'all') {
      const year = parseInt(releaseYearFilter);
      // Start from the beginning of the week containing December 1st of the previous year
      return startOfWeek(new Date(year - 1, 11, 1), { weekStartsOn: 1 });
    }
    if (activeTab.startsWith('projects_')) {
      const year = parseInt(activeTab.replace('projects_', ''));
      if (!isNaN(year)) {
        return startOfWeek(new Date(year, 0, 1), { weekStartsOn: 1 });
      }
    }
    return startOfWeek(currentDate, { weekStartsOn: 1 });
  }, [currentDate, activeTab, releaseYearFilter]);

  const sortedProjects = useMemo(() => {
    const filtered = projects.filter(p => {
      const matchesTeam = !teamSearch || p.resources.some(r => r.name.toLowerCase().includes(teamSearch.toLowerCase()));
      const matchesSearch = p.name.toLowerCase().includes(projectSearch.toLowerCase()) && matchesTeam;

      if (activeTab === 'prototypes') return matchesSearch && p.isPrototype;
      if (activeTab === 'projects') return matchesSearch && !p.isPrototype;
      if (activeTab === 'mhi') return matchesSearch && !!p.isMhi;
      if (activeTab === 'no_mhi') return matchesSearch && !p.isPrototype && !p.isMhi;
      if (activeTab === 'corps') return matchesSearch && (p.segment || '').trim().toLowerCase() === 'корп. заказ';
      if (activeTab === 'edit_layout') return matchesSearch && !!p.inEditorialLayout;
      if (activeTab === 'devel') return matchesSearch && !!p.inDevelopmentLayout;
      if (activeTab === 'concept_art') return matchesSearch && !!p.inArtLayout;

      if (activeTab.startsWith('projects_')) {
        const yearStr = activeTab.replace('projects_', '');
        const targetYear = parseInt(yearStr);
        const pYear = p.releaseYear || getProjectReleaseDate(p).getFullYear();
        return matchesSearch && !p.isPrototype && pYear === targetYear;
      }
      
      if (activeTab === 'releases') {
        if (!matchesSearch || p.excludeFromReleases || p.isPrototype) return false;
        if (releaseYearFilter === 'all') return true;
        const releaseDate = getProjectReleaseDate(p);
        return releaseDate.getFullYear().toString() === releaseYearFilter;
      }
      
      return matchesSearch;
    });

    // "Редактура и вёрстка" ranks games by print date (earliest first)
    // instead of the studio's manual project order — projects without a
    // computable print date (no override, no Дизайн-и-вёрстка/ПРОИЗВОДСТВО
    // data yet) sort to the end, since there's nothing to rank them by.
    if (activeTab === 'edit_layout') {
      return [...filtered].sort((a, b) => {
        const dateA = (a.printReadyDate ? new Date(a.printReadyDate) : getEditorialPrintDate(a))?.getTime() ?? Infinity;
        const dateB = (b.printReadyDate ? new Date(b.printReadyDate) : getEditorialPrintDate(b))?.getTime() ?? Infinity;
        return dateA - dateB;
      });
    }

    // "Девелопмент" ranks games by "В редактуру" (earliest first), same
    // reasoning as the editorial table's sort above.
    if (activeTab === 'devel') {
      return [...filtered].sort((a, b) => {
        const dateA = (a.devToEditorialDate ? new Date(a.devToEditorialDate) : getStageStartDate(a, 'Редактирование'))?.getTime() ?? Infinity;
        const dateB = (b.devToEditorialDate ? new Date(b.devToEditorialDate) : getStageStartDate(b, 'Редактирование'))?.getTime() ?? Infinity;
        return dateA - dateB;
      });
    }

    // "Концептирование и арт-продакшн" ranks games by "В вёрстку" (earliest
    // first), same reasoning as the editorial table's sort above.
    if (activeTab === 'concept_art') {
      return [...filtered].sort((a, b) => {
        const dateA = (a.artToLayoutDate ? new Date(a.artToLayoutDate) : getStageStartDate(a, 'Дизайн и вёрстка'))?.getTime() ?? Infinity;
        const dateB = (b.artToLayoutDate ? new Date(b.artToLayoutDate) : getStageStartDate(b, 'Дизайн и вёрстка'))?.getTime() ?? Infinity;
        return dateA - dateB;
      });
    }

    return filtered;
  }, [projects, projectSearch, teamSearch, activeTab, releaseYearFilter]);

  const projectYears = useMemo(() => {
    const years = new Set<number>([2026, 2027, 2028]);
    projects.forEach(p => {
      if (!p.isPrototype) {
        const yr = p.releaseYear || getProjectReleaseDate(p).getFullYear();
        if (yr) years.add(yr);
      }
    });
    extraProjectYears.forEach(yr => years.add(yr));
    return Array.from(years).sort();
  }, [projects, extraProjectYears]);

  const handleAddProjectYear = () => {
    const maxYear = projectYears.length > 0 ? Math.max(...projectYears) : 2028;
    setExtraProjectYears(prev => [...prev, maxYear + 1]);
  };

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    projects.forEach(p => {
      const releaseDate = getProjectReleaseDate(p);
      if (releaseDate.getTime() > 0) {
        years.add(releaseDate.getFullYear().toString());
      }
    });
    return Array.from(years).sort();
  }, [projects]);

  const handleSortProjects = async () => {
    if (isReadOnly) return;
    recordAction();
    const sorted = [...projects].sort((a, b) => {
      if (!!a.isCollapsed !== !!b.isCollapsed) {
        return a.isCollapsed ? 1 : -1;
      }
      const dateA = getProjectReleaseDate(a).getTime();
      const dateB = getProjectReleaseDate(b).getTime();
      return dateA - dateB;
    }).map((p, index) => ({
      ...p,
      sortOrder: index,
      releaseYear: getProjectReleaseDate(p).getFullYear()
    }));

    setProjects(sorted);

    // Save the new order to the server
    for (const project of sorted) {
      await syncProjectToServer(project);
    }
  };

  const activeEditingProject = useMemo(() => 
    projects.find(p => p.id === editingProjectId), 
  [projects, editingProjectId]);

  const activeEditingUser = useMemo(() => 
    users.find(u => u.id === editingUserId),
  [users, editingUserId]);

  const processedUsers = useMemo(() => {
    // Sorting: hidden (collapsed) users last, then primary role (first in array), then Name
    const sorted = [...users].sort((a, b) => {
      const aCollapsed = !!collapsedUsers[a.id];
      const bCollapsed = !!collapsedUsers[b.id];
      if (aCollapsed !== bCollapsed) return aCollapsed ? 1 : -1;
      const roleA = a.roles[0] || '';
      const roleB = b.roles[0] || '';
      if (roleA !== roleB) return roleA.localeCompare(roleB);
      return a.name.localeCompare(b.name);
    });

    // Filtering
    if (userRoleFilter === 'all') return sorted;
    return sorted.filter(u => u.roles.includes(userRoleFilter));
  }, [users, userRoleFilter, collapsedUsers]);

  const userTasksWithLanes = useMemo(() => {
    const rawMap: Record<string, { project: string; role: string; task: Task; projectId: string; resourceId: string; projectWeight?: number | string }[]> = {};
    projects.forEach(p => {
      p.resources.forEach(r => {
        if (!r.name || r.name === 'Не назначен') return;
        if (!rawMap[r.name]) rawMap[r.name] = [];
        r.tasks.forEach(t => {
          rawMap[r.name].push({ project: p.name, role: r.role, task: t, projectId: p.id, resourceId: r.id, projectWeight: p.weight });
        });
      });
    });

    const result: Record<string, { 
      tasks: { project: string; role: string; task: Task; projectId: string; resourceId: string; lane: number; projectWeight?: number | string }[];
      maxLanes: number;
    }> = {};

    Object.entries(rawMap).forEach(([userName, tasks]) => {
      // Sort tasks by start date
      const sortedTasks = [...tasks].sort((a, b) => new Date(a.task.startDate).getTime() - new Date(b.task.startDate).getTime());
      
      const lanes: { end: Date }[][] = [];
      const tasksWithLanes = sortedTasks.map(t => {
        const taskEnd = addDays(t.task.startDate, t.task.duration);
        let assignedLane = -1;

        for (let i = 0; i < lanes.length; i++) {
          const lastTaskInLane = lanes[i][lanes[i].length - 1];
          // Check if start of current task is after end of last task in lane
          if (t.task.startDate >= lastTaskInLane.end) {
            assignedLane = i;
            lanes[i].push({ end: taskEnd });
            break;
          }
        }

        if (assignedLane === -1) {
          assignedLane = lanes.length;
          lanes.push([{ end: taskEnd }]);
        }

        return { ...t, lane: assignedLane };
      });

      result[userName] = {
        tasks: tasksWithLanes,
        maxLanes: Math.max(1, lanes.length)
      };
    });

    return result;
  }, [projects]);

  const handleQuickAssign = (projectId: string, resourceId: string, newName: string) => {
    if (isReadOnly) return;
    recordAction();
    setProjects(prev => prev.map(p => {
      if (p.id !== projectId) return p;
      const updated = {
        ...p,
        resources: p.resources.map(r => {
          if (r.id !== resourceId) return r;
          return { ...r, name: newName };
        })
      };
      syncProjectToServer(updated);
      return updated;
    }));
  };

  const getFilteredUsers = (stage: string) => {
    const requiredRole = STAGE_TO_ROLE[stage];
    if (!requiredRole) return users;
    return users.filter(u => u.roles.includes(requiredRole));
  };

  // Tracks in-flight and just-settled writes to /api/projects and
  // /api/users. The background poll below only ever reads server state to
  // pick up changes from OTHER clients — it must never win a race against a
  // save this tab just made, or an edit visibly "appears then disappears"
  // until the next manual reload (the GET can land while the POST's write
  // is still being processed, reading pre-edit data). All mutating requests
  // go through this so the poll can check pendingWritesRef/lastWriteSettledAtRef
  // before applying anything it fetches.
  const pendingWritesRef = useRef(0);
  const lastWriteSettledAtRef = useRef(0);

  const trackedFetch = async (input: string, init?: RequestInit) => {
    pendingWritesRef.current++;
    try {
      return await fetch(input, init);
    } finally {
      pendingWritesRef.current--;
      lastWriteSettledAtRef.current = Date.now();
    }
  };

  const syncProjectToServer = async (projectData: Project) => {
    try {
      const response = await trackedFetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projectData)
      });

      if (!response.ok) {
        throw new Error('Failed to save to database');
      }
    } catch (error) {
      console.error('Database save error:', error);
    }
  };

  const syncUserToServer = async (userData: User) => {
    try {
      const response = await trackedFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      });

      if (!response.ok) {
        throw new Error('Failed to save user');
      }
    } catch (error) {
      console.error('Database save user error:', error);
    }
  };

  const saveProject = async (projectData: Project) => {
    if (isReadOnly) return;
    recordAction();
    
    // Calculate and assign release year based on ending dates
    const computedReleaseYear = getProjectReleaseDate(projectData).getFullYear();
    const projectWithYear = { ...projectData, releaseYear: computedReleaseYear };

    // Optimistic UI update — stays on whatever tab the modal was opened
    // from; it used to jump to the project's release-year tab on every save,
    // which was disorienting when editing/creating from a different tab.
    if (modalMode === 'edit') {
      setProjects(prev => prev.map(p => p.id === projectData.id ? projectWithYear : p));
    } else {
      const maxOrder = projects.reduce((max, p) => Math.max(max, p.sortOrder ?? -1), -1);
      const newProject = { ...projectWithYear, sortOrder: maxOrder + 1 };
      setProjects(prev => [...prev, newProject]);
      // Update data to sync
      projectData = newProject;
    }

    // Server-side update
    await syncProjectToServer(projectData);
    
    setModalMode(null);
    setEditingProjectId(null);
  };

  const deleteProject = async (projectId: string) => {
    if (isReadOnly) return;
    recordAction();
    // Optimistic UI update
    setProjects(prev => prev.filter(p => p.id !== projectId));
    setModalMode(null);
    setEditingProjectId(null);

    // Server-side update
    try {
      const response = await trackedFetch(`/api/projects/${projectId}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        throw new Error('Failed to delete from database');
      }
    } catch (error) {
      console.error('Database delete error:', error);
    }
  };



  const saveUser = async (userData: User) => {
    if (isReadOnly) return;
    recordAction();
    
    // Inject holidays if they don't exist
    const currentVacations = userData.vacations || [];
    const holidayIds = new Set(currentVacations.map(v => v.id));
    const holidaysToAdd: any[] = [];
    [2025, 2026, 2027, 2028].forEach(year => {
      const yearHolidays = getRussianHolidaysForYear(year);
      yearHolidays.forEach(h => {
        if (!holidayIds.has(h.id)) {
          holidaysToAdd.push(h);
        }
      });
    });
    
    const finalUserData = holidaysToAdd.length > 0
      ? { ...userData, vacations: [...currentVacations, ...holidaysToAdd] }
      : userData;

    // Optimistic UI update
    if (users.find(u => u.id === finalUserData.id)) {
      setUsers(prev => prev.map(u => u.id === finalUserData.id ? finalUserData : u));
    } else {
      setUsers(prev => [...prev, finalUserData]);
    }

    // Server-side update
    await syncUserToServer(finalUserData);

    setModalMode(null);
    setEditingUserId(null);
  };

  const deleteUser = async (userId: string) => {
    if (isReadOnly) return;
    recordAction();
    // Optimistic UI update
    setUsers(prev => prev.filter(u => u.id !== userId));
    setModalMode(null);
    setEditingUserId(null);

    // Server-side update
    try {
      const response = await trackedFetch(`/api/users/${userId}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Failed to delete user');
    } catch (error) {
      console.error('Database delete user error:', error);
    }
  };

  const weeks = useMemo(() => {
    let count = viewportWeeks;
    if (activeTab === 'projects') {
      const maxYear = projectYears.length > 0 ? Math.max(...projectYears) : 2028;
      const endOfMaxYear = new Date(maxYear, 11, 31);
      count = Math.ceil(differenceInDays(endOfMaxYear, timelineStart) / 7);
    } else if (activeTab === 'releases' && releaseYearFilter !== 'all') {
      const year = parseInt(releaseYearFilter);
      // End date is December 31st of the selected year
      const endOfYear = new Date(year, 11, 31);
      // Calculate how many weeks from timelineStart to endOfYear
      // We use differenceInDays because differenceInWeeks might truncate
      count = Math.ceil(differenceInDays(endOfYear, timelineStart) / 7);
    }
    return Array.from({ length: count }, (_, i) => addWeeks(timelineStart, i));
  }, [timelineStart, viewportWeeks, activeTab, releaseYearFilter, projectYears]);

  // Only built out when actually zoomed to Day level — one entry per day
  // across the same range as `weeks`, used for the day header/gridlines.
  const days = useMemo(() => {
    if (zoomLevel !== 'day') return [];
    return Array.from({ length: weeks.length * 7 }, (_, i) => addDays(timelineStart, i));
  }, [weeks, timelineStart, zoomLevel]);

  const months = useMemo(() => {
    const monthMap: Record<string, { monthName: string; year: string; daysInTimeline: number }> = {};
    const addToMonth = (date: Date, dayCount: number) => {
      const key = format(date, 'LLLL yyyy', { locale: ru });
      if (!monthMap[key]) {
        const monthName = format(date, 'LLLL', { locale: ru });
        monthMap[key] = {
          monthName: monthName.charAt(0).toUpperCase() + monthName.slice(1),
          year: format(date, 'yyyy'),
          daysInTimeline: 0
        };
      }
      monthMap[key].daysInTimeline += dayCount;
    };
    // Day zoom needs the month band's width to line up with the true
    // per-day gridlines (`days`), not week boundaries — a week that
    // straddles two months would otherwise get counted as 7 days in
    // whichever month its Monday falls in, drifting the header out of
    // sync with the day columns below it. Week/Month zoom render their
    // grid at week granularity, so bucketing by week start is correct
    // there (and keeps the band width a multiple of `cellWidth`).
    if (zoomLevel === 'day') {
      days.forEach(day => addToMonth(day, 1));
    } else {
      weeks.forEach(weekStart => addToMonth(weekStart, 7));
    }
    return Object.values(monthMap);
  }, [weeks, days, zoomLevel]);

  const scrollToToday = (behaviorParam?: ScrollBehavior | any) => {
    const behavior: ScrollBehavior = (behaviorParam === 'smooth' || behaviorParam === 'auto') ? behaviorParam : 'smooth';
    if (scrollContainerRef.current) {
      const today = new Date();
      if (today >= timelineStart) {
        const weeksFromStart = Math.floor(differenceInDays(today, timelineStart) / 7);
        if (weeksFromStart < weeks.length) {
          scrollContainerRef.current.scrollTo({
            left: weeksFromStart * cellWidth,
            behavior
          });
        }
      }
    }
  };

  const handleZoomLevelChange = (next: 'day' | 'week' | 'month') => {
    if (next === zoomLevel) return;
    const container = scrollContainerRef.current;
    if (container) {
      const centerX = container.scrollLeft + container.clientWidth / 2;
      const weeksFromStart = centerX / cellWidth;
      zoomAnchorDateRef.current = addDays(timelineStart, weeksFromStart * 7);
    }
    setZoomLevel(next);
  };

  // Re-center the timeline on the anchor date recorded above, using the new
  // cellWidth. Runs before paint so the switch doesn't flash the old scroll
  // position at the new zoom level.
  useLayoutEffect(() => {
    // The row/column layout animations touched off by a cellWidth change can
    // leave the outer app shell (which should never scroll horizontally —
    // only scrollContainerRef's inner Gantt does) with a stray scrollLeft.
    // Force it back before paint so the switch never visibly shifts the page.
    if (appRootRef.current) {
      appRootRef.current.scrollLeft = 0;
    }

    const container = scrollContainerRef.current;
    const anchorDate = zoomAnchorDateRef.current;
    if (container && anchorDate) {
      const weeksFromStart = differenceInDays(anchorDate, timelineStart) / 7;
      container.scrollLeft = weeksFromStart * cellWidth - container.clientWidth / 2;
    }
    zoomAnchorDateRef.current = null;
  }, [zoomLevel]);

  useEffect(() => {
    const scrollInstant = () => scrollToToday('auto');
    scrollInstant();
    const t1 = setTimeout(scrollInstant, 50);
    const t2 = setTimeout(scrollInstant, 150);
    const t3 = setTimeout(scrollInstant, 300);
    const t4 = setTimeout(scrollInstant, 500);
    const t5 = setTimeout(() => scrollToToday('smooth'), 800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
    };
  }, [weeks.length]);

  const updateProjectWeight = (projectId: string, delta: number) => {
    if (isReadOnly) return;
    recordAction();
    setProjects(prev => prev.map(p => {
      if (p.id !== projectId) return p;
      const currentWeight = p.weight;
      const currentIndex = WEIGHT_OPTIONS.indexOf(currentWeight);
      let newWeight = currentWeight;
      if (currentIndex !== -1) {
        const nextIndex = Math.max(0, Math.min(WEIGHT_OPTIONS.length - 1, currentIndex + delta));
        newWeight = WEIGHT_OPTIONS[nextIndex];
      } else {
        const numeric = getNumericWeight(currentWeight);
        const newNumeric = Math.max(1, numeric + delta);
        newWeight = newNumeric;
      }
      const updated = { ...p, weight: newWeight };
      syncProjectToServer(updated);
      return updated;
    }));
  };

  const updateTask = (projectId: string, resourceId: string, taskId: string, updates: Partial<Task>, forceLock = false) => {
    if (isReadOnly) return;
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    let updatedProject = { ...project };
    let taskToUpdate: Task | null = null;
    let resourceToUpdate: Resource | null = null;

    let oldTask: Task | null = null;
    for (const r of project.resources) {
      const t = r.tasks.find(tk => tk.id === taskId);
      if (t) {
        oldTask = t;
        break;
      }
    }

    const isLocked = forceLock || lockedProjects[projectId];

    if (isLocked && updates.startDate && oldTask) {
      const oldDate = oldTask.startDate;
      const newDate = updates.startDate;
      const daysDiff = differenceInDays(newDate, oldDate);

      if (daysDiff !== 0) {
        updatedProject.resources = project.resources.map(r => {
          const newTasks = r.tasks.map(t => {
            const baseShiftedDate = addDays(t.startDate, daysDiff);
            if (t.id === taskId) {
              taskToUpdate = { ...t, ...updates, startDate: baseShiftedDate };
              return taskToUpdate;
            } else {
              return { ...t, startDate: baseShiftedDate };
            }
          });
          if (r.id === resourceId) {
            resourceToUpdate = r;
          }
          return { ...r, tasks: newTasks };
        });
      } else {
        updatedProject.resources = project.resources.map(r => {
          if (r.id !== resourceId) return r;
          resourceToUpdate = r;
          const taskIndex = r.tasks.findIndex(t => t.id === taskId);
          if (taskIndex === -1) return r;
          
          taskToUpdate = { ...r.tasks[taskIndex], ...updates };
          const newTasks = [...r.tasks];
          newTasks[taskIndex] = taskToUpdate;
          return { ...r, tasks: newTasks };
        });
      }
    } else {
      updatedProject.resources = project.resources.map(r => {
        if (r.id !== resourceId) return r;
        resourceToUpdate = r;
        const taskIndex = r.tasks.findIndex(t => t.id === taskId);
        if (taskIndex === -1) return r;
        
        taskToUpdate = { ...r.tasks[taskIndex], ...updates };
        const newTasks = [...r.tasks];
        newTasks[taskIndex] = taskToUpdate;
        return { ...r, tasks: newTasks };
      });
    }

    if (!taskToUpdate || !resourceToUpdate) return;

    // СТАРТ ПРОДАЖ can never start before ПРОИЗВОДСТВО ends within the same
    // "Производство и старт продаж" row — clamp it to bump against
    // production instead of overlapping. Runs as a final pass over whatever
    // updatedProject.resources ended up as above, so it applies uniformly
    // no matter which task was actually edited or how (drag, resize, nudge
    // buttons, or a locked-project cascade shift) — moving/growing
    // ПРОИЗВОДСТВО pushes a too-early СТАРТ ПРОДАЖ forward just the same as
    // dragging СТАРТ ПРОДАЖ backward into it.
    updatedProject.resources = updatedProject.resources.map(r => {
      if (r.role !== 'Производство и старт продаж') return r;
      const prodTask = r.tasks.find(t => t.label?.trim().toUpperCase() === 'ПРОИЗВОДСТВО');
      if (!prodTask) return r;
      const productionEnd = addDays(prodTask.startDate, prodTask.duration);
      return {
        ...r,
        tasks: r.tasks.map(t => {
          if (t.label?.trim().toUpperCase() !== 'СТАРТ ПРОДАЖ' || t.startDate >= productionEnd) return t;
          if (t.id === taskToUpdate!.id) taskToUpdate = { ...t, startDate: productionEnd };
          return { ...t, startDate: productionEnd };
        })
      };
    });

    // Special logic for overdue -> prepare delay task and show confirmation
    if (updates.status === 'overdue' && (taskToUpdate as any).status === 'overdue') { // check if it JUST became overdue is done by caller usually, but here we can check old state
      const oldTask = (resourceToUpdate as any).tasks.find((t: any) => t.id === taskId);
      if (oldTask && oldTask.status !== 'overdue') {
        const roleMapping: Record<string, string> = {
          'Концептирование': 'концептирования',
          'Девелопмент': 'девелопмента',
          'Арт Продакшн': 'арт-продакшна',
          'Редактирование': 'редактирования',
          'Дизайн и вёрстка': 'дизайна',
          'Производство и старт продаж': 'производства'
        };
        
        const roleKey = (resourceToUpdate as any).role;
        const mappedName = roleMapping[roleKey] || roleKey.toLowerCase();
        
        const delayTask: Task = {
          id: Math.random().toString(36).substr(2, 9),
          label: `Задержка ${mappedName}`,
          startDate: addDays((taskToUpdate as any).startDate, (taskToUpdate as any).duration),
          duration: 7,
          color: (taskToUpdate as any).color,
          status: 'neutral',
          isDelay: true
        };
        
        setDelayConfirmation({ projectId, resourceId, taskId, delayTask });
      }
    }

    recordAction();
    setProjects(prev => prev.map(p => p.id === projectId ? updatedProject : p));
    syncProjectToServer(updatedProject);
  };

  const handleConfirmDelay = (shiftSubsequent: boolean) => {
    if (!delayConfirmation) return;
    recordAction();
    const { projectId, resourceId, taskId, delayTask } = delayConfirmation;

    const workflowOrder = [
      'Концептирование',
      'Девелопмент',
      'Арт Продакшн',
      'Редактирование',
      'Дизайн и вёрстка',
      'Производство и старт продаж'
    ];

    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    const overdueResource = project.resources.find(r => r.id === resourceId);
    if (!overdueResource) return;
    
    const overdueTask = overdueResource.tasks.find(t => t.id === taskId);
    if (!overdueTask) return;
    
    const overdueEnd = addDays(overdueTask.startDate, overdueTask.duration);
    const overdueRoleIndex = workflowOrder.indexOf(overdueResource.role);

    const updatedProject = {
      ...project,
      resources: project.resources.map(r => {
        const isTargetResource = r.id === resourceId;
        const currentRoleIndex = workflowOrder.indexOf(r.role);
        
        let newTasks = [...r.tasks];
        if (isTargetResource) {
          newTasks.push(delayTask);
        }

        if (shiftSubsequent && currentRoleIndex !== -1 && overdueRoleIndex !== -1) {
          if (currentRoleIndex >= overdueRoleIndex && r.role !== 'Производство и старт продаж') {
            newTasks = newTasks.map(t => {
              if (t.id === taskId || t.id === delayTask.id) return t;
              if (t.startDate >= overdueEnd) {
                return { ...t, startDate: addDays(t.startDate, 7) };
              }
              return t;
            });
          }
        }
        
        return { ...r, tasks: newTasks };
      })
    };

    setProjects(prev => prev.map(p => p.id === projectId ? updatedProject : p));
    syncProjectToServer(updatedProject);
    setDelayConfirmation(null);
  };

  const deleteTask = (projectId: string, resourceId: string, taskId: string) => {
    if (isReadOnly) return;
    recordAction();
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    const updatedProject = {
      ...project,
      resources: project.resources.map(r => {
        if (r.id !== resourceId) return r;
        return {
          ...r,
          tasks: r.tasks.filter(t => t.id !== taskId)
        };
      })
    };

    setProjects(prev => prev.map(p => p.id === projectId ? updatedProject : p));
    syncProjectToServer(updatedProject);
  };

  const addTask = (projectId: string, resourceId: string, date: Date) => {
    if (isReadOnly) return;
    recordAction();
    const project = projects.find(p => p.id === projectId);
    const resource = project?.resources.find(r => r.id === resourceId);
    const role = resource?.role || '';

    const newTask: Task = {
      id: Math.random().toString(36).substr(2, 9),
      label: 'Новая задача',
      startDate: date,
      duration: 7,
      color: role === 'Арт Продакшн' ? (project?.artDirectorRole === 'curator' ? 'lightpink' : 'darkred') : getTaskColor(role),
      status: 'neutral'
    };

    if (project) {
      const updatedProject = {
        ...project,
        resources: project.resources.map(r => {
          if (r.id !== resourceId) return r;
          return { ...r, tasks: [...r.tasks, newTask] };
        })
      };
      setProjects(prev => prev.map(p => p.id === projectId ? updatedProject : p));
      syncProjectToServer(updatedProject);
    }
  };

  const startReviewMode = () => {
    const today = new Date();
    // Monday as start of week
    const startOfThisWeek = startOfWeek(today, { weekStartsOn: 1 });
    const startOfLastWeek = subWeeks(startOfThisWeek, 1);
    const endOfLastWeek = endOfWeek(startOfLastWeek, { weekStartsOn: 1 });

    const tasksToReview: { project: Project; resource: Resource; task: Task }[] = [];

    projects.forEach(p => {
      if (p.isPrototype) return;
      p.resources.forEach(r => {
        r.tasks.forEach(t => {
          const taskStart = new Date(t.startDate);
          const taskEnd = addDays(taskStart, t.duration);
          
          // Requirement: Ignore tasks with "finished" status
          if (t.status === 'finished') return;

          // Requirement: Ignore tasks whose due date was more than two weeks ago
          const twoWeeksAgo = subWeeks(today, 2);
          if (taskEnd < twoWeeksAgo) return;

          // Requirement: Tasks that should have already started according to schedule
          if (taskStart <= today) {
            tasksToReview.push({ project: p, resource: r, task: t });
          }
        });
      });
    });

    // Sort tasks: Top project to bottom, then by role hierarchy
    const rolePriority: Record<string, number> = {
      'Концептирование': 1,
      'Девелопмент': 2,
      'Арт Продакшн': 3,
      'ПРОИЗВОДСТВО': 3,
      'Редактирование': 4,
      'Дизайн и вёрстка': 5
    };

    const projectOrder = sortedProjects.map(p => p.id);

    tasksToReview.sort((a, b) => {
      const pIdxA = projectOrder.indexOf(a.project.id);
      const pIdxB = projectOrder.indexOf(b.project.id);

      if (pIdxA !== pIdxB) return pIdxA - pIdxB;

      // Within same project, sort by role hierarchy
      const rPriorityA = rolePriority[a.resource.role] || 99;
      const rPriorityB = rolePriority[b.resource.role] || 99;

      if (rPriorityA !== rPriorityB) return rPriorityA - rPriorityB;

      // If same role type (e.g. Art/Production), sort by start date
      return new Date(a.task.startDate).getTime() - new Date(b.task.startDate).getTime();
    });

    if (tasksToReview.length > 0) {
      setReviewTasks(tasksToReview);
      setReviewIndex(0);
      const pr = tasksToReview[0].project;
      const yr = pr.releaseYear || getProjectReleaseDate(pr).getFullYear();
      setActiveTab(`projects_${yr}`);
    }
  };

  const navigateReview = (next: boolean) => {
    if (reviewIndex === null) return;

    let nextIndex = next ? reviewIndex + 1 : reviewIndex - 1;

    if (nextIndex >= reviewTasks.length) {
      setReviewIndex(null);
      setReviewTasks([]);
      return;
    }

    if (nextIndex < 0) nextIndex = 0;
    
    setReviewIndex(nextIndex);
  };

  useEffect(() => {
    if (reviewIndex !== null && reviewTasks[reviewIndex]) {
      const { project: initialProject, resource: initialResource, task: initialTask } = reviewTasks[reviewIndex];
      
      // Get fresh data in case tasks were moved
      const freshProject = projects.find(p => p.id === initialProject.id);
      if (!freshProject) return;
      
      const yr = freshProject.releaseYear || getProjectReleaseDate(freshProject).getFullYear();
      const expectedTab = `projects_${yr}`;
      if (activeTab !== expectedTab && activeTab.startsWith('projects_')) {
        setActiveTab(expectedTab);
      }

      const freshResource = freshProject.resources.find(r => r.id === initialResource.id);
      if (!freshResource) return;
      
      const freshTask = freshResource.tasks.find(t => t.id === initialTask.id);
      if (!freshTask) return;

      // Horizontal positioning
      const weeksFromStart = differenceInDays(freshTask.startDate, timelineStart) / 7;
      const horizontalScroll = weeksFromStart * cellWidth;

      // Vertical positioning
      let verticalOffset = 0;
      const projectIndex = sortedProjects.findIndex(p => p.id === freshProject.id);
      
      for (let i = 0; i < projectIndex; i++) {
        verticalOffset += getProjectRowHeight(sortedProjects[i]);
      }
      
      if (!collapsedProjects[freshProject.id]) {
        const resourceIndex = freshProject.resources.findIndex(r => r.id === freshResource.id);
        verticalOffset += resourceIndex * ROW_HEIGHT;
      }

      if (scrollContainerRef.current) {
        const viewportWidth = scrollContainerRef.current.clientWidth;
        const viewportHeight = scrollContainerRef.current.clientHeight;
        const sidebarWidth = 464; // Approx width of both sidebar columns
        const taskWidth = (freshTask.duration / 7) * cellWidth;

        // Try to center task in the visible area
        const scrollLeft = horizontalScroll - ((viewportWidth - sidebarWidth) / 2) + (taskWidth / 2);
        // Vertical center: header is 80px
        const scrollTop = verticalOffset - ((viewportHeight - 80) / 2) + (ROW_HEIGHT / 2);

        scrollContainerRef.current.scrollTo({
          left: scrollLeft,
          top: scrollTop,
          behavior: 'smooth'
        });
      }
    }
  }, [reviewIndex, reviewTasks, projects, sortedProjects, timelineStart, activeTab, cellWidth]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 relative font-sans text-slate-900">
        {/* Subtle decorative absolute indicators */}
        <div className="absolute top-8 left-8 flex items-center gap-2">
          <div className="w-2.5 h-2.5 bg-indigo-600 rounded-full animate-ping" />
          <span className="text-[10px] font-black uppercase tracking-widest text-[#4f46e5]">Hobby World Planner</span>
        </div>
        
        <div className="max-w-md w-full p-8 flex flex-col items-center text-center">
          {/* Logo / Mascot Card Container with custom border/shadow */}
          <div className="relative mb-8">
            {/* Spinning background orbital ring */}
            <div className="absolute -inset-4 border border-indigo-100 rounded-3xl animate-spin" style={{ animationDuration: '6s' }} />
            <div className="absolute -inset-2 border-2 border-dashed border-indigo-200/40 rounded-2xl animate-spin" style={{ animationDuration: '10s', animationDirection: 'reverse' }} />
            
            <div className="relative w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center text-white shadow-xl shadow-indigo-100 flex-shrink-0">
              <Calendar size={40} className="animate-pulse" />
            </div>
          </div>

          <div className="space-y-3">
            {/* Elegant display font, tracking values */}
            <h1 className="text-xl font-black text-slate-800 uppercase tracking-wider">
              Загрузка системы...
            </h1>
            <p className="text-xs text-[#64748b] font-medium max-w-xs leading-relaxed">
              Синхронизируем проекты, отпуска сотрудников и актуальные сроки с базой данных.
            </p>
          </div>

          {/* Clean animated progress indicator with micro bar */}
          <div className="w-48 bg-slate-200/60 h-1.5 rounded-full overflow-hidden mt-8 relative">
            <div className="absolute top-0 bottom-0 left-0 bg-indigo-600 rounded-full w-24 animate-[loading-bar_1.5s_ease-in-out_infinite]" style={{
              animationName: 'loading-bar',
            }} />
          </div>
          
          <style>{`
            @keyframes loading-bar {
              0% { left: -30%; width: 30%; }
              50% { width: 40%; }
              100% { left: 100%; width: 20%; }
            }
          `}</style>
          
          <span className="text-[9px] text-[#cbd5e1] font-bold uppercase tracking-widest mt-4">Инициализация модулей</span>
        </div>
      </div>
    );
  }

  return (
    <div ref={appRootRef} className="flex flex-col h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden relative">
      {!isAuthenticated && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/95 backdrop-blur-md">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md p-8 bg-white rounded-2xl shadow-2xl border border-slate-200 m-4"
          >
            <div className="flex flex-col items-center gap-6">
              <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                <Lock size={32} strokeWidth={2.5} />
              </div>
              
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-black tracking-tight text-slate-800">Доступ ограничен</h2>
                <p className="text-sm text-slate-500 font-medium">Введите пароль для входа в Hobby World Planner</p>
              </div>

              <form onSubmit={handlePasswordSubmit} className="w-full space-y-4">
                <div className="relative">
                  <input 
                    type="password"
                    autoFocus
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="Пароль доступа"
                    className={`w-full px-4 py-3 bg-slate-50 border rounded-xl outline-none transition-all font-medium text-center tracking-widest ${
                      passwordError ? 'border-red-500 ring-2 ring-red-100' : 'border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100'
                    }`}
                  />
                  {passwordError && (
                    <motion.p 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-[11px] text-red-600 font-bold mt-2 text-center uppercase tracking-tighter"
                    >
                      Неверный пароль. Попробуйте еще раз.
                    </motion.p>
                  )}
                </div>
                
                <button 
                  type="submit"
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-100 active:scale-95"
                >
                  Войти
                </button>
              </form>
              
              <div className="pt-4 text-center">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest italic">Confidential Access Only</p>
                <p className="text-[9px] text-slate-300 font-medium mt-1">Hobby World • 2026</p>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between gap-4 px-6 py-4 bg-white border-b border-slate-200 z-30 shadow-sm">
        <div className="flex items-center gap-4">
          <div 
            onClick={rollDice}
            className="flex-shrink-0 w-11 h-11 flex items-center justify-center cursor-pointer select-none hover:scale-105 active:scale-95 transition-all"
            title="Кубик"
          >
            <img 
              src="/logo.svg" 
              alt="Logo" 
              className="w-full h-full object-contain filter drop-shadow-sm" 
              referrerPolicy="no-referrer"
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight leading-tight whitespace-nowrap">Студия<br />Hobby World</h1>
              {dbStatus && (
                <div
                  className={`w-2.5 h-2.5 rounded-full shadow-sm border transition-all ${
                    dbStatus.connected
                      ? 'bg-emerald-500 border-emerald-600'
                      : 'bg-rose-500 border-rose-600 animate-pulse'
                  }`}
                  title={dbStatus.message}
                />
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsSidebarVisible(!isSidebarVisible)}
            className={`flex items-center justify-center p-2 rounded-lg transition-all h-[38px] w-[38px] ${isSidebarVisible ? 'bg-slate-100 text-slate-600' : 'bg-indigo-50 text-indigo-600 ring-2 ring-indigo-200'}`}
            title="Детали"
          >
            <Users size={18} />
          </button>

          <button
            onClick={startReviewMode}
            className="flex items-center justify-center bg-slate-900 border border-slate-700 text-slate-200 p-2 rounded-lg transition-all hover:bg-slate-800 shadow-sm h-[38px] w-[38px]"
            title="Режим проверки"
          >
            <Search size={18} className="text-indigo-400" />
          </button>

          <button
            onClick={scrollToToday}
            className="p-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg transition-all shadow-sm h-[38px]"
            title="Перейти к сегодняшнему числу"
          >
            <Calendar size={18} className="text-indigo-600" />
          </button>

          <div className="flex items-center bg-slate-100 p-1 rounded-lg gap-1 h-[38px]" title="Масштаб календаря">
            <button
              onClick={() => handleZoomLevelChange('day')}
              className={`px-3 h-full rounded-md text-xs font-bold transition-all ${
                zoomLevel === 'day' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Дни
            </button>
            <button
              onClick={() => handleZoomLevelChange('week')}
              className={`px-3 h-full rounded-md text-xs font-bold transition-all ${
                zoomLevel === 'week' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Недели
            </button>
            <button
              onClick={() => handleZoomLevelChange('month')}
              className={`px-3 h-full rounded-md text-xs font-bold transition-all ${
                zoomLevel === 'month' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Месяцы
            </button>
          </div>

          {isProjectTab && (
            <button 
              onClick={handleSortProjects}
              className="p-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg transition-all shadow-sm h-[38px]"
              title="Сортировать проекты по дате выхода"
            >
              <SortAsc size={18} className="text-indigo-600" />
            </button>
          )}



          {!isReadOnly && (isProjectTab ? activeTab !== 'releases' : activeTab === 'users') && (
            <button
              onClick={() => {
                if (isProjectTab) setModalMode('add');
                else setEditingUserId(null), setModalMode('add');
              }}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-indigo-100 whitespace-nowrap h-[38px]"
            >
              <Plus size={18} />
              <span>{isProjectTab ? 'Проект' : 'Сотрудник'}</span>
            </button>
          )}
          
          <button 
            onClick={handleLogout}
            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
            title="Выйти"
          >
            <LogOut size={20} />
          </button>
          
          <button 
            onClick={handleUndo}
            disabled={history.length === 0 || isReadOnly}
            className={`p-2 rounded-lg transition-all flex items-center gap-1.5 ${history.length === 0 || isReadOnly ? 'text-slate-200 cursor-not-allowed' : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-100 ring-1 ring-slate-200'}`}
            title="Отменить последнее действие (Ctrl+Z)"
          >
            <Undo2 size={18} />
            <span className="text-[10px] font-black uppercase tracking-tighter hidden sm:inline">Отмена</span>
          </button>

          <div className="h-8 w-[1px] bg-slate-200 mx-1"></div>

          <button 
            onClick={handleExportData}
            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all flex items-center gap-1.5 ring-1 ring-slate-200"
            title="Экспортировать данные (Резервная копия)"
          >
            <Download size={18} />
            <span className="text-[10px] font-black uppercase tracking-tighter hidden sm:inline">Экспорт</span>
          </button>

          <div className="relative">
            <button
              ref={backupsMenuButtonRef}
              onClick={() => {
                const next = !showBackupsMenu;
                setShowBackupsMenu(next);
                if (next) fetchBackupsList();
              }}
              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all flex items-center gap-1.5 ring-1 ring-slate-200"
              title="Импорт данных: восстановить из бэкапа или загрузить файл"
            >
              <Upload size={18} />
              <span className="text-[10px] font-black uppercase tracking-tighter hidden sm:inline">Импорт</span>
            </button>

            {showBackupsMenu && backupsMenuPos && createPortal(
              <div
                ref={backupsMenuPanelRef}
                style={{ position: 'fixed', top: backupsMenuPos.top, left: backupsMenuPos.left, zIndex: 9999 }}
                className="w-72 bg-white border border-slate-200 rounded-lg shadow-2xl overflow-hidden"
              >
                <div className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                  Автобэкапы (каждый день в 9:00)
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {isLoadingBackups ? (
                    <div className="px-3 py-3 text-xs text-slate-400">Загрузка...</div>
                  ) : backupsList.length === 0 ? (
                    <div className="px-3 py-3 text-xs text-slate-400">Бэкапов пока нет</div>
                  ) : (
                    backupsList.map(b => (
                      <button
                        key={b.id}
                        onClick={() => handleRestoreBackup(b.id, b.createdAt)}
                        disabled={isReadOnly}
                        className="w-full text-left px-3 py-2 text-xs font-medium text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {format(new Date(b.createdAt), 'd MMMM yyyy, HH:mm', { locale: ru })}
                      </button>
                    ))
                  )}
                </div>
                <div className="border-t border-slate-100">
                  <button
                    onClick={() => { setShowBackupsMenu(false); fileInputRef.current?.click(); }}
                    className="w-full text-left px-3 py-2.5 text-xs font-bold text-indigo-600 hover:bg-indigo-50 transition-colors flex items-center gap-2"
                  >
                    <Upload size={14} />
                    Загрузить файл вручную
                  </button>
                </div>
              </div>,
              document.body
            )}
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportData}
            accept=".json"
            className="hidden"
          />
        </div>
      </header>

      {/* Main Content */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-auto relative scroll-smooth"
      >
        {activeTab === 'edit_layout' ? (
          <div className="p-6 overflow-auto h-full">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="sticky top-0 bg-white z-10 border-b-2 border-slate-400 text-left">
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    <div className="flex items-center gap-2">
                      <span>Игра</span>
                      <div className="relative" ref={addEditorialProjectMenuRef}>
                        <button
                          onClick={() => setShowAddEditorialProjectMenu(!showAddEditorialProjectMenu)}
                          className="w-4 h-4 flex items-center justify-center rounded bg-indigo-100 text-indigo-600 hover:bg-indigo-200 transition-colors"
                          title="Добавить проект в таблицу"
                        >
                          <Plus size={10} strokeWidth={3} />
                        </button>
                        {showAddEditorialProjectMenu && (
                          <div className="absolute top-full mt-1 left-0 flex flex-col bg-slate-800 border border-slate-700 rounded-lg shadow-2xl z-[100] w-56 normal-case font-normal">
                            <div className="p-2 border-b border-slate-700">
                              <input
                                autoFocus
                                type="text"
                                value={editorialAddSearch}
                                onChange={(e) => setEditorialAddSearch(e.target.value)}
                                placeholder="Поиск игры..."
                                className="w-full bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-[10px] text-white placeholder:text-slate-500 outline-none focus:border-indigo-500"
                              />
                            </div>
                            <div className="max-h-64 overflow-y-auto p-1">
                              {(() => {
                                const addableProjects = projects
                                  .filter(p => !p.inEditorialLayout && !p.isPrototype && !p.isCollapsed && p.name.toLowerCase().includes(editorialAddSearch.toLowerCase()))
                                  .sort((a, b) => getProjectReleaseDate(a).getTime() - getProjectReleaseDate(b).getTime());
                                if (addableProjects.length === 0) {
                                  return <div className="px-2 py-3 text-[10px] text-slate-500 text-center">Ничего не найдено</div>;
                                }
                                return addableProjects.map(p => (
                                  <button
                                    key={p.id}
                                    onClick={() => updateEditorialField(p.id, { inEditorialLayout: true })}
                                    className="w-full text-[10px] px-2 py-1.5 hover:bg-white/10 rounded-md text-left transition-colors font-medium text-slate-200 truncate"
                                  >
                                    {p.name}
                                  </button>
                                ));
                              })()}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Вес</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Издатель</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Сегмент</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Импорт</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Редактор</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Дизайнер</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Статус</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Текущая задача</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Комментарий</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">В печать</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Старт</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">ТЗ на вёрстку</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Правила</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Старт вёрстки</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Вёрстка компонентов</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Вёрстка коробки</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Вёрстка правил</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Согласование</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Пост-вёрстка</th>
                </tr>
              </thead>
              <tbody>
                {sortedProjects.map(project => {
                  const editor = getStageResource(project, 'Редактирование');
                  const designer = getStageResource(project, 'Дизайн и вёрстка');
                  const startDate = getStageStartDate(project, 'Редактирование');
                  const printDate = getEditorialPrintDate(project);
                  const statusInfo = EDITORIAL_STATUSES.find(s => s.value === project.editorialStatus);
                  const fmt = (d: Date | null) => d ? format(d, 'dd.MM.yyyy') : '—';

                  // Every date on this row is a faded "plan" estimate until a
                  // person edits that specific cell for the first time — the
                  // manual override field is what's saved, so its absence is
                  // exactly what "still just a plan" means.
                  const resolvedStartDate = project.editStartDate ? new Date(project.editStartDate) : startDate;
                  // МХИ projects don't follow the regulatory weight-duration
                  // schedule (most don't even carry a numeric weight), so no
                  // recommended plan is computed for them here — only Старт
                  // and В печать stay populated (from the Gantt "план" tasks
                  // above), by explicit request.
                  const planChain = project.isMhi ? {} : getEditorialPlanChain(resolvedStartDate, project.weight);

                  return (
                    <tr key={project.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 group">
                          <span
                            className="font-bold text-indigo-600 cursor-pointer"
                            onClick={() => { setEditingProjectId(project.id); setModalMode('edit'); }}
                          >
                            {project.name}
                          </span>
                          <button
                            onClick={() => updateEditorialField(project.id, { inEditorialLayout: false })}
                            className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all flex-shrink-0"
                            title="Убрать из таблицы"
                          >
                            <X size={11} strokeWidth={2.5} />
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-slate-600">{project.isMhi ? '—' : project.weight}</td>
                      <td className="px-3 py-2">
                        <input
                          key={`publisher-${project.id}`}
                          type="text"
                          defaultValue={project.publisher || ''}
                          onBlur={(e) => updateEditorialField(project.id, { publisher: e.target.value })}
                          disabled={isReadOnly}
                          placeholder="—"
                          className="w-28 bg-transparent border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded px-1.5 py-1 outline-none transition-colors"
                        />
                      </td>
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{project.segment || '—'}</td>
                      <td className="px-3 py-2">
                        <input
                          key={`components-${project.id}`}
                          type="text"
                          defaultValue={project.componentsNote || ''}
                          onBlur={(e) => updateEditorialField(project.id, { componentsNote: e.target.value })}
                          disabled={isReadOnly}
                          placeholder="—"
                          className="w-28 bg-transparent border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded px-1.5 py-1 outline-none transition-colors"
                        />
                      </td>
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{editor?.name && editor.name !== 'Не назначен' ? editor.name : '—'}</td>
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{designer?.name && designer.name !== 'Не назначен' ? designer.name : '—'}</td>
                      <td className="px-3 py-2">
                        <select
                          value={project.editorialStatus || ''}
                          onChange={(e) => {
                            const value = e.target.value || undefined;
                            updateEditorialField(project.id, {
                              editorialStatus: value,
                              editorialPausedAt: value === PAUSE_STATUS_VALUE ? format(new Date(), 'yyyy-MM-dd') : undefined,
                            });
                          }}
                          disabled={isReadOnly}
                          className={`text-[10px] font-bold uppercase tracking-tighter rounded-full px-2 py-1 outline-none border-none cursor-pointer ${statusInfo ? statusInfo.className : 'bg-slate-100 text-slate-400'}`}
                        >
                          <option value="">—</option>
                          {EDITORIAL_STATUSES.map((s, i) => (
                            <React.Fragment key={s.value}>
                              {i === EDITORIAL_STATUS_UPPER_GROUP_SIZE && <option disabled>──────────</option>}
                              {i === EDITORIAL_STATUSES.length - 1 && <option disabled>──────────</option>}
                              <option value={s.value}>{s.value}</option>
                            </React.Fragment>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          key={`task-${project.id}`}
                          type="text"
                          defaultValue={project.currentTaskNote || ''}
                          onBlur={(e) => updateEditorialField(project.id, { currentTaskNote: e.target.value })}
                          disabled={isReadOnly}
                          placeholder="—"
                          className="w-40 bg-transparent border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded px-1.5 py-1 outline-none transition-colors"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          key={`comment-${project.id}`}
                          type="text"
                          defaultValue={project.editorialComment || ''}
                          onBlur={(e) => updateEditorialField(project.id, { editorialComment: e.target.value })}
                          disabled={isReadOnly}
                          placeholder="—"
                          className="w-40 bg-transparent border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded px-1.5 py-1 outline-none transition-colors"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <PlanDateInput
                          value={project.printReadyDate}
                          planDate={printDate}
                          onChange={(v) => updateEditorialField(project.id, { printReadyDate: v })}
                          disabled={isReadOnly}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <PlanDateInput
                          value={project.editStartDate}
                          planDate={startDate}
                          onChange={(v) => updateEditorialField(project.id, { editStartDate: v })}
                          disabled={isReadOnly}
                        />
                      </td>
                      {EDITORIAL_PLAN_DISPLAY_ORDER.map(field => (
                        <td key={field} className="px-3 py-2">
                          <PlanDateInput
                            value={project[field]}
                            planDate={planChain[field]}
                            onChange={(v) => updateEditorialField(project.id, { [field]: v })}
                            disabled={isReadOnly}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : activeTab === 'devel' ? (
          <div className="p-6 overflow-auto h-full">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="sticky top-0 bg-white z-10 border-b-2 border-slate-400 text-left">
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    <div className="flex items-center gap-2">
                      <span>Игра</span>
                      <div className="relative" ref={addDevProjectMenuRef}>
                        <button
                          onClick={() => setShowAddDevProjectMenu(!showAddDevProjectMenu)}
                          className="w-4 h-4 flex items-center justify-center rounded bg-indigo-100 text-indigo-600 hover:bg-indigo-200 transition-colors"
                          title="Добавить проект в таблицу"
                        >
                          <Plus size={10} strokeWidth={3} />
                        </button>
                        {showAddDevProjectMenu && (
                          <div className="absolute top-full mt-1 left-0 flex flex-col bg-slate-800 border border-slate-700 rounded-lg shadow-2xl z-[100] w-56 normal-case font-normal">
                            <div className="p-2 border-b border-slate-700">
                              <input
                                autoFocus
                                type="text"
                                value={devAddSearch}
                                onChange={(e) => setDevAddSearch(e.target.value)}
                                placeholder="Поиск игры..."
                                className="w-full bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-[10px] text-white placeholder:text-slate-500 outline-none focus:border-indigo-500"
                              />
                            </div>
                            <div className="max-h-64 overflow-y-auto p-1">
                              {(() => {
                                const addableProjects = projects
                                  .filter(p => !p.inDevelopmentLayout && !p.isPrototype && !p.isCollapsed && p.name.toLowerCase().includes(devAddSearch.toLowerCase()))
                                  .sort((a, b) => getProjectReleaseDate(a).getTime() - getProjectReleaseDate(b).getTime());
                                if (addableProjects.length === 0) {
                                  return <div className="px-2 py-3 text-[10px] text-slate-500 text-center">Ничего не найдено</div>;
                                }
                                return addableProjects.map(p => (
                                  <button
                                    key={p.id}
                                    onClick={() => updateEditorialField(p.id, { inDevelopmentLayout: true })}
                                    className="w-full text-[10px] px-2 py-1.5 hover:bg-white/10 rounded-md text-left transition-colors font-medium text-slate-200 truncate"
                                  >
                                    {p.name}
                                  </button>
                                ));
                              })()}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Вес</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Сегмент</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Импорт</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Девелопер</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Статус</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Девдок</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Комментарий</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">В редактуру</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Старт</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Создание девдока</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Работа над ядром</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Девелопмент игры</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Финализация</th>
                </tr>
              </thead>
              <tbody>
                {sortedProjects.map(project => {
                  const developer = getStageResource(project, 'Девелопмент');
                  const devStartComputed = getStageStartDate(project, 'Девелопмент');
                  const toEditorialComputed = getStageStartDate(project, 'Редактирование');
                  const devStatusInfo = DEV_STATUSES.find(s => s.value === project.devStatus);

                  return (
                    <tr key={project.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 group">
                          <span
                            className="font-bold text-indigo-600 cursor-pointer"
                            onClick={() => { setEditingProjectId(project.id); setModalMode('edit'); }}
                          >
                            {project.name}
                          </span>
                          <button
                            onClick={() => updateEditorialField(project.id, { inDevelopmentLayout: false })}
                            className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all flex-shrink-0"
                            title="Убрать из таблицы"
                          >
                            <X size={11} strokeWidth={2.5} />
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-slate-600">{project.isMhi ? '—' : project.weight}</td>
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{project.segment || '—'}</td>
                      <td className="px-3 py-2">
                        <input
                          key={`components-${project.id}`}
                          type="text"
                          defaultValue={project.componentsNote || ''}
                          onBlur={(e) => updateEditorialField(project.id, { componentsNote: e.target.value })}
                          disabled={isReadOnly}
                          placeholder="—"
                          className="w-28 bg-transparent border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded px-1.5 py-1 outline-none transition-colors"
                        />
                      </td>
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{developer?.name && developer.name !== 'Не назначен' ? developer.name : '—'}</td>
                      <td className="px-3 py-2">
                        <select
                          value={project.devStatus || ''}
                          onChange={(e) => {
                            const value = e.target.value || undefined;
                            updateEditorialField(project.id, {
                              devStatus: value,
                              devPausedAt: value === PAUSE_STATUS_VALUE ? format(new Date(), 'yyyy-MM-dd') : undefined,
                            });
                          }}
                          disabled={isReadOnly}
                          className={`text-[10px] font-bold uppercase tracking-tighter rounded-full px-2 py-1 outline-none border-none cursor-pointer ${devStatusInfo ? devStatusInfo.className : 'bg-slate-100 text-slate-400'}`}
                        >
                          <option value="">—</option>
                          {DEV_STATUSES.map((s, i) => (
                            <React.Fragment key={s.value}>
                              {i === DEV_STATUS_UPPER_GROUP_SIZE && <option disabled>──────────</option>}
                              {i === DEV_STATUSES.length - 1 && <option disabled>──────────</option>}
                              <option value={s.value}>{s.value}</option>
                            </React.Fragment>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          key={`devdoc-${project.id}`}
                          type="text"
                          defaultValue={project.devDocNote || ''}
                          onBlur={(e) => updateEditorialField(project.id, { devDocNote: e.target.value })}
                          disabled={isReadOnly}
                          placeholder="—"
                          className="w-40 bg-transparent border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded px-1.5 py-1 outline-none transition-colors"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          key={`devcomment-${project.id}`}
                          type="text"
                          defaultValue={project.devComment || ''}
                          onBlur={(e) => updateEditorialField(project.id, { devComment: e.target.value })}
                          disabled={isReadOnly}
                          placeholder="—"
                          className="w-40 bg-transparent border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded px-1.5 py-1 outline-none transition-colors"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <PlanDateInput
                          value={project.devToEditorialDate}
                          planDate={toEditorialComputed}
                          onChange={(v) => updateEditorialField(project.id, { devToEditorialDate: v })}
                          disabled={isReadOnly}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <PlanDateInput
                          value={project.devStartDate}
                          planDate={devStartComputed}
                          onChange={(v) => updateEditorialField(project.id, { devStartDate: v })}
                          disabled={isReadOnly}
                        />
                      </td>
                      {DEV_STAGE_DISPLAY_ORDER.map(field => (
                        <td key={field} className="px-3 py-2">
                          <input
                            type="date"
                            value={project[field] || ''}
                            onChange={(e) => updateEditorialField(project.id, { [field]: e.target.value || undefined })}
                            disabled={isReadOnly}
                            className="bg-transparent border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded px-1.5 py-1 outline-none transition-colors text-slate-600"
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : activeTab === 'concept_art' ? (
          <div className="p-6 overflow-auto h-full">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="sticky top-0 bg-white z-10 border-b-2 border-slate-400 text-left">
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    <div className="flex items-center gap-2">
                      <span>Игра</span>
                      <div className="relative" ref={addArtProjectMenuRef}>
                        <button
                          onClick={() => setShowAddArtProjectMenu(!showAddArtProjectMenu)}
                          className="w-4 h-4 flex items-center justify-center rounded bg-indigo-100 text-indigo-600 hover:bg-indigo-200 transition-colors"
                          title="Добавить проект в таблицу"
                        >
                          <Plus size={10} strokeWidth={3} />
                        </button>
                        {showAddArtProjectMenu && (
                          <div className="absolute top-full mt-1 left-0 flex flex-col bg-slate-800 border border-slate-700 rounded-lg shadow-2xl z-[100] w-56 normal-case font-normal">
                            <div className="p-2 border-b border-slate-700">
                              <input
                                autoFocus
                                type="text"
                                value={artAddSearch}
                                onChange={(e) => setArtAddSearch(e.target.value)}
                                placeholder="Поиск игры..."
                                className="w-full bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-[10px] text-white placeholder:text-slate-500 outline-none focus:border-indigo-500"
                              />
                            </div>
                            <div className="max-h-64 overflow-y-auto p-1">
                              {(() => {
                                const addableProjects = projects
                                  .filter(p => !p.inArtLayout && !p.isPrototype && !p.isCollapsed && p.name.toLowerCase().includes(artAddSearch.toLowerCase()))
                                  .sort((a, b) => getProjectReleaseDate(a).getTime() - getProjectReleaseDate(b).getTime());
                                if (addableProjects.length === 0) {
                                  return <div className="px-2 py-3 text-[10px] text-slate-500 text-center">Ничего не найдено</div>;
                                }
                                return addableProjects.map(p => (
                                  <button
                                    key={p.id}
                                    onClick={() => updateEditorialField(p.id, { inArtLayout: true })}
                                    className="w-full text-[10px] px-2 py-1.5 hover:bg-white/10 rounded-md text-left transition-colors font-medium text-slate-200 truncate"
                                  >
                                    {p.name}
                                  </button>
                                ));
                              })()}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Вес</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Издатель</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Сегмент</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Импорт</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Арт-директор</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Статус</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Текущая задача</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Комментарий</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">В вёрстку</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Старт</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Составление ТЗ</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Поиск подрядчика</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Согласование стиля</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Отрисовка</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Финализация</th>
                </tr>
              </thead>
              <tbody>
                {sortedProjects.map(project => {
                  const artDirector = getStageResource(project, 'Арт Продакшн');
                  const artStartComputed = getStageStartDate(project, 'Арт Продакшн');
                  const toLayoutComputed = getStageStartDate(project, 'Дизайн и вёрстка');
                  const artStatusInfo = ART_STATUSES.find(s => s.value === project.artStatus);

                  return (
                    <tr key={project.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 group">
                          <span
                            className="font-bold text-indigo-600 cursor-pointer"
                            onClick={() => { setEditingProjectId(project.id); setModalMode('edit'); }}
                          >
                            {project.name}
                          </span>
                          <button
                            onClick={() => updateEditorialField(project.id, { inArtLayout: false })}
                            className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all flex-shrink-0"
                            title="Убрать из таблицы"
                          >
                            <X size={11} strokeWidth={2.5} />
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-slate-600">{project.isMhi ? '—' : project.weight}</td>
                      <td className="px-3 py-2">
                        <input
                          key={`publisher-${project.id}`}
                          type="text"
                          defaultValue={project.publisher || ''}
                          onBlur={(e) => updateEditorialField(project.id, { publisher: e.target.value })}
                          disabled={isReadOnly}
                          placeholder="—"
                          className="w-28 bg-transparent border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded px-1.5 py-1 outline-none transition-colors"
                        />
                      </td>
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{project.segment || '—'}</td>
                      <td className="px-3 py-2">
                        <input
                          key={`components-${project.id}`}
                          type="text"
                          defaultValue={project.componentsNote || ''}
                          onBlur={(e) => updateEditorialField(project.id, { componentsNote: e.target.value })}
                          disabled={isReadOnly}
                          placeholder="—"
                          className="w-28 bg-transparent border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded px-1.5 py-1 outline-none transition-colors"
                        />
                      </td>
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{artDirector?.name && artDirector.name !== 'Не назначен' ? artDirector.name : '—'}</td>
                      <td className="px-3 py-2">
                        <select
                          value={project.artStatus || ''}
                          onChange={(e) => {
                            const value = e.target.value || undefined;
                            updateEditorialField(project.id, {
                              artStatus: value,
                              artPausedAt: value === PAUSE_STATUS_VALUE ? format(new Date(), 'yyyy-MM-dd') : undefined,
                            });
                          }}
                          disabled={isReadOnly}
                          className={`text-[10px] font-bold uppercase tracking-tighter rounded-full px-2 py-1 outline-none border-none cursor-pointer ${artStatusInfo ? artStatusInfo.className : 'bg-slate-100 text-slate-400'}`}
                        >
                          <option value="">—</option>
                          {ART_STATUSES.map((s, i) => (
                            <React.Fragment key={s.value}>
                              {i === ART_STATUS_UPPER_GROUP_SIZE && <option disabled>──────────</option>}
                              {i === ART_STATUSES.length - 1 && <option disabled>──────────</option>}
                              <option value={s.value}>{s.value}</option>
                            </React.Fragment>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          key={`arttask-${project.id}`}
                          type="text"
                          defaultValue={project.artTaskNote || ''}
                          onBlur={(e) => updateEditorialField(project.id, { artTaskNote: e.target.value })}
                          disabled={isReadOnly}
                          placeholder="—"
                          className="w-40 bg-transparent border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded px-1.5 py-1 outline-none transition-colors"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          key={`artcomment-${project.id}`}
                          type="text"
                          defaultValue={project.artComment || ''}
                          onBlur={(e) => updateEditorialField(project.id, { artComment: e.target.value })}
                          disabled={isReadOnly}
                          placeholder="—"
                          className="w-40 bg-transparent border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded px-1.5 py-1 outline-none transition-colors"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <PlanDateInput
                          value={project.artToLayoutDate}
                          planDate={toLayoutComputed}
                          onChange={(v) => updateEditorialField(project.id, { artToLayoutDate: v })}
                          disabled={isReadOnly}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <PlanDateInput
                          value={project.artStartDate}
                          planDate={artStartComputed}
                          onChange={(v) => updateEditorialField(project.id, { artStartDate: v })}
                          disabled={isReadOnly}
                        />
                      </td>
                      {ART_STAGE_DISPLAY_ORDER.map(field => (
                        <td key={field} className="px-3 py-2">
                          <input
                            type="date"
                            value={project[field] || ''}
                            onChange={(e) => updateEditorialField(project.id, { [field]: e.target.value || undefined })}
                            disabled={isReadOnly}
                            className="bg-transparent border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded px-1.5 py-1 outline-none transition-colors text-slate-600"
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
        <div className="inline-flex min-w-full">
          {/* Static Columns */}
          {(isSidebarVisible || isProjectTab || activeTab === 'users') && (
            <div className="sticky left-0 z-40 flex bg-white border-r border-slate-200 shadow-xl shadow-slate-200/50">
              {isProjectTab && (
                <div className="w-52 flex-shrink-0 border-r border-slate-100">
                  <div className="h-20 sticky top-0 z-50 flex flex-col justify-end px-3 pb-3 bg-white border-b-2 border-slate-400">
                    <div className="flex items-center justify-between mb-2">
                      {isProjectFamilyTab ? (
                        <div className="relative" ref={projectTabsMenuRef}>
                          <button
                            onClick={() => setShowProjectTabsMenu(!showProjectTabsMenu)}
                            className="flex items-center gap-1 text-sm font-bold uppercase tracking-widest text-slate-400 hover:text-indigo-600 transition-colors"
                          >
                            {activeTab === 'projects' ? 'Все проекты' :
                             activeTab === 'mhi' ? 'МХИ' :
                             activeTab === 'no_mhi' ? 'Проекты без МХИ' :
                             activeTab === 'corps' ? 'Корпы' :
                             `Проекты ${activeTab.replace('projects_', '')}`}
                            <ChevronDown size={12} strokeWidth={3} />
                          </button>

                          {showProjectTabsMenu && (
                            <div className="absolute top-full mt-1 left-0 flex flex-col bg-slate-800 border border-slate-700 rounded-lg shadow-2xl p-1 z-[100] min-w-[140px]">
                              <button
                                onClick={() => { setActiveTab('projects'); setShowProjectTabsMenu(false); }}
                                className={`text-[9px] px-2 py-1.5 hover:bg-white/10 rounded-md text-left transition-colors font-bold uppercase tracking-tighter ${activeTab === 'projects' ? 'text-indigo-300 bg-white/5' : 'text-slate-300'}`}
                              >
                                Все проекты
                              </button>
                              <button
                                onClick={() => { setActiveTab('mhi'); setShowProjectTabsMenu(false); }}
                                className={`text-[9px] px-2 py-1.5 hover:bg-white/10 rounded-md text-left transition-colors font-bold uppercase tracking-tighter ${activeTab === 'mhi' ? 'text-indigo-300 bg-white/5' : 'text-slate-300'}`}
                              >
                                МХИ
                              </button>
                              <button
                                onClick={() => { setActiveTab('no_mhi'); setShowProjectTabsMenu(false); }}
                                className={`text-[9px] px-2 py-1.5 hover:bg-white/10 rounded-md text-left transition-colors font-bold uppercase tracking-tighter ${activeTab === 'no_mhi' ? 'text-indigo-300 bg-white/5' : 'text-slate-300'}`}
                              >
                                Проекты без МХИ
                              </button>
                              <button
                                onClick={() => { setActiveTab('corps'); setShowProjectTabsMenu(false); }}
                                className={`text-[9px] px-2 py-1.5 hover:bg-white/10 rounded-md text-left transition-colors font-bold uppercase tracking-tighter ${activeTab === 'corps' ? 'text-indigo-300 bg-white/5' : 'text-slate-300'}`}
                              >
                                Корпы
                              </button>
                              <div className="h-px bg-slate-700 my-1" />
                              {projectYears.map(yr => (
                                <button
                                  key={yr}
                                  onClick={() => { setActiveTab(`projects_${yr}`); setShowProjectTabsMenu(false); }}
                                  className={`text-[9px] px-2 py-1.5 hover:bg-white/10 rounded-md text-left transition-colors font-bold uppercase tracking-tighter ${activeTab === `projects_${yr}` ? 'text-indigo-300 bg-white/5' : 'text-slate-300'}`}
                                >
                                  Проекты {yr}
                                </button>
                              ))}
                              <div className="h-px bg-slate-700 my-1" />
                              <button
                                onClick={handleAddProjectYear}
                                className="text-[9px] px-2 py-1.5 hover:bg-white/10 rounded-md text-left transition-colors font-bold uppercase tracking-tighter text-emerald-400 flex items-center gap-1.5"
                              >
                                <Plus size={10} strokeWidth={3} />
                                Добавить год
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-sm font-bold uppercase tracking-widest text-slate-400">{activeTab === 'releases' ? 'Релизы' : 'Проект'}</div>
                      )}
                      {activeTab === 'releases' && (
                        <select 
                          value={releaseYearFilter}
                          onChange={(e) => setReleaseYearFilter(e.target.value)}
                          className="bg-slate-50 border border-slate-200 rounded-md py-0.5 px-1.5 text-[10px] font-bold outline-none focus:border-indigo-400 transition-colors cursor-pointer"
                        >
                          <option value="all">Все годы</option>
                          {availableYears.map(year => (
                            <option key={year} value={year}>{year}</option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div className="relative">
                      <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input 
                        type="text"
                        placeholder="Поиск..."
                        value={projectSearch}
                        onChange={(e) => setProjectSearch(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-md py-1 pl-7 pr-2 text-[10px] font-bold outline-none focus:border-indigo-400 focus:bg-white transition-all text-slate-600 placeholder:text-slate-300"
                      />
                    </div>
                  </div>
                  {sortedProjects.map((project, projectIndex) => {
                    const isReleasesTab = activeTab === 'releases';
                    const isCollapsed = !isReleasesTab && collapsedProjects[project.id];
                    const rowHeight = getProjectRowHeight(project, isReleasesTab);
                    
                    return (
                      <div 
                        key={project.id} 
                        style={{ height: rowHeight }}
                        className={`px-3 ${isReleasesTab ? 'py-1' : isCollapsed ? 'py-0 flex items-center justify-between' : 'py-3'} border-b-2 border-slate-400 group flex flex-col cursor-pointer transition-all duration-200 overflow-hidden ${
                          !isReleasesTab && project.resources.reduce((acc, r) => 
                            acc + r.tasks.filter(t => t.status === 'overdue').length, 0
                          ) > 8
                            ? 'bg-red-50 hover:bg-red-100 border-l-4 border-l-red-500'
                            : 'hover:bg-slate-50'
                        }`}
                        onClick={() => {
                          if (isReadOnly) return;
                          setEditingProjectId(project.id);
                          setModalMode('edit');
                        }}
                      >
                        {isCollapsed ? (
                          <div className="flex items-center gap-2 w-full h-full min-w-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleProjectCollapse(project.id, false);
                              }}
                              className="p-1 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-indigo-600 transition-all flex items-center justify-center flex-shrink-0"
                              title="Развернуть проект"
                            >
                              <ChevronDown size={14} strokeWidth={2.5} />
                            </button>
                            <span className="text-[10px] font-black text-slate-300 flex-shrink-0 w-4 text-right tabular-nums">{projectIndex + 1}</span>
                            <div className="flex flex-col min-w-0 flex-1 justify-center">
                              <span className="font-bold text-[12px] text-slate-800 truncate group-hover:text-indigo-600 transition-colors leading-tight">{project.name}</span>
                              {project.segment && (
                                <span className="text-[8px] font-black text-indigo-500 uppercase tracking-widest leading-none mt-0.5">{project.segment}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {project.trackerUrl && (
                                <a 
                                  href={project.trackerUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-indigo-600 transition-all"
                                  title="Открыть в трекере"
                                >
                                  <ExternalLink size={12} />
                                </a>
                              )}
                            </div>
                          </div>
                        ) : (
                          <>
                            {project.imageUrl && !isReleasesTab && (
                              <div className="flex-1 min-h-0 mb-2 relative">
                                <img 
                                  src={project.imageUrl} 
                                  alt={project.name}
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover rounded-xl shadow-sm border border-slate-100 group-hover:shadow-md transition-shadow" 
                                />
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleProjectCollapse(project.id, true);
                                  }}
                                  className="absolute top-2 left-2 p-1.5 rounded-lg bg-white/85 text-slate-700 hover:bg-white hover:text-indigo-600 shadow-sm border border-slate-200/50 opacity-0 group-hover:opacity-100 scale-100 transition-all flex items-center justify-center z-10"
                                  title="Свернуть проект"
                                >
                                  <ChevronUp size={12} strokeWidth={2.5} />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setLockedProjects(prev => ({
                                      ...prev,
                                      [project.id]: !prev[project.id]
                                    }));
                                  }}
                                  className={`absolute top-2 right-2 p-1.5 rounded-lg transition-all flex items-center justify-center ${
                                    lockedProjects[project.id] 
                                      ? 'bg-indigo-600 text-white shadow-md border border-indigo-500 scale-110 opacity-100 z-10' 
                                      : 'bg-white/85 text-slate-700 hover:bg-white hover:text-indigo-600 shadow-sm border border-slate-200/50 opacity-0 group-hover:opacity-100 scale-100 z-10'
                                  }`}
                                  title={lockedProjects[project.id] ? "Разгруппировать задачи" : "Группировать задачи (перемещать вместе)"}
                                >
                                  {lockedProjects[project.id] ? <Lock size={12} strokeWidth={2.5} /> : <Unlock size={12} strokeWidth={2.5} />}
                                </button>
                              </div>
                            )}
                      <div className="flex flex-col min-w-0 gap-1.5">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-start justify-between gap-1">
                              <div className="flex items-center gap-1.5 min-w-0">
                                {!project.imageUrl && !isReleasesTab && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleProjectCollapse(project.id, true);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-indigo-600 transition-all flex-shrink-0 flex items-center justify-center"
                                    title="Свернуть проект"
                                  >
                                    <ChevronUp size={12} strokeWidth={2.5} />
                                  </button>
                                )}
                                <span className="text-[10px] font-black text-slate-300 flex-shrink-0 tabular-nums">{projectIndex + 1}.</span>
                                <span className="font-bold text-[13px] text-slate-800 line-clamp-2 group-hover:text-indigo-600 transition-colors leading-tight">{project.name}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                {project.trackerUrl && (
                                  <a 
                                    href={project.trackerUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-indigo-600 transition-all"
                                    title="Открыть в трекере"
                                  >
                                    <ExternalLink size={12} />
                                  </a>
                                )}
                                {!project.imageUrl && <MoreVertical size={14} className="opacity-0 group-hover:opacity-100 text-slate-400 flex-shrink-0" />}
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 mb-1">
                              {!isReleasesTab && (
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] text-slate-500 font-medium whitespace-nowrap">Вес:</span>
                                  {project.isMhi ? (
                                    <span className="font-mono font-bold text-slate-400 text-[10px]">—</span>
                                  ) : (
                                    <>
                                      {!isReadOnly && (
                                        <div className="flex items-center gap-0.5 ml-0.5 mr-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                          <button
                                            onClick={(e) => { e.stopPropagation(); updateProjectWeight(project.id, -1); }}
                                            className="w-4 h-4 flex items-center justify-center bg-white border border-slate-200 rounded text-slate-400 hover:text-red-600 hover:border-red-200 transition-colors"
                                          >
                                            <Minus size={10} strokeWidth={3} />
                                          </button>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); updateProjectWeight(project.id, 1); }}
                                            className="w-4 h-4 flex items-center justify-center bg-white border border-slate-200 rounded text-slate-400 hover:text-green-600 hover:border-green-200 transition-colors"
                                          >
                                            <Plus size={10} strokeWidth={3} />
                                          </button>
                                        </div>
                                      )}
                                      <span className="font-mono font-bold text-slate-700 text-[10px]">{project.weight}</span>
                                    </>
                                  )}
                                </div>
                              )}
                              {project.segment && (
                                <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest leading-none">{project.segment}</span>
                              )}
                            </div>
                            {!isReleasesTab && (
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex flex-col gap-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                                    <span className="text-[10px] text-slate-500 font-medium whitespace-nowrap">Выход: <span className="font-bold text-indigo-600">
                                      {(() => {
                                        const latestTaskDate = getProjectReleaseDate(project);
                                        const months = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
                                        return latestTaskDate.getTime() > 0 ? `${latestTaskDate.getDate()} ${months[latestTaskDate.getMonth()]} ${latestTaskDate.getFullYear()}` : '—';
                                      })()}
                                    </span></span>
                                  </div>
                                  {(() => {
                                    const overdueCount = project.resources.reduce((acc, r) =>
                                      acc + r.tasks.filter(t => t.status === 'overdue').length, 0
                                    );
                                    const limit = getNumericWeight(project.weight) <= 3 ? 4 : 8;
                                    return (
                                      <div
                                        className={`text-[9px] font-black uppercase tracking-tighter py-0.5 px-2 rounded-full w-fit border transition-all ${
                                          overdueCount > limit
                                            ? 'bg-red-600 text-white border-red-700 shadow-sm'
                                            : 'bg-slate-50 text-slate-500 border-slate-100'
                                        }`}
                                      >
                                        Продлено: {overdueCount} из {limit}
                                      </div>
                                    );
                                  })()}
                                </div>
                                <TrackerLinkButton trackerUrl={project.trackerUrl} />
                              </div>
                            )}
                          </div>
                        </div>
                        </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {activeTab === 'users' && (
                <div className="w-64 flex-shrink-0 border-r border-slate-100">
                  <div className="h-20 sticky top-0 z-50 flex flex-col justify-end px-4 pb-3 bg-white border-b-2 border-slate-400">
                    <div className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-2">Профиль сотрудника</div>
                    <select 
                      className="w-full bg-slate-50 border border-slate-200 rounded-md py-1 px-2 text-[10px] font-bold outline-none focus:border-indigo-400 transition-colors"
                      value={userRoleFilter}
                      onChange={(e) => setUserRoleFilter(e.target.value)}
                    >
                      <option value="all">Категория: Все</option>
                      {Object.values(ROLES).map(role => (
                        <option key={role} value={role}>Роль: {role}</option>
                      ))}
                    </select>
                  </div>
                  {processedUsers.map(user => {
                    const isCollapsed = collapsedUsers[user.id];
                    const rowHeight = getUserRowHeight(user);
                    if (isCollapsed) {
                      return (
                        <div
                          key={user.id}
                          style={{ height: rowHeight }}
                          className="flex items-center gap-2 px-4 border-b-2 border-slate-400 hover:bg-slate-50 group cursor-pointer transition-colors"
                          onClick={() => {
                            setEditingUserId(user.id);
                            setModalMode('edit');
                          }}
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleUserCollapse(user.id, false);
                            }}
                            className="p-1 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-indigo-600 transition-all flex items-center justify-center flex-shrink-0"
                            title="Развернуть сотрудника"
                          >
                            <ChevronDown size={14} strokeWidth={2.5} />
                          </button>
                          <span className="text-xs font-bold text-slate-800 truncate group-hover:text-indigo-600">{user.name}</span>
                        </div>
                      );
                    }
                    return (
                      <div
                        key={user.id}
                        style={{ height: rowHeight }}
                        className="flex items-center px-4 border-b-2 border-slate-400 hover:bg-slate-50 group cursor-pointer transition-colors"
                        onClick={() => {
                          setEditingUserId(user.id);
                          setModalMode('edit');
                        }}
                      >
                        <img src={user.imageUrl} className="w-10 h-10 rounded-full border border-slate-200 mr-3" />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-slate-800 truncate group-hover:text-indigo-600">{user.name}</div>
                          <div className="text-[10px] text-slate-400 uppercase font-bold truncate tracking-tighter">
                            {user.roles.join(' • ')}
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleUserCollapse(user.id, true);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-indigo-600 transition-all flex-shrink-0 flex items-center justify-center"
                          title="Скрыть сотрудника"
                        >
                          <ChevronUp size={12} strokeWidth={2.5} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <AnimatePresence initial={false}>
                {(isSidebarVisible || activeTab === 'users') && (
                  <motion.div 
                    initial={{ width: 0, opacity: 0, overflow: 'hidden' }}
                    animate={{ width: 'auto', opacity: 1, transitionEnd: { overflow: 'visible' } }}
                    exit={{ width: 0, opacity: 0, overflow: 'hidden' }}
                    className="flex"
                  >
                    {activeTab === 'releases' ? (
                      <div className="w-64 flex-shrink-0">
                        <div className="h-20 sticky top-0 z-50 flex items-end px-4 pb-3 text-sm font-bold uppercase tracking-widest text-slate-400 bg-white border-b-2 border-slate-400">
                          Итоги по месяцам
                        </div>
                        <div className="bg-white p-4 space-y-4">
                          {(() => {
                            if (releaseYearFilter === 'all') return null;

                            // Filter projects for the selected year
                            const yearProjects = projects.filter(p => {
                              if (p.excludeFromReleases || p.isPrototype) return false;
                              const d = getProjectReleaseDate(p);
                              return d.getFullYear().toString() === releaseYearFilter;
                            });

                            const totalCount = yearProjects.length;

                            // Segment statistics
                            const segmentsMap: Record<string, number> = {};
                            yearProjects.forEach(p => {
                              const seg = p.segment ? p.segment.trim() : 'не указан';
                              segmentsMap[seg] = (segmentsMap[seg] || 0) + 1;
                            });

                            const getGameLabelRu = (count: number) => {
                              const lastDigit = count % 10;
                              const lastTwoDigits = count % 100;
                              if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return 'игр';
                              if (lastDigit === 1) return 'игра';
                              if (lastDigit >= 2 && lastDigit <= 4) return 'игры';
                              return 'игр';
                            };

                            const getSegmentLabelRu = (count: number, segmentName: string) => {
                              const clean = segmentName.toLowerCase().trim();
                              const lastDigit = count % 10;
                              const lastTwoDigits = count % 100;
                              const isTeens = lastTwoDigits >= 11 && lastTwoDigits <= 14;

                              if (clean === 'детская') {
                                if (isTeens) return `${count} детских игр`;
                                if (lastDigit === 1) return `${count} детская игра`;
                                if (lastDigit >= 2 && lastDigit <= 4) return `${count} детские игры`;
                                return `${count} детских игр`;
                              }
                              if (clean === 'семейная') {
                                if (isTeens) return `${count} семейных игр`;
                                if (lastDigit === 1) return `${count} семейная игра`;
                                if (lastDigit >= 2 && lastDigit <= 4) return `${count} семейные игры`;
                                return `${count} семейных игр`;
                              }
                              if (clean === 'экспертная') {
                                if (isTeens) return `${count} экспертных игр`;
                                if (lastDigit === 1) return `${count} экспертная игра`;
                                if (lastDigit >= 2 && lastDigit <= 4) return `${count} экспертные игры`;
                                return `${count} экспертных игр`;
                              }
                              if (clean === 'широкая') {
                                if (isTeens) return `${count} игр для широкой аудитории`;
                                if (lastDigit === 1) return `${count} игра для широкой аудитории`;
                                if (lastDigit >= 2 && lastDigit <= 4) return `${count} игры для широкой аудитории`;
                                return `${count} игр для широкой аудитории`;
                              }
                              if (clean === 'корп. заказ') {
                                if (isTeens) return `${count} корп. заказов`;
                                if (lastDigit === 1) return `${count} корп. заказ`;
                                if (lastDigit >= 2 && lastDigit <= 4) return `${count} корп. заказа`;
                                return `${count} корп. заказов`;
                              }

                              if (clean.endsWith('ая')) {
                                const stem = segmentName.slice(0, -2);
                                const lastChar = stem.slice(-1).toLowerCase();
                                const isGutturalOrSibilant = ['г', 'к', 'х', 'ж', 'ч', 'ш', 'щ', 'g', 'k', 'h'].includes(lastChar);
                                const pluralEnding = isGutturalOrSibilant ? 'ие' : 'ые';
                                const genitiveEnding = isGutturalOrSibilant ? 'их' : 'ых';

                                if (isTeens) return `${count} ${stem}${genitiveEnding} игр`;
                                if (lastDigit === 1) return `${count} ${segmentName} игра`;
                                if (lastDigit >= 2 && lastDigit <= 4) return `${count} ${stem}${pluralEnding} игры`;
                                return `${count} ${stem}${genitiveEnding} игр`;
                              }

                              const getGameLabel = (cnt: number) => {
                                if (isTeens) return 'игр';
                                if (lastDigit === 1) return 'игра';
                                if (lastDigit >= 2 && lastDigit <= 4) return 'игры';
                                return 'игр';
                              };
                              return `${count} ${getGameLabel(count)} класса "${segmentName}"`;
                            };

                            const segmentEntries = Object.entries(segmentsMap).sort((a, b) => b[1] - a[1]);

                            return (
                              <div className="bg-indigo-50/65 border border-indigo-100 rounded-xl p-3 space-y-2 mb-4">
                                <div className="text-[10px] font-black tracking-widest text-[#4f46e5] uppercase flex items-center gap-1.5 leading-none">
                                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse"></div>
                                  Итоги за {releaseYearFilter} год
                                </div>
                                <div className="text-xs font-bold text-slate-800 leading-tight">
                                  Всего выпущено {totalCount} {getGameLabelRu(totalCount)}:
                                </div>
                                {segmentEntries.length > 0 ? (
                                  <ul className="text-[11px] text-slate-600 space-y-1 pl-1 list-none font-medium">
                                    {segmentEntries.map(([segmentName, count]) => (
                                      <li key={segmentName} className="flex items-start gap-1">
                                        <span className="text-indigo-400 mt-[2px] font-black">•</span>
                                        <span>
                                          {getSegmentLabelRu(count, segmentName)}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <div className="text-[10px] text-slate-400 italic">Нет разделения по сегментам</div>
                                )}
                              </div>
                            );
                          })()}

                          {releaseYearFilter !== 'all' && (
                            <div className="border-t border-slate-100 my-2"></div>
                          )}

                          {(() => {
                            const stats: Record<string, number> = {};
                            sortedProjects.forEach(project => {
                              if (project.excludeFromReleases) return;
                              const date = getProjectReleaseDate(project);
                              if (date.getTime() > 0) {
                                const key = `${date.getFullYear()}-${date.getMonth()}`;
                                stats[key] = (stats[key] || 0) + 1;
                              }
                            });

                            const sortedKeys = Object.keys(stats).sort((a, b) => {
                              const [yearA, monthA] = a.split('-').map(Number);
                              const [yearB, monthB] = b.split('-').map(Number);
                              return yearA !== yearB ? yearA - yearB : monthA - monthB;
                            });

                            if (sortedKeys.length === 0) {
                              return <div className="text-xs text-slate-400 italic">Нет запланированных релизов</div>;
                            }

                            const monthNamesRu = [
                              'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
                              'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
                            ];

                            const getGameLabelRu = (count: number) => {
                              const lastDigit = count % 10;
                              const lastTwoDigits = count % 100;
                              if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return 'игр';
                              if (lastDigit === 1) return 'игра';
                              if (lastDigit >= 2 && lastDigit <= 4) return 'игры';
                              return 'игр';
                            };

                            const getCountWordRu = (count: number) => {
                              const words = ['ноль', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять', 'десять'];
                              return words[count] || count.toString();
                            };

                            return sortedKeys.map(key => {
                              const [year, month] = key.split('-').map(Number);
                              const count = stats[key];
                              return (
                                <div key={key} className="flex flex-col gap-1 group pb-3 border-b border-slate-50 last:border-0">
                                  <div className="flex justify-between items-center">
                                    <span className="text-[11px] font-black uppercase tracking-tight text-slate-400">
                                      {monthNamesRu[month]} {releaseYearFilter === 'all' ? year : ''}
                                    </span>
                                    <span className="text-[10px] font-bold text-indigo-600 px-2 py-0.5 bg-indigo-50 rounded-full">
                                      {count}
                                    </span>
                                  </div>
                                  <div className="text-xs font-medium text-slate-600">
                                    {getCountWordRu(count)} {getGameLabelRu(count)}
                                  </div>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    ) : isProjectTab ? (
                      <div className="w-64 flex-shrink-0">
                        <div className="h-20 sticky top-0 z-50 flex flex-col justify-end px-4 pb-3 bg-white border-b-2 border-slate-400">
                          <div className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-2">Команда</div>
                          <div className="relative">
                            <Users size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                              type="text"
                              placeholder="Поиск по команде..."
                              value={teamSearch}
                              onChange={(e) => setTeamSearch(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-md py-1 pl-7 pr-2 text-[10px] font-bold outline-none focus:border-indigo-400 focus:bg-white transition-all text-slate-600 placeholder:text-slate-300"
                            />
                          </div>
                        </div>
                        {sortedProjects.map((project, pIdx) => {
                          const isCollapsed = collapsedProjects[project.id];
                          const rowHeight = getProjectRowHeight(project, false);
                          
                          const projectOverdueCount = project.resources.reduce((acc, r) => 
                            acc + r.tasks.filter(t => t.status === 'overdue').length, 0
                          );
                          const limit = getNumericWeight(project.weight) <= 3 ? 4 : 8;
                          const isOverLimit = projectOverdueCount > limit;
                          
                          return (
                            <div 
                              key={project.id} 
                              style={{ height: rowHeight }}
                              className={`border-b-2 border-slate-400 relative ${isCollapsed ? 'overflow-hidden' : 'overflow-visible'} ${reassigning?.projectId === project.id ? 'z-30' : 'z-10'} ${isOverLimit ? 'bg-red-50/20' : ''}`}
                            >
                              {isCollapsed ? (
                                <div className="h-full flex items-center px-4 text-[10px] text-slate-400 font-medium italic select-none">
                                  Проект завершен
                                </div>
                              ) : project.resources.map((resource, rIdx) => {
                                const isNearBottom = pIdx >= sortedProjects.length - 1 || (pIdx >= sortedProjects.length - 2 && rIdx >= project.resources.length - 3);
                                
                                return (
                                  <div 
                                    key={resource.id} 
                                    className={`h-12 flex items-center px-4 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors group relative ${resource.isSpecialRow ? 'bg-indigo-50/20' : ''} ${isOverLimit ? 'hover:bg-red-50/50' : ''}`}
                                  >
                                    <div className="flex-1 min-w-0 mr-4">
                                      <div className={`text-[10px] font-bold uppercase tracking-tighter truncate ${resource.isSpecialRow ? 'text-indigo-600 font-black' : 'text-slate-400'}`}>
                                        {resource.role}
                                      </div>
                                      <div className="text-xs font-medium text-slate-600 flex items-center gap-1.5 min-w-0">
                                        <span className="truncate">{resource.name}</span>
                                        {resource.name && resource.name !== 'Не назначен' && !resource.isSpecialRow && !isReadOnly && (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleQuickAssign(project.id, resource.id, 'Не назначен');
                                            }}
                                            className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-50 hover:text-red-600 text-slate-400 rounded transition-all focus:opacity-100 flex-shrink-0"
                                            title="Убрать сотрудника с проекта"
                                          >
                                            <X size={10} />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                    
                                    {!resource.isSpecialRow && !isReadOnly && (
                                      <div className="relative">
                                        <button 
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setReassigning(prev => 
                                              prev?.resourceId === resource.id ? null : { projectId: project.id, resourceId: resource.id, role: resource.role }
                                            );
                                          }}
                                          className={`p-2 rounded-lg transition-all ${reassigning?.resourceId === resource.id ? 'bg-indigo-100 text-indigo-600' : 'text-slate-300 hover:text-indigo-600 hover:bg-indigo-50'}`}
                                        >
                                          <Users size={14} className="flex-shrink-0" />
                                        </button>
    
                                        {reassigning?.resourceId === resource.id && (
                                          <div 
                                            className={`absolute right-0 ${isNearBottom ? 'bottom-full mb-2' : 'top-full mt-2'} z-[60] bg-white border border-slate-200 shadow-2xl rounded-xl p-3 min-w-[240px]`}
                                            onClick={e => e.stopPropagation()}
                                          >
                                            <div className="text-[10px] font-bold text-indigo-600 uppercase mb-3 tracking-wider">Исполнитель для: {resource.role}</div>
                                            <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
                                              <button 
                                                onClick={() => {
                                                  handleQuickAssign(project.id, resource.id, 'Не назначен');
                                                  setReassigning(null);
                                                }}
                                                className="w-full text-left px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50 rounded-lg transition-colors border border-dashed border-slate-200 hover:border-slate-300 mb-2"
                                              >
                                                Снять назначение
                                              </button>
                                              {getFilteredUsers(resource.role).map(u => {
                                                const isBusy = getUserConflict(u.name, project.id, resource.id);
                                                return (
                                                  <button 
                                                    key={u.id}
                                                    onClick={() => {
                                                      handleQuickAssign(project.id, resource.id, u.name);
                                                      setReassigning(null);
                                                    }}
                                                    className={`w-full flex items-center gap-3 p-2 text-left rounded-lg group/item transition-all ${
                                                      isBusy ? 'hover:bg-red-50 bg-red-50/10' : 'hover:bg-indigo-50'
                                                    }`}
                                                  >
                                                    <img src={u.imageUrl} className={`w-8 h-8 rounded-full border ${isBusy ? 'border-red-200' : 'border-slate-100'}`} />
                                                    <div className="flex-1 min-w-0">
                                                      <div className={`text-xs font-bold truncate ${
                                                        isBusy ? 'text-red-700 group-hover/item:text-red-800' : 'text-slate-700 group-hover/item:text-indigo-700'
                                                      }`}>
                                                        {u.name}
                                                        {isBusy && <span className="ml-1 text-[8px] px-1 bg-red-100 text-red-600 rounded-sm">BUSY</span>}
                                                      </div>
                                                      <div className="text-[9px] text-slate-400 truncate">{u.roles.join(', ')}</div>
                                                    </div>
                                                  </button>
                                                );
                                              })}
                                              {getFilteredUsers(resource.role).length === 0 && (
                                                <div className="py-4 text-center text-xs text-slate-400 italic font-medium">
                                                  Нет сотрудников с этой ролью
                                                </div>
                                              )}
                                            </div>
                                            <button 
                                              onClick={() => setReassigning(null)}
                                              className="w-full mt-3 pt-3 border-t border-slate-100 text-[10px] text-slate-400 hover:text-slate-600 font-bold uppercase tracking-widest transition-colors"
                                            >
                                              Отмена
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <AnimatePresence>
                        {isSidebarVisible && (
                          <motion.div 
                            initial={{ width: 0, opacity: 0, overflow: 'hidden' }}
                            animate={{ width: 192, opacity: 1, transitionEnd: { overflow: 'visible' } }}
                            exit={{ width: 0, opacity: 0, overflow: 'hidden' }}
                            className="w-48 flex-shrink-0 border-r border-slate-100 bg-slate-50/30"
                          >
                            <div className="h-20 sticky top-0 z-50 flex flex-col justify-end px-4 pb-3 bg-white border-b-2 border-slate-400 min-w-[192px]">
                              <div className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-2">Отпуска</div>
                              <div className="text-[10px] text-slate-300 font-bold uppercase tracking-wider">График отсутствия</div>
                            </div>
                            <div className="min-w-[192px]">
                              {processedUsers.map(user => {
                                const isCollapsed = collapsedUsers[user.id];
                                const rowHeight = getUserRowHeight(user);
                                return (
                                  <div
                                    key={`vacation-side-${user.id}`}
                                    style={{ height: rowHeight }}
                                    className="flex flex-col justify-center px-4 border-b-2 border-slate-400 hover:bg-slate-100/50 transition-colors group cursor-pointer"
                                    onClick={() => {
                                      setEditingUserId(user.id);
                                      setModalMode('edit');
                                    }}
                                  >
                                    {isCollapsed ? null : (() => {
                                      const personalVacations = (user.vacations || []).filter(v => !v.isHoliday && !v.id.startsWith('ru-holiday'));
                                      return personalVacations.length > 0 ? (
                                        <div className="space-y-1">
                                          {personalVacations.slice(0, 2).map((v) => (
                                            <div key={v.id} className="text-[9px] font-bold text-slate-600 flex items-center gap-1">
                                              <div className="w-1 h-1 rounded-full bg-rose-400" />
                                              {format(new Date(v.startDate), 'd MMM', { locale: ru })} - {format(new Date(v.endDate), 'd MMM', { locale: ru })}
                                            </div>
                                          ))}
                                          {personalVacations.length > 2 && (
                                            <div className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">
                                              + еще {personalVacations.length - 2}
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        <button className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-indigo-600 transition-colors">
                                          <Plus size={12} strokeWidth={3} />
                                          <span>Добавить</span>
                                        </button>
                                      );
                                    })()}
                                  </div>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Gantt Timeline */}
          <div className="relative flex-1">
            {/* Timeline Header */}
            <div className="sticky top-0 z-30 bg-white border-b-2 border-slate-400 h-20">
              {/* Months */}
              <div className={zoomLevel === 'month' ? 'flex h-20' : 'flex h-10'}>
                {months.map((month, idx) => (
                  <div
                    key={idx}
                    style={{ width: (month.daysInTimeline / 7) * cellWidth }}
                    className="flex-shrink-0 border-r border-slate-400 bg-white overflow-x-clip"
                  >
                    {/* Sticky within its own month band: at Day zoom a month can
                        be 1000px+ wide, so a plain centered label often lands
                        under the sidebar or scrolls out of view entirely. */}
                    <div
                      className={`sticky w-fit h-10 flex flex-col items-center justify-center leading-tight font-bold uppercase tracking-widest text-slate-500 pl-3 ${
                        zoomLevel === 'month' ? 'h-20 text-[13px]' : 'text-[11px]'
                      }`}
                      style={{ left: 464 }}
                    >
                      <span>{month.monthName}</span>
                      <span>{month.year}</span>
                    </div>
                  </div>
                ))}
              </div>
              {/* Weeks (collapsed to plain gridlines at the Month zoom level, since
                  per-week labels have no room once cellWidth shrinks that far) */}
              {zoomLevel === 'week' && (
                <div className="flex h-10 border-t border-slate-100 overflow-hidden">
                  {weeks.map((weekStart, idx) => {
                    const endOfWeekDate = addDays(weekStart, 6);
                    const isCurrentWeek = new Date() >= weekStart && new Date() < addDays(weekStart, 7);
                    const isEndOfMonth = idx < weeks.length - 1 && weeks[idx + 1].getMonth() !== weekStart.getMonth();

                    return (
                      <div
                        key={idx}
                        style={{ width: cellWidth }}
                        className={`flex-shrink-0 border-r overflow-hidden flex flex-col items-center justify-center transition-colors ${
                          isEndOfMonth ? 'border-r-slate-400' : 'border-slate-100'
                        } ${isCurrentWeek ? 'bg-indigo-50' : 'bg-white'}`}
                      >
                        <span className={`text-[10px] font-bold ${isCurrentWeek ? 'text-indigo-700' : 'text-slate-700'}`}>
                          {format(weekStart, 'd')}—{format(endOfWeekDate, 'd')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              {/* Days (only rendered at the Day zoom level) */}
              {zoomLevel === 'day' && (
                <div className="flex h-10 border-t border-slate-100 overflow-hidden">
                  {days.map((day, idx) => {
                    const isToday = isSameDay(day, new Date());
                    const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                    const isEndOfMonth = idx < days.length - 1 && days[idx + 1].getMonth() !== day.getMonth();

                    return (
                      <div
                        key={idx}
                        style={{ width: cellWidth / 7 }}
                        className={`flex-shrink-0 border-r overflow-hidden flex flex-col items-center justify-center transition-colors ${
                          isEndOfMonth ? 'border-r-slate-400' : 'border-slate-100'
                        } ${isToday ? 'bg-indigo-50' : isWeekend ? 'bg-slate-200' : 'bg-white'}`}
                      >
                        <span className={`text-[9px] font-medium uppercase ${isToday ? 'text-indigo-600' : 'text-slate-400'}`}>
                          {format(day, 'EEE', { locale: ru })}
                        </span>
                        <span className={`text-[10px] font-bold ${isToday ? 'text-indigo-700' : 'text-slate-700'}`}>
                          {format(day, 'd')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Grid Body */}
            <div className="relative">
              {/* Grid Lines Overlay */}
              <div className="absolute inset-0 z-0 pointer-events-none flex">
                {zoomLevel === 'day' ? (
                  days.map((day, idx) => {
                    const isToday = isSameDay(day, new Date());
                    const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                    const isEndOfMonth = idx < days.length - 1 && days[idx + 1].getMonth() !== day.getMonth();

                    return (
                      <div
                        key={idx}
                        style={{ width: cellWidth / 7 }}
                        className={`flex-shrink-0 border-r h-full ${
                          isEndOfMonth ? 'border-r-slate-400' : 'border-slate-100'
                        } ${isToday ? 'bg-indigo-50/30' : isWeekend ? 'bg-slate-200/50' : ''}`}
                      />
                    );
                  })
                ) : (
                  weeks.map((weekStart, idx) => {
                    const isCurrentWeek = new Date() >= weekStart && new Date() < addDays(weekStart, 7);
                    const isEndOfMonth = idx < weeks.length - 1 && weeks[idx + 1].getMonth() !== weekStart.getMonth();

                    return (
                      <div
                        key={idx}
                        style={{ width: cellWidth }}
                        className={`flex-shrink-0 border-r h-full ${
                          isEndOfMonth ? 'border-r-slate-400' : (zoomLevel === 'month' ? 'border-transparent' : 'border-slate-100')
                        } ${isCurrentWeek ? 'bg-indigo-50/30' : ''}`}
                      />
                    );
                  })
                )}
              </div>

              {/* Rows */}
              <motion.div layout className="relative z-10">
                {activeTab === 'releases' ? (
                  sortedProjects.map(project => {
                    const releaseTask = getProjectReleaseTask(project);
                    const isStartSales = releaseTask?.label.toUpperCase() === 'СТАРТ ПРОДАЖ';
                    
                    const resourceWithRelease = project.resources.find(r => r.tasks.some(t => t.id === releaseTask?.id));

                    return (
                      <motion.div 
                        layout 
                        key={project.id} 
                        style={{ height: ROW_HEIGHT + 2 }}
                        className="border-b-2 border-slate-400 relative hover:bg-slate-50 transition-colors"
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      >
                        {releaseTask && (
                          <TaskBlock 
                            key={releaseTask.id} 
                            task={{ 
                              ...releaseTask, 
                              label: isStartSales ? project.name : `${project.name}: ${releaseTask.label}`,
                              segment: project.segment
                            }}
                            timelineStart={timelineStart}
                            cellWidth={cellWidth}
                            zoomLevel={zoomLevel}
                            isReadOnly={isReadOnly}
                            onUpdate={(updates) => {
                              if (resourceWithRelease) {
                                updateTask(project.id, resourceWithRelease.id, releaseTask.id, updates, true);
                              }
                            }}
                            onDelete={() => {
                              if (resourceWithRelease) {
                                deleteTask(project.id, resourceWithRelease.id, releaseTask.id);
                              }
                            }}
                          />
                        )}
                      </motion.div>
                    );
                  })
                ) : isProjectTab ? (
                  sortedProjects.map(project => {
                    const isCollapsed = collapsedProjects[project.id];
                    const rowHeight = getProjectRowHeight(project, false);

                    const projectOverdueCount = project.resources.reduce((acc, r) => 
                      acc + r.tasks.filter(t => t.status === 'overdue').length, 0
                    );
                    const limit = getNumericWeight(project.weight) <= 3 ? 4 : 8;
                    const isOverLimit = projectOverdueCount > limit;

                    return (
                      <motion.div 
                        layout 
                        key={project.id} 
                        style={{ height: rowHeight }}
                        className={`border-b-2 border-slate-400 overflow-hidden ${isOverLimit ? 'bg-red-50/10' : ''}`}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      >
                        {isCollapsed ? (
                          <div className="h-full flex items-center px-4 text-[10px] text-slate-400 font-semibold uppercase tracking-wider select-none bg-slate-50/50" />
                        ) : (
                          project.resources.map(resource => (
                          <div 
                            key={resource.id} 
                            className={`h-12 border-b border-slate-50 last:border-0 relative hover:bg-slate-100/50 transition-colors group ${resource.isSpecialRow ? 'bg-indigo-50/5' : ''} ${isOverLimit ? 'hover:bg-red-50/30' : ''}`}
                            onDoubleClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const x = e.clientX - rect.left;
                            if (!isReadOnly) {
                              if (zoomLevel === 'day') {
                                const dayIndex = Math.floor(x / (cellWidth / 7));
                                addTask(project.id, resource.id, addDays(timelineStart, dayIndex));
                              } else {
                                const weekIndex = Math.floor(x / cellWidth);
                                addTask(project.id, resource.id, addWeeks(timelineStart, weekIndex));
                              }
                            }
                          }}
                        >
                          {resource.tasks.map(task => (
                            <TaskBlock
                              key={task.id}
                              task={task}
                              timelineStart={timelineStart}
                              cellWidth={cellWidth}
                              zoomLevel={zoomLevel}
                              isFocused={reviewIndex !== null && reviewTasks[reviewIndex]?.task.id === task.id}
                              isReadOnly={isReadOnly}
                              onUpdate={(updates) => updateTask(project.id, resource.id, task.id, updates)}
                              onDelete={() => deleteTask(project.id, resource.id, task.id)}
                              projectWeight={project.weight}
                              role={resource.role}
                              dimmed={resource.role === 'Редактирование' || resource.role === 'Дизайн и вёрстка' || resource.role === 'Девелопмент' || resource.role === 'Арт Продакшн'}
                            />
                          ))}
                          {(() => {
                            // "Факт" overlay: a synthetic, read-only bar (not a stored Task)
                            // showing real progress against the "план" bars above, per the
                            // editorial-table's Старт / Старт вёрстки / В печать fields (and
                            // the "Девелопмент"/"Концептирование и арт-продакшн" tabs' own
                            // Старт / В редактуру / В вёрстку fields) — see CLAUDE.md for the
                            // field meanings.
                            const factStartRaw = resource.role === 'Редактирование' ? project.editStartDate
                              : resource.role === 'Дизайн и вёрстка' ? project.layoutStartDate
                              : resource.role === 'Девелопмент' ? project.devStartDate
                              : resource.role === 'Арт Продакшн' ? project.artStartDate
                              : null;
                            if (!factStartRaw) return null;
                            const factStart = new Date(factStartRaw);
                            const factEndRaw = resource.role === 'Девелопмент'
                              ? (project.devToEditorialDate ? new Date(project.devToEditorialDate)
                                : project.devStatus === PAUSE_STATUS_VALUE && project.devPausedAt ? new Date(project.devPausedAt)
                                : new Date())
                              : resource.role === 'Арт Продакшн'
                              ? (project.artToLayoutDate ? new Date(project.artToLayoutDate)
                                : project.artStatus === PAUSE_STATUS_VALUE && project.artPausedAt ? new Date(project.artPausedAt)
                                : new Date())
                              : (project.printReadyDate ? new Date(project.printReadyDate)
                                : project.editorialStatus === PAUSE_STATUS_VALUE && project.editorialPausedAt ? new Date(project.editorialPausedAt)
                                : new Date());
                            const factEnd = factEndRaw < factStart ? factStart : factEndRaw;
                            const factLeft = (differenceInDays(factStart, timelineStart) / 7) * cellWidth;
                            const factWidth = Math.max((differenceInDays(factEnd, factStart) / 7) * cellWidth, 6);
                            if (factLeft + factWidth < 0 || factLeft > weeks.length * cellWidth) return null;
                            const factColor = resource.role === 'Редактирование' ? 'bg-sky-600 border-sky-700'
                              : resource.role === 'Дизайн и вёрстка' ? 'bg-emerald-600 border-emerald-700'
                              : resource.role === 'Девелопмент' ? 'bg-purple-600 border-purple-700'
                              : 'bg-rose-600 border-rose-700';
                            const factLabel = resource.role === 'Девелопмент'
                              ? getDevFactLabel(project)
                              : resource.role === 'Арт Продакшн'
                              ? getArtFactLabel(project)
                              : getEditorialFactLabel(project, resource.role as 'Редактирование' | 'Дизайн и вёрстка');
                            return (
                              <div
                                className={`absolute rounded border ${factColor} pointer-events-none z-10 flex items-center px-1.5 text-[9px] font-black text-white uppercase tracking-tighter truncate`}
                                style={{ left: factLeft, width: factWidth, top: 26, height: 18 }}
                                title={`Факт: ${factLabel} (${format(factStart, 'dd.MM.yyyy')} — ${format(factEnd, 'dd.MM.yyyy')})`}
                              >
                                {factLabel}
                              </div>
                            );
                          })()}
                        </div>
                      ))
                    )}
                    </motion.div>
                  );
                })
              ) : (
                processedUsers.map(user => {
                    const isCollapsed = collapsedUsers[user.id];
                    const lanesInfo = userTasksWithLanes[user.name];
                    const tasksForUser = isCollapsed ? [] : (lanesInfo?.tasks || []);
                    const rowHeight = getUserRowHeight(user);
                    return (
                      <motion.div
                        layout
                        key={user.id}
                        style={{ height: rowHeight }}
                        className="border-b-2 border-slate-400 relative group/row hover:bg-slate-50/50 transition-colors overflow-hidden"
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      >
                        {tasksForUser.map(({ project, task, projectId, resourceId, lane, projectWeight, role }) => (
                          <TaskBlock 
                            key={task.id}
                            task={{ ...task, label: `${project}: ${task.label}` }}
                            timelineStart={timelineStart}
                            cellWidth={cellWidth}
                            zoomLevel={zoomLevel}
                            lane={lane}
                            isFocused={reviewIndex !== null && reviewTasks[reviewIndex]?.task.id === task.id}
                            isReadOnly={isReadOnly}
                            onUpdate={(updates) => updateTask(projectId, resourceId, task.id, updates)}
                            onDelete={() => deleteTask(projectId, resourceId, task.id)}
                            projectWeight={projectWeight}
                            role={role}
                          />
                        ))}
                        {!isCollapsed && user.vacations?.map(vacation => {
                          const start = new Date(vacation.startDate);
                          const end = new Date(vacation.endDate);
                          const duration = differenceInDays(end, start);
                          const leftPos = (differenceInDays(start, timelineStart) / 7) * cellWidth;
                          const width = (duration / 7) * cellWidth;

                          if (leftPos + width < 0 || leftPos > weeks.length * cellWidth) return null;

                          const isHoliday = vacation.isHoliday || vacation.id.startsWith('ru-holiday');
                          const stripesColor = isHoliday ? 'rgba(99, 102, 241, 0.2)' : 'rgba(239, 68, 68, 0.25)';
                          const borderColor = isHoliday ? 'border-indigo-500/30' : 'border-red-500/30';
                          const textColor = isHoliday ? 'text-indigo-600' : 'text-red-600';
                          const bgColor = isHoliday ? 'bg-indigo-500/10' : 'bg-red-500/10';
                          const labelText = isHoliday ? `🇷🇺 ${vacation.holidayName || 'ГОС. ПРАЗДНИК'}` : 'ОТПУСК';

                          return (
                            <div 
                              key={vacation.id}
                              className={`absolute top-0 bottom-0 pointer-events-none z-20 border-x ${borderColor}`}
                              style={{ 
                                left: leftPos,
                                width: width,
                                backgroundImage: `repeating-linear-gradient(45deg, ${stripesColor}, ${stripesColor} 10px, rgba(255, 255, 255, 0.3) 10px, rgba(255, 255, 255, 0.3) 20px)`,
                              }}
                              title={isHoliday ? vacation.holidayName : 'Отпуск'}
                            >
                              <div className={`absolute top-0 left-0 right-0 ${bgColor} py-0.5 px-2 flex justify-between items-center overflow-hidden`}>
                                <span className={`text-[7px] font-black uppercase tracking-tighter truncate ${textColor}`}>
                                  {labelText}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </motion.div>
                    );
                  })
                )}
              </motion.div>

              {/* Today Mark */}
              {differenceInDays(new Date(), timelineStart) >= 0 && differenceInDays(new Date(), timelineStart) < weeks.length * 7 && (
                <div 
                  className="absolute top-0 bottom-0 w-px bg-red-500 z-30 pointer-events-none"
                  style={{ 
                    left: (differenceInDays(new Date(), timelineStart) / 7) * cellWidth,
                    boxShadow: '0 0 8px rgba(239, 68, 68, 0.5)'
                  }}
                />
              )}
            </div>
          </div>
        </div>
        )}
      </div>

      {/* Footer Info */}
      <footer className="px-6 py-2 bg-white border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 font-medium">
        <div className="flex items-center gap-4">
          <div className="bg-slate-100 p-0.5 rounded-lg flex shadow-inner">
            <button
              onClick={() => setActiveTab('projects')}
              className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-tighter transition-all ${isProjectFamilyTab ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Проекты
            </button>
            <button
              onClick={() => setActiveTab('prototypes')}
              className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-tighter transition-all ${activeTab === 'prototypes' ? 'bg-white shadow-sm text-amber-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Прототипы
            </button>
            <button
              onClick={() => setActiveTab('releases')}
              className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-tighter transition-all ${activeTab === 'releases' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Релизы
            </button>
            <button 
              onClick={() => setActiveTab('users')}
              className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-tighter transition-all ${activeTab === 'users' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Сотрудники
            </button>
          </div>
          <div className="flex items-center gap-2 pr-2 border-l border-slate-200 pl-4">
            <div className="bg-slate-100 p-0.5 rounded-lg flex shadow-inner">
              <button
                onClick={() => setActiveTab('concept_art')}
                className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-tighter transition-all ${activeTab === 'concept_art' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
              >
                Арт-продакшн
              </button>
              <button
                onClick={() => setActiveTab('devel')}
                className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-tighter transition-all ${activeTab === 'devel' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
              >
                Девелопмент
              </button>
              <button
                onClick={() => setActiveTab('edit_layout')}
                className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-tighter transition-all ${activeTab === 'edit_layout' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
              >
                Редактура и вёрстка
              </button>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="opacity-50">v1.2.0-beta</span>
        </div>
      </footer>

      {/* Review Mode Navigation */}
      <AnimatePresence>
        {reviewIndex !== null && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-4 bg-slate-900/90 backdrop-blur-md px-6 py-4 rounded-2xl border border-slate-700 shadow-2xl"
          >
            <div className="flex flex-col">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Проверка незавершенных задач</div>
              <div className="text-sm font-bold text-white flex items-center gap-2">
                <span className="text-indigo-400">#{reviewIndex + 1}</span>
                <span className="truncate max-w-[200px]">{reviewTasks[reviewIndex].task.label}</span>
                <span className="text-[10px] text-slate-500 font-medium">({reviewTasks[reviewIndex].project.name})</span>
              </div>
            </div>

            <div className="flex items-center gap-2 ml-4 pl-4 border-l border-slate-700">
              <div className="text-xs text-slate-400 font-bold mr-2">
                {reviewIndex + 1} / {reviewTasks.length}
              </div>
              <button 
                onClick={() => navigateReview(false)}
                disabled={reviewIndex === 0}
                className="bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-white p-3 rounded-xl transition-all group"
              >
                <ChevronLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
              </button>
              <button 
                onClick={() => navigateReview(true)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white p-3 rounded-xl transition-all shadow-lg shadow-indigo-900 group"
              >
                <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </button>
              <button 
                onClick={() => {
                  setReviewIndex(null);
                  setReviewTasks([]);
                }}
                className="p-3 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all"
              >
                <X size={20} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      <AnimatePresence>
        {modalMode && isProjectTab && (
          <ProjectModal 
            isOpen={!!modalMode} 
            initialData={modalMode === 'edit' ? activeEditingProject : undefined}
            users={users}
            projects={projects}
            onClose={() => {
              setModalMode(null);
              setEditingProjectId(null);
            }}
            onSave={saveProject}
            onDelete={deleteProject}
          />
        )}
        {modalMode && activeTab === 'users' && (
          <UserModal
            isOpen={!!modalMode}
            initialData={modalMode === 'edit' ? activeEditingUser : undefined}
            onClose={() => {
              setModalMode(null);
              setEditingUserId(null);
            }}
            onSave={saveUser}
            onDelete={deleteUser}
          />
        )}
        {delayConfirmation && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[2px]">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 border border-slate-100 overflow-hidden relative"
            >
              <div className="absolute top-0 left-0 w-full h-1.5 bg-amber-500" />
              
              <div className="flex items-center gap-4 mb-5">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600 shadow-inner">
                  <AlertCircle size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-800 tracking-tight">Задача просрочена</h3>
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Возможна задержка очереди</p>
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-4 mb-6 border border-slate-100">
                <div className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-2">Индикатор новой задержки</div>
                <div className="flex items-center gap-3">
                  <div className={`w-4 h-4 rounded-md bg-stripe-${delayConfirmation.delayTask.color} border border-slate-400`} />
                  <div className="text-sm font-bold text-slate-700 truncate">{delayConfirmation.delayTask.label}</div>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-2 font-bold bg-white w-fit px-2 py-0.5 rounded-full border border-slate-100">
                  <Calendar size={10} />
                  Старт: {format(delayConfirmation.delayTask.startDate, 'd MMM', { locale: ru })} (длительность 7 дней)
                </div>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => handleConfirmDelay(true)}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-indigo-100 transition-all flex items-center justify-center gap-3 active:scale-95"
                >
                  <ArrowRight size={18} />
                  <span>Сдвинуть очередь (+1 неделя)</span>
                </button>
                
                <button
                  onClick={() => handleConfirmDelay(false)}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3.5 px-4 rounded-xl transition-all active:scale-95 text-sm"
                >
                  Добавить только задержку
                </button>

                <button
                  onClick={() => setDelayConfirmation(null)}
                  className="w-full text-center text-[10px] font-black text-slate-400 hover:text-slate-600 py-2 uppercase tracking-widest transition-colors"
                >
                  Отмена
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>


    </div>
  );
}
