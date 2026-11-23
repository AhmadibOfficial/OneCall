const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFile, mkdtemp, rm, writeFile } = require('node:fs/promises');
const { spawn } = require('node:child_process');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const delay = (ms) => new Promise((done) => setTimeout(done, ms));

test(
  'management navigation stays usable during requests and late results cannot replace the current area',
  { timeout: 30000 },
  async () => {
    const root = resolve(__dirname, '../admin-web');
    const fixtures = {
      'auth/login': {
        accessToken: 'synthetic-browser-token',
        refreshToken: 'synthetic-refresh',
      },
      'management/session': {
        uid: '1234567890',
        name: 'Test Operator',
        permissions: ['*'],
      },
      'management/overview': {
        asOf: new Date().toISOString(),
        unassigned: 7,
        overdue: 2,
        pendingProviders: 1,
        unresolved: 3,
        overdueCases: 1,
        pendingAgents: 0,
        pendingRoutes: 1,
      },
      'admin/operations/catalogue': {
        states: ['Kaduna'],
        services: [{ key: 'plumbing', name: 'Plumbing' }],
      },
      'admin/operations/providers': { items: [], total: 0, page: 1 },
      'management/customers': {
        items: [
          {
            id: 'customer-record',
            uid: '2345678901',
            firstName: 'Synthetic',
            lastName: 'Customer',
            email: 'customer@example.com',
            status: 'ACTIVE',
          },
        ],
        total: 1,
        page: 1,
      },
    };
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname.startsWith('/api/v1/')) {
        const path = url.pathname.slice('/api/v1/'.length);
        if (path === 'admin/operations/catalogue') await delay(900);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(fixtures[path] ?? {}));
        return;
      }
      const name = url.pathname.split('/').pop() || 'index.html';
      if (
        ![
          'index.html',
          'app.js',
          'operations.js',
          'management.js',
          'parcels.js',
          'style.css',
        ].includes(name)
      ) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.setHeader(
        'Content-Type',
        name.endsWith('.js')
          ? 'text/javascript'
          : name.endsWith('.css')
            ? 'text/css'
            : 'text/html',
      );
      res.end(await readFile(join(root, name)));
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    const directory = await mkdtemp(
      join(tmpdir(), 'onecall-management-browser-'),
    );
    const browser = spawn(
      process.env.CHROME_BIN || 'chromium',
      [
        '--headless',
        '--no-sandbox',
        '--disable-gpu',
        '--remote-debugging-port=0',
        '--user-data-dir=' + directory,
        'about:blank',
      ],
      { stdio: 'ignore' },
    );
    let socket;
    const pending = new Map();
    let sequence = 0;
    try {
      let port;
      for (let i = 0; i < 100; i++) {
        try {
          port = (
            await readFile(join(directory, 'DevToolsActivePort'), 'utf8')
          ).split('\n')[0];
          break;
        } catch {
          await delay(50);
        }
      }
      assert.ok(port, 'Browser debugging endpoint started');
      const target = await (
        await fetch(
          'http://127.0.0.1:' +
            port +
            '/json/new?' +
            encodeURIComponent(
              'http://127.0.0.1:' + server.address().port + '/management/',
            ),
          { method: 'PUT' },
        )
      ).json();
      socket = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise((done, reject) => {
        socket.onopen = done;
        socket.onerror = reject;
      });
      socket.onmessage = (event) => {
        const result = JSON.parse(event.data);
        if (result.id) {
          const task = pending.get(result.id);
          pending.delete(result.id);
          if (result.error) task.reject(new Error(result.error.message));
          else task.resolve(result.result);
        }
      };
      const call = (method, params = {}) =>
        new Promise((resolve, reject) => {
          const id = ++sequence;
          pending.set(id, { resolve, reject });
          socket.send(JSON.stringify({ id, method, params }));
        });
      const evaluate = async (expression) => {
        const r = await call('Runtime.evaluate', {
          expression,
          returnByValue: true,
          awaitPromise: true,
        });
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
        return r.result.value;
      };
      async function until(expression) {
        for (let i = 0; i < 100; i++) {
          if (await evaluate(expression)) return;
          await delay(50);
        }
        assert.fail('Timed out: ' + expression);
      }
      await until("!!document.getElementById('login-form')");
      await evaluate(
        "document.getElementById('email').value='operator@example.com';document.getElementById('password').value='Synthetic2026!';document.getElementById('login-form').requestSubmit();true",
      );
      await until(
        "!document.getElementById('workspace').hidden && document.getElementById('content').textContent.includes('Unassigned bookings')",
      );
      assert.equal(
        await evaluate(
          "document.querySelectorAll('#navigation button').length",
        ),
        11,
      );
      await evaluate(
        "document.querySelector('[data-view=providers]').click();true",
      );
      await evaluate(
        "document.querySelector('[data-view=customers]').click();true",
      );
      await until(
        "document.getElementById('content').textContent.includes('Synthetic Customer')",
      );
      await delay(1200);
      assert.equal(
        await evaluate("document.getElementById('page-title').textContent"),
        'Customer Management',
      );
      assert.ok(
        await evaluate(
          "document.getElementById('content').textContent.includes('Synthetic Customer')",
        ),
      );
      assert.equal(
        await evaluate(
          "document.querySelector('[data-view=customers]').getAttribute('aria-current')",
        ),
        'page',
      );
      await call('Emulation.setDeviceMetricsOverride', {
        width: 390,
        height: 844,
        deviceScaleFactor: 1,
        mobile: true,
      });
      assert.equal(
        await evaluate('document.documentElement.scrollWidth <= innerWidth'),
        true,
      );
      if (process.env.ONECALL_UI_SCREENSHOT) {
        const shot = await call('Page.captureScreenshot', { format: 'png' });
        await writeFile(
          process.env.ONECALL_UI_SCREENSHOT,
          Buffer.from(shot.data, 'base64'),
        );
      }
      await evaluate("document.getElementById('logout').click();true");
      assert.equal(
        await evaluate("document.getElementById('workspace').hidden"),
        true,
      );
      assert.equal(await evaluate('localStorage.length'), 0);
    } finally {
      socket?.close();
      browser.kill('SIGTERM');
      await new Promise((done) => server.close(done));
      // Only the temporary browser profile created by this test is removed.
      await rm(directory, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
    }
  },
);
