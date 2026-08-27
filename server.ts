import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  console.log("=== Server Starting ===");
  console.log("Node version:", process.version);
  console.log("Environment Variables:");
  Object.keys(process.env).forEach(key => {
    const isSensitive = key.includes("KEY") || key.includes("PASSWORD") || key.includes("SECRET") || key.includes("TOKEN") || key.includes("URL");
    console.log(`  ${key}: ${isSensitive ? "[HIDDEN]" : process.env[key]}`);
  });
  console.log("=======================");

  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(express.json({ limit: '10mb' }));

  // Logging middleware to debug health checks and incoming requests in Timeweb Cloud
  app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Incoming request: ${req.method} ${req.url} (from ${req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress}) - UA: ${req.headers['user-agent']}`);
    next();
  });

  // Dedicated health check endpoints (placed before static files and database APIs to guarantee 200 OK instantly)
  app.get(["/health", "/healthcheck", "/ping", "/api/health"], (req, res) => {
    res.status(200).json({
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      env: {
        node_env: process.env.NODE_ENV,
        port: PORT
      }
    });
  });

  // Create local storage directory and helper functions
  let DATA_DIR = path.join(process.cwd(), "data");
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn(`Failed to create local data directory at ${DATA_DIR}, falling back to /tmp/data:`, err);
    DATA_DIR = path.join("/tmp", "data");
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
    } catch (tmpErr) {
      console.error("Critical: Failed to create fallback /tmp/data directory:", tmpErr);
    }
  }

  const USERS_FILE = path.join(DATA_DIR, "users.json");
  const PROJECTS_FILE = path.join(DATA_DIR, "projects.json");

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

  const INITIAL_USERS = [
    { id: 'u1', name: 'Владимир Грачев', imageUrl: 'https://i.pravatar.cc/150?u=u1', roles: ['Продюсер'] },
    { id: 'u2', name: 'Матвей Чистяков', imageUrl: 'https://i.pravatar.cc/150?u=u2', roles: ['Девелопер'] },
    { id: 'u3', name: 'Наталья Кондратюк', imageUrl: 'https://i.pravatar.cc/150?u=u3', roles: ['Арт-директор'] },
    { id: 'u4', name: 'Анна Давыдова', imageUrl: 'https://i.pravatar.cc/150?u=u4', roles: ['Редактор'] },
    { id: 'u5', name: 'Юлия Калиновская', imageUrl: 'https://i.pravatar.cc/150?u=u5', roles: ['Верстальщик'] },
    { id: 'u6', name: 'Артем Шорохов', imageUrl: 'https://i.pravatar.cc/150?u=u6', roles: ['Продюсер', 'Арт-директор'] },
    { id: 'u7', name: 'Сергей Притула', imageUrl: 'https://i.pravatar.cc/150?u=u7', roles: ['Девелопер'] },
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

  function readLocalUsers(): any[] {
    if (!fs.existsSync(USERS_FILE)) {
      return INITIAL_USERS;
    }
    try {
      return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    } catch (err) {
      console.warn("Failed to read local users:", err);
      return INITIAL_USERS;
    }
  }

  function writeLocalUsers(users: any[]) {
    try {
      fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
    } catch (err) {
      console.warn("Failed to write local users:", err);
    }
  }

  function readLocalProjects(): any[] {
    if (!fs.existsSync(PROJECTS_FILE)) {
      return [];
    }
    try {
      return JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf-8'));
    } catch (err) {
      console.warn("Failed to read local projects:", err);
      return [];
    }
  }

  function writeLocalProjects(projects: any[]) {
    try {
      fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2), 'utf-8');
    } catch (err) {
      console.warn("Failed to write local projects:", err);
    }
  }

  // Daily automatic backups (9am) — see initializeAutoBackupSchedule below.
  // Local file is a fallback mirror of the "backups" DB table, same dual-write
  // pattern as projects/users, capped to the newest MAX_BACKUPS entries.
  const BACKUPS_FILE = path.join(DATA_DIR, "backups.json");
  const MAX_BACKUPS = 7;

  function readLocalBackups(): any[] {
    if (!fs.existsSync(BACKUPS_FILE)) return [];
    try {
      return JSON.parse(fs.readFileSync(BACKUPS_FILE, 'utf-8'));
    } catch (err) {
      console.warn("Failed to read local backups:", err);
      return [];
    }
  }

  function writeLocalBackups(backups: any[]) {
    try {
      fs.writeFileSync(BACKUPS_FILE, JSON.stringify(backups, null, 2), 'utf-8');
    } catch (err) {
      console.warn("Failed to write local backups:", err);
    }
  }

  // Shared pool instance and database connection state
  let sharedPool: pg.Pool | null = null;
  let isDbConnected = false;
  let dbConnectionError: string | null = null;

  const getPool = () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString || connectionString.includes('user:password')) {
      return null;
    }
    if (!sharedPool) {
      try {
        // Parse the connection string manually to extract raw password without URL decoding/parsing issues
        const protocolMatch = connectionString.match(/^([^:]+):\/\//);
        if (protocolMatch) {
          const protocol = protocolMatch[1];
          const rest = connectionString.substring(protocolMatch[0].length);
          const lastAtIndex = rest.lastIndexOf('@');
          if (lastAtIndex !== -1) {
            const credentials = rest.substring(0, lastAtIndex);
            const hostInfo = rest.substring(lastAtIndex + 1);
            
            const colonIndex = credentials.indexOf(':');
            if (colonIndex !== -1) {
              const user = credentials.substring(0, colonIndex);
              const rawPassword = credentials.substring(colonIndex + 1);
              let password = rawPassword;
              try {
                // If the password contains % characters, decode it to get the real password
                password = decodeURIComponent(rawPassword);
              } catch (e) {
                // Ignore decoding error, use raw as-is
              }

              const slashIndex = hostInfo.indexOf('/');
              if (slashIndex !== -1) {
                const hostAndPort = hostInfo.substring(0, slashIndex);
                let database = hostInfo.substring(slashIndex + 1);
                // Strip any query parameters (like ?sslmode=...) from the database name
                if (database.includes('?')) {
                  database = database.split('?')[0];
                }

                let host = hostAndPort;
                let port = 5432;
                const portColonIndex = hostAndPort.lastIndexOf(':');
                if (portColonIndex !== -1) {
                  host = hostAndPort.substring(0, portColonIndex);
                  const parsedPort = parseInt(hostAndPort.substring(portColonIndex + 1), 10);
                  if (!isNaN(parsedPort)) {
                    port = parsedPort;
                  }
                }

                sharedPool = new pg.Pool({
                  user,
                  password,
                  host,
                  port,
                  database,
                  ssl: { rejectUnauthorized: false },
                  connectionTimeoutMillis: 5000
                });
                console.log("Database connection pool created using parsed config.");
                return sharedPool;
              }
            }
          }
        }
      } catch (e) {
        console.warn("Failed to parse DATABASE_URL manually, falling back to direct string:", e);
      }

      // Fallback
      sharedPool = new pg.Pool({
        connectionString,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000
      });
    }
    return sharedPool;
  };

  async function checkDbConnection(): Promise<boolean> {
    const pool = getPool();
    if (!pool) {
      isDbConnected = false;
      dbConnectionError = "DATABASE_URL не настроена";
      return false;
    }
    try {
      // Hard app-level deadline on top of connectionTimeoutMillis: some
      // network conditions (e.g. a black-holed host) can keep the socket
      // open well past the pg client's own timeout, which would otherwise
      // hang this check — and with it every request that awaits it,
      // including /api/db-status that the frontend blocks its loading
      // screen on — indefinitely.
      const connectOrTimeout = Promise.race([
        pool.connect(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Database connection timed out")), 5000)
        )
      ]);
      const client = await connectOrTimeout;
      try {
        await client.query("SELECT NOW()");
      } finally {
        client.release();
      }
      isDbConnected = true;
      dbConnectionError = null;
      return true;
    } catch (err) {
      isDbConnected = false;
      dbConnectionError = err instanceof Error ? err.message : "Ошибка подключения";
      console.warn("Database connection is currently unavailable. Using local fallback.");
      return false;
    }
  }

  // Database initialization on startup (asynchronous, non-blocking to pass health checks immediately)
  async function initializeDbAsync() {
    console.log("Initializing database connection in the background...");
    await checkDbConnection();
    if (isDbConnected) {
      const pool = getPool();
      if (pool) {
        try {
          await pool.query(`
            CREATE TABLE IF NOT EXISTS projects (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              status TEXT NOT NULL,
              data JSONB NOT NULL
            );
            CREATE TABLE IF NOT EXISTS users (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              data JSONB NOT NULL
            );
            CREATE TABLE IF NOT EXISTS backups (
              id TEXT PRIMARY KEY,
              created_at TIMESTAMPTZ NOT NULL,
              data JSONB NOT NULL
            );
          `);
          console.log("Database tables initialized successfully.");

          // Check if users table is empty to seed it
          const userCountResult = await pool.query("SELECT COUNT(*) FROM users");
          const userCount = parseInt(userCountResult.rows[0].count);
          
          if (userCount === 0) {
            console.log("Seeding initial users to database...");
            for (const user of INITIAL_USERS) {
              await pool.query(
                "INSERT INTO users (id, name, data) VALUES ($1, $2, $3)",
                [user.id, user.name, JSON.stringify(user)]
              );
            }
            console.log("Database seeding complete.");
          }
        } catch (err) {
          console.warn("Database initialization query failed. Switching to local fallback:", err);
          isDbConnected = false;
          dbConnectionError = err instanceof Error ? err.message : "Schema creation failed";
        }
      }
    } else {
      console.log("Starting server with local JSON database fallback.");
    }
  }

  // Start background database initialization
  initializeDbAsync().catch((err) => {
    console.error("Unhandled error during background database initialization:", err);
  });

  // --- Daily automatic backups ---
  // Snapshots whatever is currently authoritative (DB if connected, else the
  // local JSON files) and stores it as a new backup, then prunes down to the
  // newest MAX_BACKUPS — both in the "backups" table and in the local mirror
  // file, mirroring the dual-write pattern used for projects/users above.
  async function getCurrentProjectsAndUsers(): Promise<{ projects: any[]; users: any[] }> {
    if (isDbConnected) {
      const pool = getPool();
      if (pool) {
        try {
          const [projectsResult, usersResult] = await Promise.all([
            pool.query("SELECT data FROM projects"),
            pool.query("SELECT data FROM users"),
          ]);
          return {
            projects: projectsResult.rows.map((r) => r.data),
            users: usersResult.rows.map((r) => r.data),
          };
        } catch (err) {
          console.warn("Failed to read current data from database for backup, falling back to local files:", err);
        }
      }
    }
    return { projects: readLocalProjects(), users: readLocalUsers() };
  }

  async function createBackup(): Promise<{ id: string; createdAt: string }> {
    const { projects, users } = await getCurrentProjectsAndUsers();
    const id = `backup_${Date.now()}`;
    const createdAt = new Date().toISOString();

    const localBackups = readLocalBackups();
    localBackups.unshift({ id, createdAt, projects, users });
    writeLocalBackups(localBackups.slice(0, MAX_BACKUPS));

    if (isDbConnected) {
      const pool = getPool();
      if (pool) {
        try {
          await pool.query(
            "INSERT INTO backups (id, created_at, data) VALUES ($1, $2, $3)",
            [id, createdAt, JSON.stringify({ projects, users })]
          );
          // Prune anything past the newest MAX_BACKUPS rows.
          await pool.query(
            `DELETE FROM backups WHERE id IN (
               SELECT id FROM backups ORDER BY created_at DESC OFFSET $1
             )`,
            [MAX_BACKUPS]
          );
        } catch (err) {
          console.warn("Failed to save backup to database:", err);
        }
      }
    }

    console.log(`[Backup] Created ${id} at ${createdAt}`);
    return { id, createdAt };
  }

  // Fires once per calendar day, at or after 9am server-local time. Tracks
  // the last backup's date (seeded from the newest stored backup at startup,
  // local-file-only since this runs before the DB connection settles) so a
  // process restart on the same day after 9am doesn't create a duplicate.
  function dateKeyOf(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function initializeAutoBackupSchedule() {
    const AUTO_BACKUP_HOUR = 9;
    const existing = readLocalBackups();
    let lastBackupDateKey = existing.length > 0 ? dateKeyOf(new Date(existing[0].createdAt)) : null;

    setInterval(() => {
      const now = new Date();
      const todayKey = dateKeyOf(now);
      if (now.getHours() >= AUTO_BACKUP_HOUR && lastBackupDateKey !== todayKey) {
        lastBackupDateKey = todayKey;
        createBackup().catch((err) => console.error("Scheduled backup failed:", err));
      }
    }, 60 * 1000);

    console.log(`[Backup] Auto-backup scheduler started (daily at ${AUTO_BACKUP_HOUR}:00 server time, keeping last ${MAX_BACKUPS}).`);
  }

  initializeAutoBackupSchedule();

  // List available backups (metadata only — id + timestamp, not the full
  // snapshot payload, so the "Импорт" dropdown can render this cheaply).
  app.get("/api/backups", async (req, res) => {
    if (isDbConnected) {
      const pool = getPool();
      if (pool) {
        try {
          const result = await pool.query(
            "SELECT id, created_at FROM backups ORDER BY created_at DESC LIMIT $1",
            [MAX_BACKUPS]
          );
          return res.json(result.rows.map((r) => ({ id: r.id, createdAt: r.created_at })));
        } catch (err) {
          console.warn("Failed to list backups from database, falling back to local:", err);
        }
      }
    }
    const localBackups = readLocalBackups();
    res.json(localBackups.map((b) => ({ id: b.id, createdAt: b.createdAt })));
  });

  // Restore a backup: replaces ALL current projects/users, in both the
  // database (if connected) and the local fallback files, from that
  // snapshot. The frontend is expected to reload after this succeeds.
  app.post("/api/backups/:id/restore", async (req, res) => {
    const { id } = req.params;
    let snapshot: { projects: any[]; users: any[] } | null = null;

    if (isDbConnected) {
      const pool = getPool();
      if (pool) {
        try {
          const result = await pool.query("SELECT data FROM backups WHERE id = $1", [id]);
          if (result.rows.length > 0) {
            snapshot = result.rows[0].data;
          }
        } catch (err) {
          console.warn("Failed to load backup from database, falling back to local:", err);
        }
      }
    }

    if (!snapshot) {
      const found = readLocalBackups().find((b) => b.id === id);
      if (found) snapshot = { projects: found.projects, users: found.users };
    }

    if (!snapshot) {
      return res.status(404).json({ success: false, error: "Backup not found" });
    }

    writeLocalProjects(snapshot.projects);
    writeLocalUsers(snapshot.users);

    if (isDbConnected) {
      const pool = getPool();
      if (pool) {
        try {
          const client = await pool.connect();
          try {
            await client.query("BEGIN");
            await client.query("DELETE FROM projects");
            await client.query("DELETE FROM users");
            for (const project of snapshot.projects) {
              await client.query(
                "INSERT INTO projects (id, name, status, data) VALUES ($1, $2, $3, $4)",
                [project.id, project.name, project.status || "active", JSON.stringify(project)]
              );
            }
            for (const user of snapshot.users) {
              await client.query(
                "INSERT INTO users (id, name, data) VALUES ($1, $2, $3)",
                [user.id, user.name, JSON.stringify(user)]
              );
            }
            await client.query("COMMIT");
          } catch (err) {
            await client.query("ROLLBACK");
            throw err;
          } finally {
            client.release();
          }
        } catch (err) {
          console.warn("Failed to restore backup to database (local files were still restored):", err);
          return res.json({ success: true, mode: "local-only" });
        }
      }
    }

    res.json({ success: true });
  });

  // Database status endpoint
  app.get("/api/db-status", async (req, res) => {
    await checkDbConnection();
    if (isDbConnected) {
      res.json({ connected: true, message: "Подключено к PostgreSQL" });
    } else {
      res.json({ 
        connected: false, 
        message: `Используется локальное файловое хранилище. PostgreSQL недоступен (${dbConnectionError || "ошибка авторизации/подключения"})` 
      });
    }
  });

  // API for users
  app.get("/api/users", async (req, res) => {
    if (!isDbConnected) {
      return res.json(readLocalUsers());
    }
    const pool = getPool();
    if (!pool) return res.json(readLocalUsers());
    try {
      const result = await pool.query("SELECT data FROM users");
      return res.json(result.rows.map(row => row.data));
    } catch (err) {
      console.warn("Database users fetch failed, falling back to local storage:", err);
      isDbConnected = false;
      dbConnectionError = err instanceof Error ? err.message : "Query failed";
      return res.json(readLocalUsers());
    }
  });

  app.post("/api/users", async (req, res) => {
    const user = req.body;
    // Always sync local storage file as a robust fallback
    const localUsers = readLocalUsers();
    const index = localUsers.findIndex(u => u.id === user.id);
    if (index >= 0) {
      localUsers[index] = user;
    } else {
      localUsers.push(user);
    }
    writeLocalUsers(localUsers);

    if (!isDbConnected) {
      return res.json({ success: true, mode: "local" });
    }

    const pool = getPool();
    if (!pool) return res.json({ success: true, mode: "local" });

    try {
      await pool.query(
        "INSERT INTO users (id, name, data) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET name = $2, data = $3",
        [user.id, user.name, JSON.stringify(user)]
      );
      res.json({ success: true, mode: "database" });
    } catch (err) {
      console.warn("Database user save failed, fallback to local storage:", err);
      isDbConnected = false;
      dbConnectionError = err instanceof Error ? err.message : "Query failed";
      res.json({ success: true, mode: "local" });
    }
  });

  app.delete("/api/users/:id", async (req, res) => {
    const { id } = req.params;
    const localUsers = readLocalUsers();
    const filtered = localUsers.filter(u => u.id !== id);
    writeLocalUsers(filtered);

    if (!isDbConnected) {
      return res.json({ success: true, mode: "local" });
    }

    const pool = getPool();
    if (!pool) return res.json({ success: true, mode: "local" });

    try {
      await pool.query("DELETE FROM users WHERE id = $1", [id]);
      res.json({ success: true, mode: "database" });
    } catch (err) {
      console.warn("Database user delete failed, fallback to local storage:", err);
      isDbConnected = false;
      dbConnectionError = err instanceof Error ? err.message : "Query failed";
      res.json({ success: true, mode: "local" });
    }
  });

  // API to get projects
  app.get("/api/projects", async (req, res) => {
    if (!isDbConnected) {
      return res.json(readLocalProjects());
    }
    const pool = getPool();
    if (!pool) return res.json(readLocalProjects());
    try {
      const result = await pool.query("SELECT data FROM projects");
      return res.json(result.rows.map(row => row.data));
    } catch (err) {
      console.warn("Database projects fetch failed, falling back to local storage:", err);
      isDbConnected = false;
      dbConnectionError = err instanceof Error ? err.message : "Query failed";
      return res.json(readLocalProjects());
    }
  });

  // API to save/update project
  app.post("/api/projects", async (req, res) => {
    const project = req.body;
    // Always sync local storage file as a robust fallback
    const localProjects = readLocalProjects();
    const index = localProjects.findIndex(p => p.id === project.id);
    if (index >= 0) {
      localProjects[index] = project;
    } else {
      localProjects.push(project);
    }
    writeLocalProjects(localProjects);

    if (!isDbConnected) {
      return res.json({ success: true, mode: "local" });
    }

    const pool = getPool();
    if (!pool) return res.json({ success: true, mode: "local" });

    try {
      await pool.query(
        `INSERT INTO projects (id, name, status, data) 
         VALUES ($1, $2, $3, $4) 
         ON CONFLICT (id) 
         DO UPDATE SET name = $2, status = $3, data = $4`,
        [project.id, project.name, project.status || 'active', JSON.stringify(project)]
      );
      res.json({ success: true, mode: "database" });
    } catch (err) {
      console.warn("Database project save failed, fallback to local storage:", err);
      isDbConnected = false;
      dbConnectionError = err instanceof Error ? err.message : "Query failed";
      res.json({ success: true, mode: "local" });
    }
  });

  // API to delete project
  app.delete("/api/projects/:id", async (req, res) => {
    const { id } = req.params;
    const localProjects = readLocalProjects();
    const filtered = localProjects.filter(p => p.id !== id);
    writeLocalProjects(filtered);

    if (!isDbConnected) {
      return res.json({ success: true, mode: "local" });
    }

    const pool = getPool();
    if (!pool) return res.json({ success: true, mode: "local" });

    try {
      await pool.query("DELETE FROM projects WHERE id = $1", [id]);
      res.json({ success: true, mode: "database" });
    } catch (err) {
      console.warn("Database project delete failed, fallback to local storage:", err);
      isDbConnected = false;
      dbConnectionError = err instanceof Error ? err.message : "Query failed";
      res.json({ success: true, mode: "local" });
    }
  });

  // Vite middleware for development or static serving for production
  const isProd = process.env.NODE_ENV === "production" || fs.existsSync(path.join(process.cwd(), "dist", "index.html"));
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Listen on multiple common ports to ensure connectivity in any cloud environment (Timeweb Cloud, etc.)
  // regardless of port mapping configuration in the hosting panel.
  const portsToListen = Array.from(new Set([
    PORT,
    80,
    8080,
    3000
  ]));

  console.log(`Attempting to start servers on ports: ${portsToListen.join(", ")}`);

  portsToListen.forEach((port) => {
    try {
      const server = app.listen(port, "0.0.0.0", () => {
        console.log(`[SUCCESS] Server is listening on 0.0.0.0:${port}`);
      });
      
      server.on("error", (err: any) => {
        console.warn(`[WARNING] Could not start server on port ${port}: ${err.message}`);
      });
    } catch (err: any) {
      console.warn(`[ERROR] Exception while starting server on port ${port}:`, err);
    }
  });
}

startServer();
