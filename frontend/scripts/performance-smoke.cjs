// Real Chromium rendering measurements, without installing a browser dependency.
// node scripts/performance-smoke.cjs [http://localhost:8001]
// The first two runs use the actual API. The populated directory run is labelled
// as mocked: it exercises rendering only and never writes to the real database.
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { mkdtempSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const origin = process.argv[2] || 'http://localhost:8001'
const port = Number(process.env.CDP_PORT || 9226)
const executable = process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const profile = mkdtempSync(join(tmpdir(), 'sportsevo-performance-'))
const browser = spawn(executable, ['--headless=new', '--no-first-run', '--disable-background-networking',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
browser.on('error', (error) => { console.error(error.message); process.exitCode = 1 })
let ws
;(async () => {
  let tabs
  for (let i = 0; i < 60; i++) {
    try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break } catch { await wait(200) }
  }
  assert.ok(tabs, 'Could not start Chromium. Set BROWSER_PATH to your Edge/Chrome executable.')
  ws = new WebSocket(tabs.find((tab) => tab.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }))
  let seq = 0, csrfTest = false, loginAttempts = 0, csrfRefreshes = 0
  const pending = new Map(), errors = [], requests = []
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id) {
      const request = pending.get(message.id)
      if (request) {
        pending.delete(message.id)
        if (message.error) request.reject(message.error)
        else request.resolve(message.result)
      }
    } else if (message.method === 'Runtime.exceptionThrown') {
      errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text)
    } else if (message.method === 'Network.requestWillBeSent') {
      requests.push(message.params.request.url)
    } else if (message.method === 'Fetch.requestPaused') {
      if (csrfTest) {
        const path = new URL(message.params.request.url).pathname
        const isCookie = path.endsWith('/sanctum/csrf-cookie')
        if (isCookie) csrfRefreshes++
        else loginAttempts++
        send('Fetch.fulfillRequest', { requestId: message.params.requestId,
          responseCode: isCookie ? 204 : (loginAttempts === 1 ? 419 : 401),
          responsePhrase: isCookie ? 'No Content' : (loginAttempts === 1 ? 'Page Expired' : 'Unauthorized'),
          responseHeaders: [{ name: 'Content-Type', value: 'application/json' },
            ...(isCookie ? [{ name: 'Set-Cookie', value: 'XSRF-TOKEN=fresh-test-cookie; Path=/; SameSite=Lax' }] : [])],
          body: isCookie ? '' : Buffer.from(JSON.stringify({ message: loginAttempts === 1 ? 'Expired CSRF token' : 'Invalid credentials.' })).toString('base64'),
        }).catch((error) => errors.push(String(error)))
        return
      }
      const sports = [{ id: 1, name: 'Football', slug: 'football' }]
      const complexes = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: `Rendering complex ${i + 1}`,
        location: 'Dhaka', price_per_slot: 100, photos: [], fields: [{ id: i + 1, name: 'Main field', sports }],
        reviews_count: 5, reviews_avg_rating: 4.5 }))
      const data = new URL(message.params.request.url).pathname.endsWith('/sports') ? { sports } : { data: complexes }
      send('Fetch.fulfillRequest', { requestId: message.params.requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        body: Buffer.from(JSON.stringify(data)).toString('base64') }).catch((error) => errors.push(String(error)))
    }
  })
  const evaluate = async (expression) => {
    const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text)
    return response.result.value
  }
  const until = async (expression) => {
    for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await wait(100) }
    throw new Error(`Browser condition timed out: ${expression}\n${JSON.stringify({ loginAttempts, csrfRefreshes, errors,
      body: await evaluate('document.body?.innerText'), recentRequests: requests.slice(-8) })}`)
  }
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable')
  await send('Network.setCacheDisabled', { cacheDisabled: true })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__perf = { lcp: 0, cls: 0, longTasks: [] };
    for (const type of ['largest-contentful-paint', 'layout-shift', 'longtask']) {
      new PerformanceObserver((list) => { for (const entry of list.getEntries()) {
        if (type === 'largest-contentful-paint') window.__perf.lcp = entry.startTime;
        if (type === 'layout-shift' && !entry.hadRecentInput) window.__perf.cls += entry.value;
        if (type === 'longtask') window.__perf.longTasks.push(entry.duration);
      }}).observe({type, buffered:true});
    }
  ` })
  const results = []
  for (const scenario of [
    { name: 'desktop-real-api', width: 1440, height: 900, mobile: false, cpu: 1 },
    { name: 'mobile-real-api', width: 390, height: 844, mobile: true, cpu: 4 },
    { name: 'mobile-12-cards-mocked-api', width: 390, height: 844, mobile: true, cpu: 4, mocked: true },
  ]) {
    if (scenario.mocked) await send('Fetch.enable', { patterns: [{ urlPattern: `${origin}/api/*` }] })
    await send('Emulation.setDeviceMetricsOverride', { width: scenario.width, height: scenario.height,
      deviceScaleFactor: 1, mobile: scenario.mobile })
    await send('Emulation.setCPUThrottlingRate', { rate: scenario.cpu })
    await send('Page.navigate', { url: origin })
    await until('document.body?.innerText.includes("All Sports Complexes") && !document.querySelector(".animate-spin")')
    await wait(800)
    const initial = await evaluate(`({ fcp_ms: performance.getEntriesByName('first-contentful-paint')[0]?.startTime,
      lcp_ms: __perf.lcp, cls: __perf.cls, long_tasks: __perf.longTasks.length,
      longest_task_ms: Math.max(0, ...__perf.longTasks),
      horizontal_overflow: document.documentElement.scrollWidth > innerWidth })`)
    assert.equal(initial.horizontal_overflow, false, `${scenario.name}: horizontal overflow`)
    // Fast typing must stay local until Search is submitted.
    const before = requests.filter((url) => new URL(url).pathname === '/api/turfs').length
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 0, y: 0, button: 'left', clickCount: 1 })
    await evaluate('document.querySelector("input").focus()')
    for (const text of ['D', 'h', 'a', 'k', 'a']) {
      await send('Input.insertText', { text }); await wait(30)
    }
    await wait(350)
    const after = requests.filter((url) => new URL(url).pathname === '/api/turfs').length
    assert.equal(after, before, 'Typing should not fetch on every keystroke')
    await evaluate('document.querySelector("form").requestSubmit()')
    await wait(500)
    assert.equal(requests.filter((url) => new URL(url).pathname === '/api/turfs').length, before + 1)
    const frames = await evaluate(`new Promise((resolve) => {
      const samples = []; let previous; let count = 0;
      const height = document.documentElement.scrollHeight - innerHeight;
      function tick(time) {
        if (previous !== undefined) samples.push(time - previous);
        previous = time; scrollTo(0, height * (0.5 - 0.5 * Math.cos(count / 30)));
        if (++count < 180) requestAnimationFrame(tick);
        else { samples.sort((a,b)=>a-b); resolve({frame_p95_ms:samples[Math.floor(samples.length*.95)],
          frame_max_ms:samples.at(-1), frames_over_50ms:samples.filter(ms=>ms>50).length}); }
      }
      requestAnimationFrame(tick);
    })`)
    results.push({ scenario: scenario.name, cpu_throttle: scenario.cpu, ...initial, ...frames,
      typing_requests: after - before, search_submit_requests: 1 })
  }
  // Exercise a lazy-loaded route against real static assets, without logging in.
  await send('Fetch.disable'); await send('Emulation.setCPUThrottlingRate', { rate: 1 })
  await send('Page.navigate', { url: `${origin}/login` })
  await until('document.querySelector("input[type=password]") !== null')
  csrfTest = true
  await send('Fetch.enable', { patterns: [{ urlPattern: `${origin}/api/*` }] })
  await evaluate('document.cookie="XSRF-TOKEN=stale-test-cookie; Path=/"; document.querySelector("input[type=email]").focus()')
  await send('Input.insertText', { text: 'probe@example.invalid' })
  await evaluate('document.querySelector("input[type=password]").focus()')
  await send('Input.insertText', { text: 'not-a-real-password' })
  await evaluate('document.querySelector("form").requestSubmit()')
  await until('document.body?.innerText.includes("Invalid credentials.")')
  assert.equal(csrfRefreshes, 1, 'Expired CSRF cookie must be refreshed, even if a stale cookie exists')
  assert.equal(loginAttempts, 2, 'CSRF failures must retry exactly once')
  assert.deepEqual(errors, [], 'Unhandled browser exceptions')
  console.log(JSON.stringify({ browser: 'Headless Edge', url: origin, cache: 'disabled',
    results, lazy_login_route: 'passed', expired_csrf_retry: 'passed (mocked 419/401, no real login attempt)',
    unhandled_exceptions: errors, profile }, null, 2))
  await send('Browser.close')
})().catch((error) => { console.error(error); process.exitCode = 1 })
  .finally(() => { ws?.close(); browser.kill() })
