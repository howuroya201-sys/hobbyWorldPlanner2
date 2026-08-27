# Студия разработки / Hobby World Planner

React/Vite/Express task-planning web app for a board-game studio's production
pipeline (Проекты, МХИ, Корпы, Прототипы, Релизы, Сотрудники, Концептирование
и арт-продакшн, Девелопмент, Редактура и вёрстка). This file is a handoff
written mid-session — read it fully before making changes, since it
documents non-obvious business rules that aren't visible just from reading
the code.

## Stack & running it

- React 19 + Vite 6 + Express + `pg` (node-postgres) + `tsx` dev runner;
  Tailwind CSS v4; `framer-motion` (`motion/react`); `date-fns` (Russian
  locale) for all date math.
- Single primary file: `src/App.tsx` (~5500+ lines — nearly the whole app:
  components, modals, and the App shell all live here). Server: `server.ts`.
- Dev server: `PORT=3000 npm run dev` (Vite + Express on the same port).
- **Vite watches `data/*.json`** (the local-file DB fallback) and triggers a
  **full browser reload** on every write. Any project/user save from the UI
  will reload the page and reset all React state (activeTab back to
  'projects', any open modal closes, etc.) — this is expected, not a bug.
  A `ReferenceError: X is not defined` seen right after refactoring a
  variable/function name is very often a **stale console log** from before
  the reload finished, not a live error — always re-check in a **fresh
  browser tab** (`tabs_close` + `preview_start` again) before concluding
  something is actually broken.
- Auth: hardcoded passwords in `App.tsx` — `HobbyWorldPlanner2026!` (editor,
  full access) and `ViewPlanner2026!` (viewer, read-only).
- **Zombie dev servers**: `pkill -f "tsx server.ts"` does not reliably kill
  every stray process on this machine — old dev servers have been found
  still bound to port 3000 *weeks* later, silently serving stale data while
  a "fresh" restart appeared to do nothing. Before trusting a "clean" test,
  verify with `lsof -nP -iTCP:3000 -sTCP:LISTEN` and kill the actual PID if
  it doesn't match what you just started.

## Data model (`Project` interface, `src/App.tsx`)

Core: `id, name, weight (number|string, e.g. 1/2/3/'3Н'/4/5/'5Н'), imageUrl,
trackerUrl, segment, resources: Resource[], isPrototype, isMhi, sortOrder,
excludeFromReleases, releaseYear, artDirectorRole, isCollapsed
(= "завершён", sorts to the bottom of lists), hasForeignComponents,
hasSmallBatch`.

Added for the **"Редактура и вёрстка"** table (all optional, all persisted
the same way as any other project field — no schema, Postgres/local-JSON
just stores the whole `Project` object as JSON):
`componentsNote, editorialStatus, currentTaskNote, editorialComment,
tzLayoutDate, rulesDate, componentsLayoutDate, boxLayoutDate,
rulesLayoutDate, approvalDate, postLayoutDate, editStartDate,
printReadyDate, inEditorialLayout`.

`Resource.role` is one of the fixed stage names (`DEFAULT_STAGES` +
`'Производство и старт продаж'`): Концептирование, Девелопмент, Арт
Продакшн, Редактирование, Дизайн и вёрстка, Производство и старт продаж
(this last one is `isSpecialRow: true`, holds the РИСКИ/ПРОИЗВОДСТВО/СТАРТ
ПРОДАЖ sub-tasks and any conditional add-ons).

`Task.duration` is always in **calendar days** (used everywhere for Gantt
positioning: `addDays(startDate, duration)` = end). Never store it in weeks.

## Regulatory scheduling (the core engine)

`getRegulatoryDurationsForWeight(weight)` returns each stage's length in
**working weeks** (not calendar weeks) — this was a recent, deliberate
change. The conversion is `weeks * 5` **working days**, skipping weekends
*and* Russian public holidays (`getRussianHolidaysForYear`, module-level
constant list). Helpers, all module-level in `App.tsx`:

- `isRussianHoliday(date)`, `isWorkingDay(date)`
- `addWorkingDays(date, days)` — walks forward/backward (negative `days`
  supported) skipping non-working days. **This is the one function to reuse**
  for any new stage-duration math — don't reintroduce `addDays(x, weeks*7)`.
- `countWorkingDays(start, end)` — inverse, used when *reading back* a
  stage's stored calendar-day duration into a "weeks" number for the modal's
  editable input (dividing by 7 no longer works since a stage's real
  calendar span depends on which holidays it happened to cross).

All of `calculateProjectStartDate`, `getCalculatedReleaseDate`,
`recalculateAllDates`, and the task-generation block in `ProjectModal`'s
`handleSubmit` were converted to this working-day model together — they
must **stay consistent** with each other (they all anchor from the same
`start` and chain via `addWorkingDays`, which is composable/associative, so
sequential and cumulative offsets agree). Two load-bearing invariants that
must keep holding after any change here (verified against real backup data,
see below):
1. Девелопмент's end date == Редактирование's start date.
2. Арт Продакшн's end date == Дизайн и вёрстка's start date (Арт Продакшн's
   own duration is *derived*: `dForce['Арт Продакшн'] = dForce['Девелопмент']
   + dForce['Редактирование'] - dForce['Дизайн и вёрстка']`).
3. Редактирование and Дизайн и вёрстка always **finish on the same day**.
4. СТАРТ ПРОДАЖ never starts before ПРОИЗВОДСТВО ends, within the same
   "Производство и старт продаж" special row. Unlike 1–3, which only hold
   at generation time (`ProjectModal`'s `handleSubmit`), this one is
   enforced **live**, in `updateTask` (`App.tsx`): after every task edit,
   a final pass finds that resource by role, and if СТАРТ ПРОДАЖ's start
   precedes ПРОИЗВОДСТВО's end, clamps it forward to bump flush against
   production instead of overlapping — duration is left untouched, so a
   plain drag/move slides the whole bar forward keeping its length, while
   growing ПРОИЗВОДСТВО pushes a too-early СТАРТ ПРОДАЖ forward the same
   way. Applies regardless of *which* task was actually edited or how
   (drag, resize, nudge buttons, locked-project cascade shift) — it's a
   final invariant check on `updatedProject.resources`, not tied to one
   interaction path. By explicit request; don't relax it into a
   drag-time-only constraint that a resize or a locked cascade could still
   slip past.

Weight key normalization: `normalizeWeightKey` / the `ruWeight` pattern
handles Cyrillic Н vs Latin H interchangeably; `'5Н'` has no distinct
duration row in most tables (falls back to `'5'`).

## "Редактура и вёрстка" tab (`activeTab === 'edit_layout'`)

A flat HTML `<table>` (not the Gantt/sidebar layout the other tabs use),
rendered as its own branch in the main content area. Key points:

- **Opt-in list**, not "all projects": only projects with
  `inEditorialLayout: true` show up. Add via the **"+"** button in the
  "Игра" column header — opens a search dropdown listing all non-prototype,
  non-collapsed projects not already in the table, sorted by release date
  (`getProjectReleaseDate`). Remove via the "×" that appears on row hover.
  The table's own row order is separate from that dropdown's: `sortedProjects`
  sorts by ascending "В печать" date specifically when `activeTab ===
  'edit_layout'` (`project.printReadyDate` override else
  `getEditorialPrintDate(project)`, `Infinity` for projects with neither —
  they sort last). This overrides the studio's manual project order used on
  every other tab; don't merge it with `handleSortProjects` (the footer sort
  button), which is a different, mutating, explicitly-triggered sort.
- 20 columns total, in this exact order: Игра, Вес, **Издатель**
  (`publisher` field, free text, same input styling as Импорт), Сегмент,
  Импорт (`componentsNote` field — labeled "Доп. компоненты" until renamed
  by request), Редактор, Дизайнер, Статус, Текущая задача, Комментарий, В
  печать, Старт, ТЗ на вёрстку, Правила, **Старт вёрстки**, Вёрстка
  компонентов, Вёрстка коробки, Вёрстка правил, Согласование, Пост-вёрстка.
- **Editor/Дизайнер names and 2 of the dates are read live off the Gantt
  data**, not stored separately: `getStageResource`, `getStageStartDate`,
  `getStageEndDate`, `getProductionTaskStartDate`. "Старт" = Редактирование's
  start. "В печать" is conditional, not a flat formula: it's the start of
  the "ПРОИЗВОДСТВО" sub-task (inside the special "Производство и старт
  продаж" row) **only when that start falls before** Дизайн-и-вёрстка's end
  (= Редактирование's end, they always finish together); if production is
  scheduled to start *after* editorial work wraps up, "В печать" falls back
  to Дизайн-и-вёрстка's end instead (`designEndDate` in the code — this was
  the sole rule before production-start was added as an earlier-only
  override, so don't drop the fallback branch). Applies to every project
  type including МХИ, though МХИ projects typically have no "ПРОИЗВОДСТВО"
  task (their special row instead holds "Передача в МХИ") so this cell
  falls back to the design-end branch there unless manually overridden.
  "ТЗ на вёрстку" defaults to Дизайн и вёрстка's start but can be
  overridden.
- **Plan chain** for the 7 rightmost date columns: `EDITORIAL_PLAN_DAYS`
  (working-day counts per column per weight) chained via
  `getEditorialPlanChain(startDate, weight)`, starting from "Старт"
  (`project.editStartDate` override, else the Gantt-derived start) —
  **except for МХИ projects** (`project.isMhi`), where this chain is
  skipped entirely (`planChain` is just `{}`): МХИ doesn't follow the
  regulatory weight-duration schedule, so none of these 8 columns get a
  faded suggested value for МХИ rows, only a value if a person manually
  overrides that specific cell. "Старт" and "В печать" are unaffected by
  this — they keep reading off the Gantt "план" tasks for МХИ same as any
  other project. This plan-days table is a *separate* weight table from the
  main regulatory-duration one above — don't conflate them. Column display
  order is `EDITORIAL_PLAN_DISPLAY_ORDER`
  (used to render the `<th>`s and `<td>`s), which is **not** the same as
  `EDITORIAL_PLAN_CHAIN_ORDER` (used for the cumulative offset math): "Старт
  вёрстки" (`layoutStartDate`) sits *visually* between Правила and Вёрстка
  компонентов but is **not** chained from Правила — by regulation it's always
  ТЗ-на-вёрстку's *plan* date + 1 working day, flat across all weights, and
  is computed as a one-off after the main chain loop rather than participating
  in it. Like every other non-"Старт" column, it reads the plan value of ТЗ
  на вёрстку, not that column's manual override — consistent with plan cells
  never cascading from each other's overrides (see below).
- **Faded = still just the plan, not confirmed.** Every date cell shows the
  auto-computed value at `opacity-40` until a person edits *that specific
  cell*; the manual override field (e.g. `project.rulesDate`) then holds a
  real value and the cell renders at full opacity. Editing "Старт" reshifts
  the whole downstream plan chain (since it's the anchor); editing any other
  cell does **not** cascade to the others — plan vs. actual is meant to
  diverge, that's the point of tracking it this way. Don't "fix" this into a
  cascading recompute without checking with the user first.
- `EDITORIAL_STATUSES` (11 values, fixed order): Арт, Редактура, Дизайн,
  Вёрстка, Тестирование, Пост-вёрстка, Согласование, Затык, Ждём тираж,
  Препресс, Сдано. Full set was explicitly corrected/extended more than once
  already — don't trim it back down. The dropdown in the "Статус" column
  renders a visual divider (`EDITORIAL_STATUS_UPPER_GROUP_SIZE = 6`) after
  "Пост-вёрстка": everything through it is a production stage, everything
  after is a state (Согласование/Затык/Ждём тираж/Препресс/Сдано), and
  `EDITORIAL_BELOW_LINE_STATUSES` (used to override the "Факт" bar label —
  see below) is derived from that same slice, so a status added below the
  line is automatically included there too. "Тестирование" was explicitly
  placed in the upper (stages) group, between Вёрстка and Пост-вёрстка, by
  user request — it doesn't obviously belong to either group, don't move it
  without asking first. "Препресс" was explicitly placed below the line,
  between Ждём тираж and Сдано (in that order), also by user request.
- **"План" vs "факт" bars on the "Проекты" tab's Gantt.** Task bars for the
  Редактирование and Дизайн и вёрстка resource rows render at `opacity-45`
  there (the `dimmed` prop on `TaskBlock`) — they're the regulatory "план",
  always faded regardless of whether a "факт" bar exists. A second,
  synthetic, read-only bar (not a stored `Task` — computed inline in the
  resource-row JSX, `isProjectTab` branch, right after the `resource.tasks.map`
  call) renders full-color underneath it (`top: 26` vs the plan bar's
  `top: 4`, both within the same 48px `ROW_HEIGHT` row) whenever the
  corresponding editorial-table field is filled in: `project.editStartDate`
  drives the Редактирование row's факт bar, `project.layoutStartDate` drives
  the Дизайн и вёрстка row's. Its end date is `project.printReadyDate` if
  set, else **today** — recomputed on every render, so the bar visibly grows
  day by day until "В печать" is filled in, at which point it snaps to that
  date and stops growing. Because the факт bar sits low in the row
  (`top: 26`) and the план bar's own hover controls (`TaskBlock`'s 4 nudge/
  resize buttons, positioned at `left-[-44px]`/`left-[-14px]`/
  `right-[-14px]`/`right-[-44px]`) used to be vertically centered
  (`top-1/2 -translate-y-1/2`) on the план bar's full height, they'd land
  right behind the факт bar and be unreachable — those 4 buttons now switch
  to `top-0` (level with the label text, which itself sits at the top via
  the `dimmed` → `items-start` change above) whenever `dimmed` is true, and
  stay vertically centered otherwise. This is intentionally a live progress indicator
  against the plan, not a stored/editable task.
- **Факт bar label** (`getEditorialFactLabel`, next to `EDITORIAL_STATUSES`):
  not a static "Факт" — it names whichever stage was most recently reached,
  read off which editorial-table date columns are filled in, checked from
  the most-advanced state backward so it's correct even if an earlier column
  in the chain was skipped. Two independent chains, both keyed only by
  presence/absence of the date value (not by its actual date):
  Редактирование: Старт filled → "ТЗ на вёрстку" → (ТЗ на вёрстку filled)
  "Написание правил" → (Правила filled) "Менеджмент вёрстки" →
  (Пост-вёрстка filled) "Сдано". Дизайн и вёрстка: Старт вёрстки filled →
  "Вёрстка компонентов" → (Вёрстка компонентов filled) "Вёрстка коробки" →
  (Вёрстка коробки filled) "Вёрстка правил" → (Вёрстка правил filled)
  "Согласование и пост-вёрстка" → (Пост-вёрстка filled) "Сдано". If
  `editorialStatus` is set to one of `EDITORIAL_BELOW_LINE_STATUSES`
  (Согласование/Затык/Ждём тираж/Сдано), that status **overrides** the
  computed label on *both* rows outright, regardless of which date columns
  are filled; switching the status back to an "above the line" value (or
  clearing it) reverts to the computed label. By user request — don't
  simplify this into "just show editorialStatus" or vice versa.

## Other recent features worth knowing about

- **МХИ / Корпы / "Проекты без МХИ" tabs**: filter by `project.isMhi` /
  `segment === 'корп. заказ'` / `!project.isMhi && !project.isPrototype`
  (`activeTab === 'no_mhi'`) respectively. Live inside the "Проекты"
  dropdown (see below), not separate footer tabs. `no_mhi` deliberately
  does **not** use a `projects_` prefix like the year tabs do — the
  `sortedProjects` year-filter branch does `activeTab.startsWith('projects_')`
  then `parseInt(activeTab.replace('projects_', ''))`, which would silently
  break (`NaN` year) if this tab were named e.g. `projects_no_mhi`.
- **"Проекты" dropdown**: footer has exactly 4 tabs — Проекты, Прототипы,
  Релизы, Сотрудники. Clicking "Проекты" just activates the family; the
  actual dropdown (Все проекты / МХИ / Проекты без МХИ / Корпы / Проекты
  <year> / + Добавить
  год) lives in the sidebar header, **above the search box**, not attached
  to the footer button itself — this placement was corrected twice by the
  user, don't move it back to the footer.
## "Девелопмент" tab (`activeTab === 'devel'`)

Deliberately built as a near-clone of "Редактура и вёрстка" — same flat
`<table>` shape, same opt-in-list / "+" picker / faded-plan / below-line-
status-override mechanics — with these differences, all by explicit
request:

- **Opt-in list**: `project.inDevelopmentLayout`, not `inEditorialLayout` —
  a project can be in both tables independently, so none of this tab's
  fields are shared with the editorial ones, even where conceptually
  parallel (`devStatus` vs `editorialStatus`, `devDocNote` vs
  `currentTaskNote`, `devComment` vs `editorialComment`, `devStartDate` vs
  `editStartDate`, `devToEditorialDate` vs `printReadyDate`). Editing one
  table must never leak into the other's display for the same project.
- **14 columns**, in this order: Игра, Вес, Сегмент, Импорт
  (`componentsNote` — shared with editorial, it's a plain project-level
  fact, not stage-specific; unlike editorial this table has **no**
  "Издатель" column — explicitly removed by request, don't re-add it),
  Девелопер (one column, not Редактор+Дизайнер — `getStageResource(project,
  'Девелопмент')`), Статус, Девдок (`devDocNote`, free text — renamed from
  "Текущая задача"), Комментарий (`devComment`), В редактуру
  (`devToEditorialDate` override else `getStageStartDate(project,
  'Редактирование')`), Старт (`devStartDate` override else
  `getStageStartDate(project, 'Девелопмент')`), then 4 stage columns:
  Создание девдока / Работа над ядром / Девелопмент игры / Финализация
  (`devDocDate`/`devCoreDate`/`devGameDate`/`devFinalizationDate`,
  `DEV_STAGE_DISPLAY_ORDER`).
- **No regulatory plan chain at all** for those 4 stage columns — every
  project here is treated like a МХИ project in the editorial table:
  always blank until manually filled in, no faded suggested dates, no
  `opacity-40` styling (there's no "plan" value to be faded relative to).
  Only Старт and В редактуру get the faded-until-edited treatment, same as
  editorial's Старт/В печать.
- **`DEV_STATUSES`** (6 values): Девелопмент, Тестирование, Финализация,
  Согласование, Затык, Сдано — own list, own divider
  (`DEV_STATUS_UPPER_GROUP_SIZE = 3`), own below-line override set
  (`DEV_BELOW_LINE_STATUSES`). Not merged with `EDITORIAL_STATUSES` despite
  overlapping words ("Тестирование", "Финализация" vs "Пост-вёрстка") —
  different workflow, different vocabulary.
- **`getDevFactLabel(project)`**: single-chain version of
  `getEditorialFactLabel` (one resource — Девелопмент — instead of two).
  Progression: Старт filled → "Создание девдока" → (that filled) "Работа
  над ядром" → (that filled) "Девелопмент игры" → (that filled)
  "Финализация" → (Финализация filled) "Сдано". A `devStatus` in
  `DEV_BELOW_LINE_STATUSES` overrides this outright, same mechanics as
  editorial. The intermediate labels are literally the column names, since
  (unlike editorial) no separate label vocabulary was specified — don't
  invent bespoke phrasing here without checking first.
- **Sort**: rows rank by ascending "В редактуру"
  (`devToEditorialDate`/`getStageStartDate(·, 'Редактирование')`), same
  reasoning/shape as editorial's sort-by-"В печать".
- **Проекты tab Gantt integration**: the "Девелопмент" resource row is now
  *always* dimmed there (`TaskBlock`'s `dimmed` prop), and gets its own
  "Факт" overlay bar (purple — `bg-purple-600 border-purple-700`, matching
  `getTaskColor`'s purple for this stage) driven by `devStartDate` →
  `devToEditorialDate` (else today, growing) — same overlay mechanism as
  the editorial rows', just a third branch in the same block rather than a
  separate implementation.
- Reuses `updateEditorialField` for all writes (it's field-name-agnostic —
  `{...p, ...updates}` — despite the name); no `updateDevField` was added
  to avoid an unnecessary duplicate of identical logic.

## "Концептирование и арт-продакшн" tab (`activeTab === 'concept_art'`)

Formerly the last placeholder tab (`isPlaceholderTab` has been removed
entirely now that both it and "Девелопмент" are built) — another near-clone
of "Редактура и вёрстка", built the same way as "Девелопмент" above, but
targeting a single **Арт Продакшн** resource, not Концептирование despite
the tab's name covering both — this was explicit and confirmed twice across
the request (once for the "Арт-директор" column, once for the "Старт"
column's source), don't reinterpret it to also cover Концептирование
without checking first.

- **Opt-in list**: `project.inArtLayout`. Own fields throughout
  (`artStatus`, `artTaskNote`, `artComment`, `artStartDate`,
  `artToLayoutDate`, `artTzDate`, `artContractorDate`, `artStyleDate`,
  `artDrawingDate`, `artFinalizationDate`) — same independence rationale as
  the Девелопмент fields.
- **16 columns**, in this order: Игра, Вес, Издатель, Сегмент, Импорт
  (`publisher`/`componentsNote`, shared with editorial — unlike the
  Девелопмент tab, "Издатель" **is** present here; it was never asked to be
  removed from this tab), Арт-директор (`getStageResource(project, 'Арт
  Продакшн')`), Статус, Текущая задача (`artTaskNote` — **not** renamed,
  unlike Девелопмент's "Девдок"; the underlying field is still separate
  from editorial's `currentTaskNote` even though the label matches), Комментарий
  (`artComment`), В вёрстку (`artToLayoutDate` override else
  `getStageStartDate(project, 'Дизайн и вёрстка')`), Старт (`artStartDate`
  override else `getStageStartDate(project, 'Арт Продакшн')`), then 5 stage
  columns: Составление ТЗ / Поиск подрядчика / Согласование стиля /
  Отрисовка / Финализация
  (`artTzDate`/`artContractorDate`/`artStyleDate`/`artDrawingDate`/
  `artFinalizationDate`, `ART_STAGE_DISPLAY_ORDER`).
- **No regulatory plan chain** for those 5 stage columns, same МХИ-style
  always-blank-until-filled rule as Девелопмент's 4.
- **`ART_STATUSES`** (6 values): Составление ТЗ, Поиск подрядчика,
  Отрисовка, Согласование, Затык, Сдано — own list, own divider
  (`ART_STATUS_UPPER_GROUP_SIZE = 3`), own below-line override set
  (`ART_BELOW_LINE_STATUSES`). Note the upper group reuses 3 of the 5 stage
  column names verbatim (Составление ТЗ, Поиск подрядчика, Отрисовка) but
  skips "Согласование стиля" and "Финализация" — that's exactly what was
  specified, not an oversight; don't "complete the set" by adding them.
- **`getArtFactLabel(project)`**: same shape as `getDevFactLabel`.
  Progression: Старт filled → "Составление ТЗ" → (filled) "Поиск
  подрядчика" → (filled) "Согласование стиля" → (filled) "Отрисовка" →
  (filled) "Финализация" → (Финализация filled) "Сдано". `artStatus` in
  `ART_BELOW_LINE_STATUSES` overrides outright, same mechanics as
  Девелопмент/editorial.
- **Sort**: rows rank by ascending "В вёрстку"
  (`artToLayoutDate`/`getStageStartDate(·, 'Дизайн и вёрстка')`).
- **Проекты tab Gantt integration**: "Арт Продакшн" resource row is now
  *always* dimmed, with its own факт overlay (rose —
  `bg-rose-600 border-rose-700`, matching `getTaskColor`'s 'red' for this
  stage) driven by `artStartDate` → `artToLayoutDate` (else today,
  growing) — a fourth branch alongside Редактирование/Дизайн-и-вёрстка/
  Девелопмент in the same block.
- **Row numbering** in project lists, **collapsed-projects/collapsed-users
  sort to the bottom** everywhere (footer "sort by release date" button,
  and the employees tab), **task comments** (small popover, rendered via a
  React portal into `document.body` — needed because z-index alone couldn't
  escape the sticky sidebar's stacking context), **nudge-arrow step size**
  matches the current zoom level (day/week/month).
- **Timeline header month bands** (`months` useMemo, `App.tsx`): the band
  width has to match whatever grid the current zoom level actually renders,
  which is **not the same grid at every zoom level** — Day zoom draws one
  column per real day (`days`), but Week/Month zoom draw one column per
  week (`weeks`), so a month band's width there must land on a
  `cellWidth`-multiple to align with week-cell edges, while at Day zoom it
  must land on true calendar-day boundaries. `months` branches on
  `zoomLevel`: `days.forEach(day => addToMonth(day, 1))` at Day zoom (exact
  per-day counts), `weeks.forEach(weekStart => addToMonth(weekStart, 7))`
  otherwise (buckets a whole week into whichever month its Monday falls in
  — correct there since the grid can't sub-divide a week anyway). Before
  this branch existed, the week-bucketing formula ran unconditionally, which
  silently drifted the Day-zoom header out of sync with the day gridlines
  below it whenever a week straddled a month boundary — a real, reproducible
  bug (not a rounding fluke), only visible at Day zoom since Week/Month zoom
  self-consistently used the same week-grained math on both sides. If you
  touch this again, verify at Day zoom specifically, scrolled to a month
  boundary that doesn't fall on a Monday.
- **Month-label left padding** (`pl-3` on the sticky `<div>` inside each
  month band, `App.tsx`): the label is `position: sticky; left: 464` inside
  an `overflow-x-clip` band, so at rest — before scrolling pins it — it sits
  in the band's normal flow position, i.e. flush against the band's own
  left border (the separator line). `pl-3` is what puts a gap between that
  line and the "Месяц Год" text; it has to stay on the *left* side of the
  label, not the right (that was tried first and didn't address what was
  actually being asked).
- **Header "+ Проект"/"+ Сотрудник" button visibility**: before this was
  fixed, the button's label/action was driven purely by `isProjectTab`
  (`'Проект'` when true, `'Сотрудник'` otherwise) with no check on which
  specific tab was active — so it silently showed "+ Сотрудник" (and ran the
  add-user flow) on Редактура-и-вёрстка and the two placeholder tabs too,
  since none of those are `isProjectTab` but aren't the Сотрудники tab
  either. Now gated as `isProjectTab ? activeTab !== 'releases' :
  activeTab === 'users'`: hidden entirely on Релизы (no "+ Проект" there,
  by request) and on Редактура-и-вёрстка/Концептирование-и-арт-продакшн/
  Девелопмент (no "+ Сотрудник" there, by request) — only shown on
  Проекты-family tabs (except Релизы) and on Сотрудники.
- **Team search** (`teamSearch` state, next to `projectSearch`): a second
  search box in the "Команда" column header (only rendered when
  `isProjectTab`, so visible on Проекты/МХИ/Корпы/Прототипы/Релизы/Проекты
  \<year\>, not on Редактура-и-вёрстка or Сотрудники). Matches against every
  `resource.name` on a project, ANDed with the project-name search inside
  `sortedProjects`'s `matchesSearch` — so both boxes narrow the same list
  together, not independently. Lets you type an employee's name and see
  only the projects they're staffed on.
- **Daily automatic backups** (`server.ts`): a `setInterval` tick every 60s
  checks server-local time; the first tick each day at or after **9:00**
  calls `createBackup()`, which snapshots whatever's currently authoritative
  (DB if connected, else the local JSON files) into a `backups` Postgres
  table (`id, created_at, data jsonb`) **and** a local-file mirror
  (`data/backups.json`, same dual-write pattern as projects/users), then
  prunes both down to the newest `MAX_BACKUPS = 7`. `lastBackupDateKey` is
  seeded from the local file's newest entry at startup so a same-day restart
  after 9am doesn't fire a duplicate. No `node-cron` or similar dependency —
  deliberately just a plain interval, to match this file's existing
  roll-your-own style elsewhere. `GET /api/backups` lists `{id, createdAt}`
  metadata only (no payload) for the "Импорт" dropdown; `POST
  /api/backups/:id/restore` replaces **all** current projects/users (DB
  transaction + local files) from that snapshot — the frontend calls
  `window.location.reload()` after a successful restore rather than trying
  to reconcile React state itself, since a local-file rewrite triggers Vite's
  file-watcher full-reload anyway in dev (see the gotcha above), and prod has
  no such watcher to rely on instead.
- **"Импорт" button** (`App.tsx`, header) is no longer a direct file-picker
  trigger — it's now a dropdown (`showBackupsMenu`) listing the last 7
  auto-backups by date (fetched from `/api/backups` on open), each gated
  behind a `window.confirm` before calling the restore endpoint. Like the
  task comment popover, it's rendered through a `createPortal` into `<body>`
  at `position: fixed` coordinates computed from the button
  (`backupsMenuButtonRef`/`backupsMenuPos`, updated on scroll/resize) rather
  than a plain `absolute` child — the header itself sits earlier in the DOM
  than the Gantt timeline's sticky month-band header, which creates its own
  stacking context, so a merely-high `z-index` on a non-portaled dropdown
  still rendered underneath those month bands. Click-outside checks both the
  button and the portaled panel refs, same as the comment popover. The
  original manual-file-upload flow (`fileInputRef` + `handleImportData`) is
  still there too, moved into a "Загрузить файл вручную" row at the bottom
  of that same dropdown rather than removed.
- **Background poll vs. local edits race (fixed).** A 5s `setInterval` in
  `App.tsx` (right after the "Редактура и вёрстка" section's helpers) polls
  `GET /api/projects` + `/api/users` so this tab picks up changes made by
  *other* clients against the shared Postgres backend. Before this fix, it
  had no way to know a *local* edit's save (`syncProjectToServer` /
  `syncUserToServer`, both POST) was still in flight — if the poll's GET
  landed while that POST's write was still being processed, it would read
  pre-edit data and, since it diffs against and then overwrites local state
  (`JSON.stringify` comparison → `setProjects`/`setUsers`), silently revert
  the edit. The revert wasn't permanent — the POST always finished writing
  correctly — but it was visible immediately, which read as "the change
  appeared then disappeared," and looked fixed only after a **manual**
  reload (an unrelated *automatic* full-page reload also happens on every
  write, see the Vite-watches-`data/*.json` note above, but it could fire
  either before or after the poll's clobber, so it didn't reliably mask the
  issue). Fixed with `pendingWritesRef`/`lastWriteSettledAtRef`: every
  mutating request now goes through `trackedFetch` (directly, or via
  `syncProjectToServer`/the new `syncUserToServer` — added to de-duplicate
  what used to be five separate copies of the same raw `fetch('/api/users',
  {method:'POST'...})` block), which increments/decrements a pending-write
  counter and stamps the settle time; the poll's two guard checks (before
  firing its GETs, and again before applying the result) both skip while a
  write is in flight *or* within 2s of one settling. If you add a new
  mutation path, route it through `trackedFetch`/`syncProjectToServer`/
  `syncUserToServer` rather than a bare `fetch(...)` — a bare call bypasses
  this protection and reintroduces the race.

## Testing notes

- A real backup export from the studio (`hw_planner_backup_*.json`, ~135
  projects / 28 users) has been split into `data/projects.json` +
  `data/users.json` and is what the dev server is currently serving — **not
  the small hardcoded `INITIAL_DATA` mock**. If `data/` gets deleted, the
  app falls back to the 2-project mock, which has an inconsistent legacy
  task-label shape (e.g. a `"печать"` task sitting on the Дизайн-и-вёрстка
  resource instead of a dedicated Производство row) — don't debug against
  the mock and assume it reflects how real projects are structured.
- One project named **"Тестовый"** in that data was already there before
  this session touched anything (found it, didn't create it) — leave it
  alone unless the user says otherwise.
- Browser automation gotchas from this session: coordinate-based
  clicks/drags are unreliable across viewport resizes — prefer
  `document.querySelector` + `.click()`/dispatched events via
  `javascript_tool` for anything script-able. A `document.body.innerText`
  check right after a state-changing click frequently reads stale (React
  hasn't re-rendered yet in that same round-trip) — re-query in a second
  call rather than trusting the first "not found".
