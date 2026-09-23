import express from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import {
  compileCode,
  runProgram,
  checkCompilationStatus,
  getRuntimesInfo,
} from './server/compiler.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

app.use(express.json({ limit: '2mb' }));

// Health / Status endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// System compilers version endpoint
app.get('/api/runtimes', (req, res) => {
  try {
    const runtimes = getRuntimesInfo();
    res.json({ success: true, runtimes });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Compile endpoint: FR-04, FR-05, FR-06
app.post('/api/compile', async (req, res) => {
  try {
    const { language, code, sessionId } = req.body;

    if (!language || typeof code !== 'string') {
      res.status(400).json({
        success: false,
        message: 'Invalid request: language and code are required.',
      });
      return;
    }

    const sid = sessionId || 'default_student_session';
    const result = await compileCode(language, code, sid);

    res.json(result);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: `Internal server error during compilation: ${error.message}`,
      rawOutput: error.stack || error.message,
      errors: [{ message: error.message, raw: '', type: 'error' }],
      warnings: [],
      compilationTimeMs: 0,
      codeHash: '',
    });
  }
});

// Check compile status endpoint
app.post('/api/check-status', (req, res) => {
  try {
    const { language, code, sessionId } = req.body;
    const sid = sessionId || 'default_student_session';
    const status = checkCompilationStatus(sid, code || '', language || 'cpp');
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ canRun: false, reason: error.message });
  }
});

// Run endpoint: FR-07, FR-08, FR-09, FR-10
app.post('/api/run', async (req, res) => {
  try {
    const { language, code, input, sessionId, forceRecompile } = req.body;

    if (!language || typeof code !== 'string') {
      res.status(400).json({
        success: false,
        output: '',
        error: 'Invalid request: language and code are required.',
      });
      return;
    }

    const sid = sessionId || 'default_student_session';
    const result = await runProgram(
      language,
      code,
      input || '',
      sid,
      Boolean(forceRecompile)
    );

    res.json(result);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      output: '',
      error: `Internal server execution error: ${error.message}`,
      executionTimeMs: 0,
      exitCode: 1,
      timedOut: false,
    });
  }
});

// Mount Vite or serve static
async function startServer() {
  if (!isProd) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });

    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Student Online Code Compiler server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
