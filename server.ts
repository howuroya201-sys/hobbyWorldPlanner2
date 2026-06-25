import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

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

  const INITIAL_USERS = [
    { id: 'u1', name: 'Владимир Грачев', imageUrl: 'https://i.pravatar.cc/150?u=u1', roles: ['Продюсер'] },
    { id: 'u2', name: 'Матвей Чистяков', imageUrl: 'https://i.pravatar.cc/150?u=u2', roles: ['Девелопер'] },
    { id: 'u3', name: 'Наталья Кондратюк', imageUrl: 'https://i.pravatar.cc/150?u=u3', roles: ['Арт-директор'] },
    { id: 'u4', name: 'Анна Давыдова', imageUrl: 'https://i.pravatar.cc/150?u=u4', roles: ['Редактор'] },
    { id: 'u5', name: 'Юлия Калиновская', imageUrl: 'https://i.pravatar.cc/150?u=u5', roles: ['Верстальщик'] },
    { id: 'u6', name: 'Артем Шорохов', imageUrl: 'https://i.pravatar.cc/150?u=u6', roles: ['Продюсер', 'Арт-директор'] },
    { id: 'u7', name: 'Сергей Притула', imageUrl: 'https://i.pravatar.cc/150?u=u7', roles: ['Девелопер'] },
  ];

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
                  ssl: { rejectUnauthorized: false }
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
        ssl: { rejectUnauthorized: false }
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
      const client = await pool.connect();
      await client.query("SELECT NOW()");
      client.release();
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

  // Database initialization on startup
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
  if (process.env.NODE_ENV !== "production") {
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
