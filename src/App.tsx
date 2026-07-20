/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
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
  Type,
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
  ExternalLink
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
  isWithinInterval
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
}

interface User {
  id: string;
  name: string;
  imageUrl?: string;
  roles: string[];
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

const CELL_WIDTH = 80; // width of one week in the grid
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
  const [artDirectorRole, setArtDirectorRole] = useState<'artist' | 'curator'>(initialData?.artDirectorRole || 'artist');
  const [processType, setProcessType] = useState<'sequential' | 'parallel'>('sequential');
  const [releaseMonth, setReleaseMonth] = useState<number>(new Date().getMonth());
  const [releaseYear, setReleaseYear] = useState<number>(new Date().getFullYear());
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
        defaultObj[stage] = res?.tasks[0] ? Math.max(1, Math.round(res.tasks[0].duration / 7)) : (defaultReg[stage] || 2);
      } else {
        defaultObj[stage] = defaultReg[stage] || 2;
      }
    });
    return defaultObj;
  });

  const calculateProjectStartDate = (
    month: number, 
    year: number, 
    type: 'sequential' | 'parallel', 
    currentDurations: Record<string, number>, 
    currentWeight: number | string
  ): string => {
    const targetSalesStart = new Date(year, month, 1);
    
    const cDur = projectType === 'mhi' ? 0 : (currentDurations['Концептирование'] || 2);
    const dDur = projectType === 'mhi' ? 0 : (currentDurations['Девелопмент'] || 2);
    const aDur = projectType === 'mhi' ? 0 : (currentDurations['Арт Продакшн'] || 2);
    const rDur = currentDurations['Редактирование'] || 2;
    const dvDur = currentDurations['Дизайн и вёрстка'] || 2;
    const prodDur = currentDurations['Производство и старт продаж'] || 2;
    
    const numericWeight = getNumericWeight(currentWeight);
    const riskDuration = numericWeight <= 3 ? 28 : 56;
    const prodDurationDays = prodDur * 7;
    
    let daysBeforeSales = 0;
    if (projectType === 'mhi') {
      daysBeforeSales = (rDur + dvDur) * 7 + 14;
    } else if (type === 'parallel') {
      const maxParallelWeeks = Math.max(dDur, aDur, rDur, dvDur);
      daysBeforeSales = (cDur + maxParallelWeeks) * 7 + riskDuration + prodDurationDays;
    } else {
      const endOffset = cDur + dDur + aDur + rDur + dvDur;
      daysBeforeSales = endOffset * 7 + riskDuration + prodDurationDays;
    }
    
    const calculatedStart = addDays(targetSalesStart, -daysBeforeSales);
    return format(calculatedStart, 'yyyy-MM-dd');
  };

  const getCalculatedReleaseDate = (
    startDateStr: string,
    type: 'sequential' | 'parallel',
    currentDurations: Record<string, number>,
    currentWeight: number | string
  ): Date => {
    const start = new Date(startDateStr);
    
    const cDur = projectType === 'mhi' ? 0 : (currentDurations['Концептирование'] || 2);
    const dDur = projectType === 'mhi' ? 0 : (currentDurations['Девелопмент'] || 2);
    const aDur = projectType === 'mhi' ? 0 : (currentDurations['Арт Продакшн'] || 2);
    const rDur = currentDurations['Редактирование'] || 2;
    const dvDur = currentDurations['Дизайн и вёрстка'] || 2;
    const prodDur = currentDurations['Производство и старт продаж'] || 2;
    
    const numericWeight = getNumericWeight(currentWeight);
    const riskDuration = numericWeight <= 3 ? 28 : 56;
    const prodDurationDays = prodDur * 7;
    
    let daysBeforeSales = 0;
    if (projectType === 'mhi') {
      daysBeforeSales = (rDur + dvDur) * 7 + 14;
    } else if (type === 'parallel') {
      const maxParallelWeeks = Math.max(dDur, aDur, rDur, dvDur);
      daysBeforeSales = (cDur + maxParallelWeeks) * 7 + riskDuration + prodDurationDays;
    } else {
      const endOffset = cDur + dDur + aDur + rDur + dvDur;
      daysBeforeSales = endOffset * 7 + riskDuration + prodDurationDays;
    }
    return addDays(start, daysBeforeSales);
  };

  // Helper to recalculate all dates based on process type
  const recalculateAllDates = (baseStart: string, type: 'sequential' | 'parallel', currentDurations: Record<string, number>) => {
    const start = new Date(baseStart);
    const newStageDates: Record<string, string> = {};
    
    const cDur = projectType === 'mhi' ? 0 : (currentDurations['Концептирование'] || 2);
    const dDur = projectType === 'mhi' ? 0 : (currentDurations['Девелопмент'] || 2);
    const aDur = projectType === 'mhi' ? 0 : (currentDurations['Арт Продакшн'] || 2);
    const rDur = currentDurations['Редактирование'] || 2;
    const dvDur = currentDurations['Дизайн и вёрстка'] || 2;

    if (projectType === 'mhi') {
      newStageDates['Концептирование'] = format(start, 'yyyy-MM-dd');
      newStageDates['Девелопмент'] = format(start, 'yyyy-MM-dd');
      newStageDates['Арт Продакшн'] = format(start, 'yyyy-MM-dd');
      newStageDates['Редактирование'] = format(start, 'yyyy-MM-dd');
      newStageDates['Дизайн и вёрстка'] = format(addDays(start, rDur * 7), 'yyyy-MM-dd');
      newStageDates['Производство и старт продаж'] = format(addDays(start, (rDur + dvDur) * 7), 'yyyy-MM-dd');
    } else if (type === 'parallel') {
      const maxParallelWeeks = Math.max(dDur, aDur, rDur, dvDur);
      
      newStageDates['Концептирование'] = format(start, 'yyyy-MM-dd');
      newStageDates['Девелопмент'] = format(addDays(start, cDur * 7), 'yyyy-MM-dd');
      newStageDates['Арт Продакшн'] = format(addDays(start, cDur * 7), 'yyyy-MM-dd');
      
      // Alignment by end date (ending at cDur + maxParallelWeeks)
      newStageDates['Редактирование'] = format(addDays(start, (cDur + maxParallelWeeks - rDur) * 7), 'yyyy-MM-dd');
      newStageDates['Дизайн и вёрстка'] = format(addDays(start, (cDur + maxParallelWeeks - dvDur) * 7), 'yyyy-MM-dd');
      
      newStageDates['Производство и старт продаж'] = format(addDays(start, (cDur + maxParallelWeeks) * 7), 'yyyy-MM-dd');
    } else {
      newStageDates['Концептирование'] = format(start, 'yyyy-MM-dd');
      newStageDates['Девелопмент'] = format(addDays(start, cDur * 7), 'yyyy-MM-dd');
      newStageDates['Арт Продакшн'] = format(addDays(start, (cDur + dDur) * 7), 'yyyy-MM-dd');
      
      const endOffset = cDur + dDur + aDur + rDur + dvDur;
      
      newStageDates['Редактирование'] = format(addDays(start, (endOffset - rDur) * 7), 'yyyy-MM-dd');
      newStageDates['Дизайн и вёрстка'] = format(addDays(start, (endOffset - dvDur) * 7), 'yyyy-MM-dd');
      
      newStageDates['Производство и старт продаж'] = format(addDays(start, endOffset * 7), 'yyyy-MM-dd');
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
          newDurations[stage] = Math.max(1, Math.round(res.tasks[0].duration / 7));
          newStageDates[stage] = format(new Date(res.tasks[0].startDate), 'yyyy-MM-dd');
        } else {
          newDurations[stage] = 2;
        }
      });
      
      setDurations(newDurations);
      setStageStartDates(newStageDates);

      // Infer processType
      const conceptRes = initialData.resources.find(r => r.role === 'Концептирование');
      const devRes = initialData.resources.find(r => r.role === 'Девелопмент');
      if (conceptRes && devRes && conceptRes.tasks[0] && devRes.tasks[0]) {
        const artRes = initialData.resources.find(r => r.role === 'Арт Продакшн');
        if (artRes && artRes.tasks[0] && new Date(devRes.tasks[0].startDate).getTime() === new Date(artRes.tasks[0].startDate).getTime()) {
          setProcessType('parallel');
        } else {
          setProcessType('sequential');
        }
      } else {
        setProcessType('sequential');
      }

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
      setProcessType('sequential');
      
      const today = new Date();
      setReleaseMonth(today.getMonth());
      setReleaseYear(today.getFullYear());
      setStartMonth(today.getMonth());
      setStartYear(today.getFullYear());
      setPlanningMode('release');
      setAssignments(DEFAULT_STAGES.reduce((acc, stage) => ({ ...acc, [stage]: '' }), {}));
      
      const newDurations = getRegulatoryDurationsForWeight(1);
      setDurations(newDurations);
      
      const calculatedStart = calculateProjectStartDate(today.getMonth(), today.getFullYear(), 'sequential', newDurations, 1);
      setProjectStartDate(calculatedStart);
      recalculateAllDates(calculatedStart, 'sequential', newDurations);
    }
  }, [initialData, isOpen]);

  // Synchronize durations when weight or project type changes during project creation (unless editing)
  useEffect(() => {
    if (!initialData && isOpen) {
      const regDurations = getRegulatoryDurationsForWeight(weight);
      setDurations(regDurations);
      if (planningMode === 'release') {
        const startStr = calculateProjectStartDate(releaseMonth, releaseYear, processType, regDurations, weight);
        setProjectStartDate(startStr);
        recalculateAllDates(startStr, processType, regDurations);
      } else {
        const startStr = format(new Date(startYear, startMonth, 1), 'yyyy-MM-dd');
        setProjectStartDate(startStr);
        recalculateAllDates(startStr, processType, regDurations);
        const computedReleaseDate = getCalculatedReleaseDate(startStr, processType, regDurations, weight);
        setReleaseMonth(computedReleaseDate.getMonth());
        setReleaseYear(computedReleaseDate.getFullYear());
      }
    }
  }, [weight, isOpen, initialData, releaseMonth, releaseYear, startMonth, startYear, processType, projectType, planningMode]);

  // Automatically force task regeneration and date recalculation when projectType changes
  useEffect(() => {
    if (isOpen) {
      setShouldRegenerateTasks(true);
      if (initialData) {
        // If editing, recalculate start dates based on existing project state but with new type logic
        const startStr = projectStartDate;
        recalculateAllDates(startStr, processType, durations);
      }
    }
  }, [projectType, isOpen]);

  const getFilteredUsers = (stage: string) => {
    const requiredRole = STAGE_TO_ROLE[stage];
    if (!requiredRole) return users;
    return users.filter(u => u.roles.includes(requiredRole));
  };

  const getUserConflictForStage = (userName: string, stage: string) => {
    if (!userName || userName === 'Не назначен') return false;
    
    const stageStartStr = stageStartDates[stage] || projectStartDate;
    const stageStart = new Date(stageStartStr);
    const stageEnd = addDays(stageStart, (durations[stage] || 2) * 7);

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
        // Regenerate resources and tasks
        finalResources = [...DEFAULT_STAGES, 'Производство и старт продаж'].map(stage => {
          const isSpecial = stage === 'Производство и старт продаж';
          const existingResource = initialData?.resources.find(r => r.role === stage);
          const weeks = durations[stage] || 2;
          const durationDays = weeks * 7;

          const taskStartDate = stageStartDates[stage] ? new Date(stageStartDates[stage]) : new Date(projectStartDate);

          const tasks: Task[] = [];
          let currentSubTaskStart = taskStartDate;
          
          if (isSpecial) {
            // 1. Add "Risks" task
            const riskTask = existingResource?.tasks.find(t => t.isRisk);
            const riskDuration = getNumericWeight(weight) <= 3 ? 28 : 56;
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
            tasks.push({
              id: prodTask?.id || Math.random().toString(36).substr(2, 9),
              label: 'ПРОИЗВОДСТВО',
              startDate: currentSubTaskStart,
              duration: durationDays,
              color: 'gray',
              status: prodTask?.status || 'neutral'
            });
            currentSubTaskStart = addDays(currentSubTaskStart, durationDays);

            // 3. Add "Start Sales" task (fixed 2 weeks)
            const salesTask = existingResource?.tasks.find(t => t.label === 'СТАРТ ПРОДАЖ');
            tasks.push({
              id: salesTask?.id || Math.random().toString(36).substr(2, 9),
              label: 'СТАРТ ПРОДАЖ',
              startDate: currentSubTaskStart,
              duration: 14,
              color: 'gray',
              status: salesTask?.status || 'neutral'
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
                  duration: 14,
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
                          const startStr = calculateProjectStartDate(releaseMonth, releaseYear, processType, durations, weight);
                          setProjectStartDate(startStr);
                          recalculateAllDates(startStr, processType, durations);
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
                          recalculateAllDates(projectStartDate, processType, durations);
                          const computedReleaseDate = getCalculatedReleaseDate(projectStartDate, processType, durations, weight);
                          setReleaseMonth(computedReleaseDate.getMonth());
                          setReleaseYear(computedReleaseDate.getFullYear());
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
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Месяц и год выхода проекта</label>
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-bold text-slate-700 cursor-pointer text-xs"
                          value={releaseMonth}
                          onChange={(e) => {
                            const newMonth = Number(e.target.value);
                            setReleaseMonth(newMonth);
                            const startStr = calculateProjectStartDate(newMonth, releaseYear, processType, durations, weight);
                            setProjectStartDate(startStr);
                            recalculateAllDates(startStr, processType, durations);
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
                            setReleaseYear(newYear);
                            const startStr = calculateProjectStartDate(releaseMonth, newYear, processType, durations, weight);
                            setProjectStartDate(startStr);
                            recalculateAllDates(startStr, processType, durations);
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
                            recalculateAllDates(startStr, processType, durations);
                            
                            const computedReleaseDate = getCalculatedReleaseDate(startStr, processType, durations, weight);
                            setReleaseMonth(computedReleaseDate.getMonth());
                            setReleaseYear(computedReleaseDate.getFullYear());
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
                            recalculateAllDates(startStr, processType, durations);
                            
                            const computedReleaseDate = getCalculatedReleaseDate(startStr, processType, durations, weight);
                            setReleaseMonth(computedReleaseDate.getMonth());
                            setReleaseYear(computedReleaseDate.getFullYear());
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
                      onClick={() => setProjectType('game')}
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
                      onClick={() => setProjectType('prototype')}
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
                      onClick={() => setProjectType('mhi')}
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
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Тип процесса</label>
                  <div className="flex p-1 bg-white border border-slate-200 rounded-xl">
                     <button
                      type="button"
                      onClick={() => {
                        setProcessType('sequential');
                        if (planningMode === 'release') {
                          const startStr = calculateProjectStartDate(releaseMonth, releaseYear, 'sequential', durations, weight);
                          setProjectStartDate(startStr);
                          recalculateAllDates(startStr, 'sequential', durations);
                        } else {
                          recalculateAllDates(projectStartDate, 'sequential', durations);
                          const computedReleaseDate = getCalculatedReleaseDate(projectStartDate, 'sequential', durations, weight);
                          setReleaseMonth(computedReleaseDate.getMonth());
                          setReleaseYear(computedReleaseDate.getFullYear());
                        }
                      }}
                      className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${
                        processType === 'sequential' 
                          ? 'bg-indigo-600 text-white shadow-sm' 
                          : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      Последовательный
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setProcessType('parallel');
                        if (planningMode === 'release') {
                          const startStr = calculateProjectStartDate(releaseMonth, releaseYear, 'parallel', durations, weight);
                          setProjectStartDate(startStr);
                          recalculateAllDates(startStr, 'parallel', durations);
                        } else {
                          recalculateAllDates(projectStartDate, 'parallel', durations);
                          const computedReleaseDate = getCalculatedReleaseDate(projectStartDate, 'parallel', durations, weight);
                          setReleaseMonth(computedReleaseDate.getMonth());
                          setReleaseYear(computedReleaseDate.getFullYear());
                        }
                      }}
                      className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${
                        processType === 'parallel' 
                          ? 'bg-indigo-600 text-white shadow-sm' 
                          : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      Параллельный
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
                      recalculateAllDates(projectStartDate, processType, regDurations);
                      setShouldRegenerateTasks(true);
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
                  const endDate = format(addWeeks(new Date(startDate), durationWeeks), 'yyyy-MM-dd');
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
                                const startStr = calculateProjectStartDate(releaseMonth, releaseYear, processType, newDurations, weight);
                                setProjectStartDate(startStr);
                                recalculateAllDates(startStr, processType, newDurations);
                              } else {
                                recalculateAllDates(projectStartDate, processType, newDurations);
                                const computedReleaseDate = getCalculatedReleaseDate(projectStartDate, processType, newDurations, weight);
                                setReleaseMonth(computedReleaseDate.getMonth());
                                setReleaseYear(computedReleaseDate.getFullYear());
                              }
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-400 uppercase">Финиш</label>
                          <div className="w-full px-2 py-2 bg-slate-100 border border-slate-200 rounded-lg text-xs text-slate-500 font-medium">
                            {format(addWeeks(new Date(startDate), durationWeeks), 'dd.MM.yyyy')}
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
                              const startStr = calculateProjectStartDate(releaseMonth, releaseYear, processType, newDurations, weight);
                              setProjectStartDate(startStr);
                              recalculateAllDates(startStr, processType, newDurations);
                            } else {
                              recalculateAllDates(projectStartDate, processType, newDurations);
                              const computedReleaseDate = getCalculatedReleaseDate(projectStartDate, processType, newDurations, weight);
                              setReleaseMonth(computedReleaseDate.getMonth());
                              setReleaseYear(computedReleaseDate.getFullYear());
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
  lane?: number;
  isFocused?: boolean;
  isReadOnly?: boolean;
  projectWeight?: number | string;
  role?: string;
}> = ({ task, onUpdate, onDelete, timelineStart, lane = 0, isFocused = false, isReadOnly = false, projectWeight, role }) => {
  const left = (differenceInDays(task.startDate, timelineStart) / 7) * CELL_WIDTH;
  const width = (task.duration / 7) * CELL_WIDTH;
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
  const [startX, setStartX] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [tempLabel, setTempLabel] = useState(task.label);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isEditing || isReadOnly) return;
    setIsDragging(true);
    setStartX(e.clientX);
    e.stopPropagation();
  };

  const handleResizeRightMouseDown = (e: React.MouseEvent) => {
    if (isReadOnly) return;
    setIsResizingRight(true);
    setStartX(e.clientX);
    e.stopPropagation();
  };

  const handleResizeLeftMouseDown = (e: React.MouseEvent) => {
    if (isReadOnly) return;
    setIsResizingLeft(true);
    setStartX(e.clientX);
    e.stopPropagation();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging && !isResizingRight && !isResizingLeft) return;
      
      const totalDeltaX = e.clientX - startX;
      const weeksMoved = Math.round(totalDeltaX / CELL_WIDTH);
      
      if (weeksMoved !== 0) {
        if (isDragging) {
          onUpdate({ startDate: addWeeks(task.startDate, weeksMoved) });
          setStartX(prev => prev + weeksMoved * CELL_WIDTH);
        } else if (isResizingRight) {
          const newDuration = Math.max(7, task.duration + weeksMoved * 7);
          if (newDuration !== task.duration) {
            onUpdate({ duration: newDuration });
            setStartX(prev => prev + (newDuration - task.duration) / 7 * CELL_WIDTH);
          }
        } else if (isResizingLeft) {
          const newDuration = Math.max(7, task.duration - weeksMoved * 7);
          if (newDuration !== task.duration) {
            onUpdate({ 
              startDate: addWeeks(task.startDate, weeksMoved),
              duration: newDuration 
            });
            setStartX(prev => prev + weeksMoved * CELL_WIDTH);
          }
        }
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizingRight(false);
      setIsResizingLeft(false);
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
    };
  }, [isDragging, isResizingRight, isResizingLeft, startX, task.startDate, task.duration, onUpdate]);

  const handleLabelSubmit = () => {
    onUpdate({ label: tempLabel });
    setIsEditing(false);
  };

  return (
    <motion.div
      layoutId={task.id}
      initial={false}
      animate={{ 
        left, 
        width, 
        top, 
        height,
        scale: isDragging ? 1.02 : (isFocused ? 1.25 : 1),
        boxShadow: isDragging 
          ? "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)" 
          : "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        zIndex: isDragging ? 3000 : (showStatusMenu ? 2500 : (isFocused ? 2000 : 10))
      }}
      transition={{ 
        type: "spring", 
        stiffness: 400, 
        damping: 30,
        mass: 0.8
      }}
      className={`absolute flex items-center px-2 text-[10px] uppercase font-bold ${task.color === 'lightpink' ? 'text-pink-950' : 'text-white'} rounded cursor-move select-none border group/task ${
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
                </div>
              )}
            </div>

            <button 
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-1 hover:bg-white/20 rounded transition-colors"
              title="Удалить задачу"
            >
              <Trash2 size={10} />
            </button>
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
                onUpdate({ startDate: addWeeks(task.startDate, -1) });
              }}
              className="absolute left-[-44px] top-1/2 -translate-y-1/2 w-7 h-7 bg-white rounded-full shadow-xl border-2 border-slate-100 flex items-center justify-center text-blue-600 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all opacity-0 group-hover/task:opacity-100 scale-90 hover:scale-110 active:scale-95 z-30"
              title="Сдвинуть на неделю назад"
            >
              <ChevronLeft size={16} strokeWidth={3} />
            </button>
            <button 
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                if (task.duration > 7) {
                  onUpdate({ 
                    duration: task.duration - 7 
                  });
                }
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onUpdate({ 
                  duration: task.duration + 7 
                });
              }}
              className="absolute left-[-14px] top-1/2 -translate-y-1/2 w-7 h-7 bg-white rounded-full shadow-xl border-2 border-slate-100 flex items-center justify-center text-red-500 hover:bg-red-500 hover:text-white hover:border-red-500 transition-all opacity-0 group-hover/task:opacity-100 scale-90 hover:scale-110 active:scale-95 z-30"
              title="Уменьшить (клик: -1 нед, дабл-клик: +1 нед)"
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
                onUpdate({ duration: task.duration + 7 });
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (task.duration > 7) {
                  onUpdate({ duration: task.duration - 7 });
                }
              }}
              className="absolute right-[-14px] top-1/2 -translate-y-1/2 w-7 h-7 bg-white rounded-full shadow-xl border-2 border-slate-100 flex items-center justify-center text-green-600 hover:bg-green-600 hover:text-white hover:border-green-600 transition-all opacity-0 group-hover/task:opacity-100 scale-90 hover:scale-110 active:scale-95 z-30"
              title="Увеличить (клик: +1 нед, дабл-клик: -1 нед)"
            >
              <Plus size={16} strokeWidth={3} />
            </button>
            <button 
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onUpdate({ startDate: addWeeks(task.startDate, 1) });
              }}
              className="absolute right-[-44px] top-1/2 -translate-y-1/2 w-7 h-7 bg-white rounded-full shadow-xl border-2 border-slate-100 flex items-center justify-center text-blue-600 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all opacity-0 group-hover/task:opacity-100 scale-90 hover:scale-110 active:scale-95 z-30"
              title="Сдвинуть на неделю вперед"
            >
              <ChevronRight size={16} strokeWidth={3} />
            </button>
          </div>
        </>
      )}
    </motion.div>
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
  
  const getProjectRowHeight = (project: Project, isReleasesTab = false) => {
    if (isReleasesTab) return ROW_HEIGHT + 2;
    if (collapsedProjects[project.id]) return ROW_HEIGHT + 2;
    return (project.resources.length * ROW_HEIGHT) + 2;
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
        // We need a syncUser function or just use the logic from saveUser
        try {
          await fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(user)
          });
        } catch (err) {
          console.error("Failed to restore user during undo:", err);
        }
      }
    }

    // Identify projects that are in current state but NOT in restored state (were added)
    // and delete them from server
    const currentProjectIds = projects.map(p => p.id);
    const restoredProjectIds = lastState.projects.map(p => p.id);
    for (const id of currentProjectIds) {
      if (!restoredProjectIds.includes(id)) {
        try {
          await fetch(`/api/projects/${id}`, { method: 'DELETE' });
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
          await fetch(`/api/users/${id}`, { method: 'DELETE' });
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

            // Try to sync to server
            for (const p of processedProjects) {
              await syncProjectToServer(p);
            }
            for (const u of data.users) {
               await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(u)
              }).catch(err => console.error("Sync user error:", err));
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
          
          if (updatedAny) {
            updatedUsers.forEach((user: User) => {
              const original = data.find((u: User) => u.id === user.id);
              if (original && JSON.stringify(original.vacations) !== JSON.stringify(user.vacations)) {
                fetch('/api/users', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(user)
                }).catch(err => console.error("Failed to sync auto-holiday for user", user.name, err));
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

  const [activeTab, setActiveTab] = useState<string>('projects_2026');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('all');
  
  // Review Tasks Mode State
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const [reviewTasks, setReviewTasks] = useState<{
    project: Project;
    resource: Resource;
    task: Task;
  }[]>([]);

  const [currentDate, setCurrentDate] = useState(new Date(2026, 0, 1));
  const [viewportWeeks, setViewportWeeks] = useState(104); 
  const [modalMode, setModalMode] = useState<'add' | 'edit' | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [reassigning, setReassigning] = useState<{ projectId: string; resourceId: string; role: string } | null>(null);

  const isProjectTab = activeTab.startsWith('projects_') || activeTab === 'projects' || activeTab === 'prototypes' || activeTab === 'releases';

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
          delayConfirmation !== null
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [projectSearch, setProjectSearch] = useState('');
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
    return projects.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(projectSearch.toLowerCase());
      
      if (activeTab === 'prototypes') return matchesSearch && p.isPrototype;
      if (activeTab === 'projects') return matchesSearch && !p.isPrototype;
      
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
  }, [projects, projectSearch, activeTab, releaseYearFilter]);

  const projectYears = useMemo(() => {
    const years = new Set<number>([2026, 2027, 2028]);
    projects.forEach(p => {
      if (!p.isPrototype) {
        const yr = p.releaseYear || getProjectReleaseDate(p).getFullYear();
        if (yr) years.add(yr);
      }
    });
    return Array.from(years).sort();
  }, [projects]);

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
    // Sorting: Primary role (first in array), then Name
    const sorted = [...users].sort((a, b) => {
      const roleA = a.roles[0] || '';
      const roleB = b.roles[0] || '';
      if (roleA !== roleB) return roleA.localeCompare(roleB);
      return a.name.localeCompare(b.name);
    });

    // Filtering
    if (userRoleFilter === 'all') return sorted;
    return sorted.filter(u => u.roles.includes(userRoleFilter));
  }, [users, userRoleFilter]);

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

  const syncProjectToServer = async (projectData: Project) => {
    try {
      const response = await fetch('/api/projects', {
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

  const saveProject = async (projectData: Project) => {
    if (isReadOnly) return;
    recordAction();
    
    // Calculate and assign release year based on ending dates
    const computedReleaseYear = getProjectReleaseDate(projectData).getFullYear();
    const projectWithYear = { ...projectData, releaseYear: computedReleaseYear };

    // Optimistic UI update
    if (modalMode === 'edit') {
      setProjects(prev => prev.map(p => p.id === projectData.id ? projectWithYear : p));
      if (!projectWithYear.isPrototype) {
        setActiveTab(`projects_${computedReleaseYear}`);
      }
    } else {
      const maxOrder = projects.reduce((max, p) => Math.max(max, p.sortOrder ?? -1), -1);
      const newProject = { ...projectWithYear, sortOrder: maxOrder + 1 };
      setProjects(prev => [...prev, newProject]);
      setActiveTab(newProject.isPrototype ? 'prototypes' : `projects_${computedReleaseYear}`);
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
      const response = await fetch(`/api/projects/${projectId}`, {
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
    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalUserData)
      });
      if (!response.ok) throw new Error('Failed to save user');
    } catch (error) {
      console.error('Database save user error:', error);
    }

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
      const response = await fetch(`/api/users/${userId}`, {
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

  const months = useMemo(() => {
    const monthMap: Record<string, { label: string; daysInTimeline: number }> = {};
    weeks.forEach(weekStart => {
      const key = format(weekStart, 'LLLL yyyy', { locale: ru });
      if (!monthMap[key]) {
        monthMap[key] = { label: key.charAt(0).toUpperCase() + key.slice(1), daysInTimeline: 0 };
      }
      monthMap[key].daysInTimeline += 7;
    });
    return Object.values(monthMap);
  }, [weeks]);

  const scrollToToday = (behaviorParam?: ScrollBehavior | any) => {
    const behavior: ScrollBehavior = (behaviorParam === 'smooth' || behaviorParam === 'auto') ? behaviorParam : 'smooth';
    if (scrollContainerRef.current) {
      const today = new Date();
      if (today >= timelineStart) {
        const weeksFromStart = Math.floor(differenceInDays(today, timelineStart) / 7);
        if (weeksFromStart < weeks.length) {
          scrollContainerRef.current.scrollTo({
            left: weeksFromStart * CELL_WIDTH,
            behavior
          });
        }
      }
    }
  };

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
      const horizontalScroll = weeksFromStart * CELL_WIDTH;

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
        const taskWidth = (freshTask.duration / 7) * CELL_WIDTH;

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
  }, [reviewIndex, reviewTasks, projects, sortedProjects, timelineStart, activeTab]);

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
    <div className="flex flex-col h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden relative">
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
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200 z-30 shadow-sm">
        <div className="flex items-center gap-4">
          <div 
            onClick={rollDice}
            className="flex-shrink-0 w-10 h-10 bg-indigo-600 rounded-xl shadow-lg border border-indigo-700/20 flex flex-col overflow-hidden group hover:scale-105 active:scale-95 transition-all cursor-pointer select-none"
          >
            {/* Calendar top part */}
            <div className="h-3 bg-indigo-800 w-full flex items-center justify-center gap-2">
              <div className="w-1 h-1 bg-white rounded-full" />
              <div className="w-1 h-1 bg-white rounded-full" />
            </div>
            {/* Calendar body with dice face */}
            <div className="flex-1 bg-white m-0.5 mt-0 rounded-b-lg flex items-center justify-center relative shadow-inner overflow-hidden">
              <motion.div 
                key={diceValue}
                initial={{ y: 20, opacity: 0, rotate: -10 }}
                animate={{ y: 0, opacity: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 25 }}
                className="w-full h-full flex items-center justify-center"
              >
                {renderDiceFace(diceValue)}
              </motion.div>
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">Студия разработки</h1>
              {dbStatus && (
                <div 
                  className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter shadow-sm border transition-all ${
                    dbStatus.connected 
                      ? 'bg-emerald-500 text-white border-emerald-600' 
                      : 'bg-rose-500 text-white border-rose-600 animate-pulse'
                  }`}
                  title={dbStatus.message}
                >
                  {dbStatus.connected ? 'PG: Online' : 'PG: Offline'}
                </div>
              )}
            </div>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Планирование проектов и ресурсов</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsSidebarVisible(!isSidebarVisible)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all h-[38px] ${isSidebarVisible ? 'bg-slate-100 text-slate-600' : 'bg-indigo-50 text-indigo-600 ring-2 ring-indigo-200'}`}
            title="Детали"
          >
            {isSidebarVisible ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
            <span className="hidden md:inline whitespace-nowrap">Детали</span>
          </button>

          <button 
            onClick={startReviewMode}
            className="flex items-center gap-2 bg-slate-900 border border-slate-700 text-slate-200 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:bg-slate-800 shadow-sm whitespace-nowrap h-[38px]"
            title="Режим проверки"
          >
            <Search size={18} className="text-indigo-400" />
            <span className="hidden lg:inline">Режим проверки</span>
          </button>

          <button 
            onClick={scrollToToday}
            className="p-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg transition-all shadow-sm h-[38px]"
            title="Перейти к сегодняшнему числу"
          >
            <Calendar size={18} className="text-indigo-600" />
          </button>

          {isProjectTab && (
            <button 
              onClick={handleSortProjects}
              className="p-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg transition-all shadow-sm h-[38px]"
              title="Сортировать проекты по дате выхода"
            >
              <SortAsc size={18} className="text-indigo-600" />
            </button>
          )}



          {!isReadOnly && (
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

          <button 
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all flex items-center gap-1.5 ring-1 ring-slate-200"
            title="Импортировать данные из файла"
          >
            <Upload size={18} />
            <span className="text-[10px] font-black uppercase tracking-tighter hidden sm:inline">Импорт</span>
          </button>

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
        <div className="inline-flex min-w-full">
          {/* Static Columns */}
          {(isSidebarVisible || isProjectTab || activeTab === 'users') && (
            <div className="sticky left-0 z-40 flex bg-white border-r border-slate-200 shadow-xl shadow-slate-200/50">
              {isProjectTab && (
                <div className="w-52 flex-shrink-0 border-r border-slate-100">
                  <div className="h-20 sticky top-0 z-50 flex flex-col justify-end px-3 pb-3 bg-white border-b-2 border-slate-400">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-bold uppercase tracking-widest text-slate-400">{isProjectTab && activeTab === 'releases' ? 'Релизы' : 'Проект'}</div>
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
                  {sortedProjects.map(project => {
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
                              {project.segment && (
                                <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest leading-none">{project.segment}</span>
                              )}
                              <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded leading-none ${
                                project.isPrototype 
                                  ? 'bg-amber-50 text-amber-700 border border-amber-100' 
                                  : project.isMhi 
                                    ? 'bg-purple-50 text-purple-700 border border-purple-100' 
                                    : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                              }`}>
                                {project.isPrototype ? 'Прототип' : project.isMhi ? 'МХИ' : 'Игра'}
                              </span>
                            </div>
                            {!isReleasesTab && (
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                                <div className="flex items-center gap-1">
                              <span className="text-[10px] text-slate-500 font-medium whitespace-nowrap">Вес:</span>
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
                            </div>
                            <span className="text-[10px] text-slate-500 font-medium whitespace-nowrap">Выход: <span className="font-bold text-indigo-600">
                              {(() => {
                                const latestTaskDate = getProjectReleaseDate(project);
                                const months = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
                                return latestTaskDate.getTime() > 0 ? `${months[latestTaskDate.getMonth()]} ${latestTaskDate.getFullYear()}` : '—';
                              })()}
                            </span></span>
                              </div>
                            )}
                          </div>
                        </div>
                        {(() => {
                          if (isReleasesTab) return null;
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
                    const lanesInfo = userTasksWithLanes[user.name];
                    const rowHeight = (lanesInfo?.maxLanes || 1) * ROW_HEIGHT;
                    return (
                      <div 
                        key={user.id} 
                        style={{ height: rowHeight + 2 }}
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
                        <div className="h-20 sticky top-0 z-50 flex items-end px-4 pb-3 text-sm font-bold uppercase tracking-widest text-slate-400 bg-white border-b-2 border-slate-400">
                          Команда
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
                                const lanesInfo = userTasksWithLanes[user.name];
                                const rowHeight = (lanesInfo?.maxLanes || 1) * ROW_HEIGHT;
                                return (
                                  <div 
                                    key={`vacation-side-${user.id}`} 
                                    style={{ height: rowHeight + 2 }}
                                    className="flex flex-col justify-center px-4 border-b-2 border-slate-400 hover:bg-slate-100/50 transition-colors group cursor-pointer"
                                    onClick={() => {
                                      setEditingUserId(user.id);
                                      setModalMode('edit');
                                    }}
                                  >
                                    {(() => {
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
              <div className="flex h-10">
                {months.map((month, idx) => (
                  <div 
                    key={idx} 
                    style={{ width: (month.daysInTimeline / 7) * CELL_WIDTH }}
                    className="flex-shrink-0 border-r border-slate-400 flex items-center justify-center text-[11px] font-bold uppercase tracking-widest text-slate-500 bg-white"
                  >
                    {month.label}
                  </div>
                ))}
              </div>
              {/* Weeks */}
              <div className="flex h-10 border-t border-slate-100 overflow-hidden">
                {weeks.map((weekStart, idx) => {
                  const endOfWeekDate = addDays(weekStart, 6);
                  const isCurrentWeek = new Date() >= weekStart && new Date() < addDays(weekStart, 7);
                  const isEndOfMonth = idx < weeks.length - 1 && weeks[idx + 1].getMonth() !== weekStart.getMonth();
                  
                  return (
                    <div 
                      key={idx} 
                      style={{ width: CELL_WIDTH }} 
                      className={`flex-shrink-0 border-r overflow-hidden flex flex-col items-center justify-center transition-colors ${
                        isEndOfMonth ? 'border-r-slate-400' : 'border-slate-100'
                      } ${isCurrentWeek ? 'bg-indigo-50' : 'bg-white'}`}
                    >
                      <span className={`text-[9px] font-medium uppercase ${isCurrentWeek ? 'text-indigo-600' : 'text-slate-400'}`}>
                        Н{format(weekStart, 'w', { locale: ru })}
                      </span>
                      <span className={`text-[10px] font-bold ${isCurrentWeek ? 'text-indigo-700' : 'text-slate-700'}`}>
                        {format(weekStart, 'd')}—{format(endOfWeekDate, 'd')}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Grid Body */}
            <div className="relative">
              {/* Grid Lines Overlay */}
              <div className="absolute inset-0 z-0 pointer-events-none flex">
                {weeks.map((weekStart, idx) => {
                  const isCurrentWeek = new Date() >= weekStart && new Date() < addDays(weekStart, 7);
                  const isEndOfMonth = idx < weeks.length - 1 && weeks[idx + 1].getMonth() !== weekStart.getMonth();
                  
                  return (
                    <div 
                      key={idx} 
                      style={{ width: CELL_WIDTH }} 
                      className={`flex-shrink-0 border-r h-full ${
                        isEndOfMonth ? 'border-r-slate-400' : 'border-slate-100'
                      } ${isCurrentWeek ? 'bg-indigo-50/30' : ''}`}
                    />
                  );
                })}
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
                            const weekIndex = Math.floor(x / CELL_WIDTH);
                            if (!isReadOnly) addTask(project.id, resource.id, addWeeks(timelineStart, weekIndex));
                          }}
                        >
                          {resource.tasks.map(task => (
                            <TaskBlock 
                              key={task.id} 
                              task={task} 
                              timelineStart={timelineStart}
                              isFocused={reviewIndex !== null && reviewTasks[reviewIndex]?.task.id === task.id}
                              isReadOnly={isReadOnly}
                              onUpdate={(updates) => updateTask(project.id, resource.id, task.id, updates)}
                              onDelete={() => deleteTask(project.id, resource.id, task.id)}
                              projectWeight={project.weight}
                              role={resource.role}
                            />
                          ))}
                        </div>
                      ))
                    )}
                    </motion.div>
                  );
                })
              ) : (
                processedUsers.map(user => {
                    const lanesInfo = userTasksWithLanes[user.name];
                    const tasksForUser = lanesInfo?.tasks || [];
                    const rowHeight = (lanesInfo?.maxLanes || 1) * ROW_HEIGHT;
                    return (
                      <motion.div 
                        layout
                        key={user.id} 
                        style={{ height: rowHeight + 2 }}
                        className="border-b-2 border-slate-400 relative group/row hover:bg-slate-50/50 transition-colors"
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      >
                        {tasksForUser.map(({ project, task, projectId, resourceId, lane, projectWeight, role }) => (
                          <TaskBlock 
                            key={task.id} 
                            task={{ ...task, label: `${project}: ${task.label}` }} 
                            timelineStart={timelineStart}
                            lane={lane}
                            isFocused={reviewIndex !== null && reviewTasks[reviewIndex]?.task.id === task.id}
                            isReadOnly={isReadOnly}
                            onUpdate={(updates) => updateTask(projectId, resourceId, task.id, updates)}
                            onDelete={() => deleteTask(projectId, resourceId, task.id)}
                            projectWeight={projectWeight}
                            role={role}
                          />
                        ))}
                        {user.vacations?.map(vacation => {
                          const start = new Date(vacation.startDate);
                          const end = new Date(vacation.endDate);
                          const duration = differenceInDays(end, start);
                          const leftPos = (differenceInDays(start, timelineStart) / 7) * CELL_WIDTH;
                          const width = (duration / 7) * CELL_WIDTH;
                          
                          if (leftPos + width < 0 || leftPos > weeks.length * CELL_WIDTH) return null;

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
                    left: (differenceInDays(new Date(), timelineStart) / 7) * CELL_WIDTH,
                    boxShadow: '0 0 8px rgba(239, 68, 68, 0.5)'
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <footer className="px-6 py-2 bg-white border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 font-medium">
        <div className="flex items-center gap-4">
          <div className="bg-slate-100 p-0.5 rounded-lg flex shadow-inner">
            <button 
              onClick={() => setActiveTab('projects')}
              className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-tighter transition-all ${activeTab === 'projects' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Все проекты
            </button>
            {projectYears.map(yr => (
              <button 
                key={yr}
                onClick={() => setActiveTab(`projects_${yr}`)}
                className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-tighter transition-all ${activeTab === `projects_${yr}` ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
              >
                Проекты {yr}
              </button>
            ))}
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
            <Type size={14} className="text-slate-400" />
            <span>Нажми два раза для добавления задачи.</span>
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
