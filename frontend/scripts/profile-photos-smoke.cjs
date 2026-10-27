// Browser checks with intercepted APIs: no accounts, fields, files or emails are written to the real backend.
// node scripts/profile-photos-smoke.cjs [http://localhost:8001]
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { mkdtempSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const origin = process.argv[2] || 'http://localhost:8001'
const port = Number(process.env.CDP_PORT || 9227)
const profile = mkdtempSync(join(tmpdir(), 'sportsevo-profile-photos-'))
const browser = spawn(process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ['--headless=new', '--no-first-run', '--disable-background-networking', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'],
  { windowsHide: true, stdio: 'ignore' })
const wait = (ms) => new Promise((done) => setTimeout(done, ms))
let ws, me = { id: 1, name: 'Test owner', email: 'owner@example.invalid', phone: '', role: 'turf' }
const sports = [{ id: 1, name: 'Football', slug: 'football' }]
const field = { id: 1, name: 'Pitch one', price_per_slot: 100, sports, photos: [] }
let turf = { id: 1, name: 'Test complex', email: me.email, phone: '', location: 'Dhaka', commission_rate: 10,
  is_approved: true, fields: [field], deletion_request: null }
const uploads = [], errors = []
const reports = []
const sportSearches = []
;(async () => {
  let tabs
  for (let i = 0; i < 60; i++) {
    try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break } catch { await wait(200) }
  }
  assert.ok(tabs, 'Could not start browser')
  ws = new WebSocket(tabs.find((tab) => tab.type === 'page').webSocketDebuggerUrl)
  await new Promise((done) => ws.addEventListener('open', done, { once: true }))
  const pending = new Map()
  let seq = 0
  const send = (method, params = {}) => new Promise((resolvePromise, reject) => {
    const id = ++seq
    pending.set(id, { resolve: resolvePromise, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id) {
      const task = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) task?.reject(message.error)
      else task?.resolve(message.result)
      return
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text)
    if (message.method !== 'Fetch.requestPaused') return
    const { request, requestId } = message.params
    const path = new URL(request.url).pathname
    let data = {}, status = 200
    if (path === '/api/me') data = { user: me }
    else if (path === '/api/my-turf') { if (request.method === 'PUT') turf = { ...turf, ...JSON.parse(request.postData) }; data = { turf, message: 'Complex updated.' } }
    else if (path === '/api/reports' || path === '/api/admin/reports') {
      if (request.method === 'POST') { reports.unshift({ id: reports.length + 1, ...JSON.parse(request.postData), status: 'open', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user: { name: me.name, role: { name: me.role } } }); status = 201; data = { message: 'Report sent to the platform admins.' } }
      else data = { data: reports, last_page: 1 }
    }
    else if (path.startsWith('/api/admin/reports/') && request.method === 'PATCH') { Object.assign(reports.find((report) => report.id === Number(path.split('/').pop())), JSON.parse(request.postData), { updated_at: new Date().toISOString() }); data = { message: 'Report updated.' } }
    else if (path === '/api/dashboard/user') data = { stats: { totalBookings: 0, pendingRequests: 0, completed: 0 }, upcoming: [], requests: [], past: [] }
    else if (path === '/api/turfs/1') data = { turf: { ...turf, reviews: [], fields: turf.fields.map((entry, i) => i === 0 ? { ...entry, photos: Array.from({ length: 3 }, (_, index) => ({ id: index + 1, url: '/favicon.svg' })) } : entry) } }
    else if (path.endsWith('/slots')) data = { slots: [] }
    else if (path === '/api/sports') data = { sports }
    else if (path === '/api/dashboard/turf') { data = turf ? { turf, timezone: 'Asia/Dhaka', wallet: { balance: 0, entries: [], refunds: [] }, requests: [] } : { message: 'No complex yet.' }; status = turf ? 200 : 404 }
    else if (path === '/api/profile' && request.method === 'PATCH') {
      me = { ...me, ...JSON.parse(request.postData) }
      data = { message: 'Profile updated.', user: me }
    } else if (request.method === 'POST' && ['/api/turfs/1/photos', '/api/turfs/1/fields', '/api/turfs'].includes(path)) {
      const contentType = Object.entries(request.headers).find(([key]) => key.toLowerCase() === 'content-type')?.[1] || ''
      uploads.push({ path, contentType, body: request.postData || '' })
      const uploadedField = { ...field, photos: [{ id: uploads.length, url: '/favicon.svg' }] }
      if (path === '/api/turfs') turf = { id: 1, name: 'New complex', email: me.email, phone: '', location: 'Dhaka', is_approved: false, fields: [uploadedField] }
      else if (path.endsWith('/fields')) turf.fields.push({ ...uploadedField, id: 2, name: 'New pitch' })
      else turf.fields[0] = uploadedField
      data = { message: 'Photos saved.', turf, field: uploadedField }
      status = 201
    } else if (path.endsWith('/schedule')) data = { bookings: [] }
    else if (path === '/api/turfs') { sportSearches.push(new URL(request.url).searchParams.get('sport_name')); data = { data: turf?.is_approved ? [turf] : [], last_page: 1 } }
    else if (path === '/api/cancellations') data = { data: [], current_page: 1, last_page: 1, total: 0 }
    send('Fetch.fulfillRequest', { requestId, responseCode: status, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(data)).toString('base64') })
      .catch((error) => errors.push(String(error)))
  })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
    return result.result.value
  }
  const until = async (expression) => {
    for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await wait(100) }
    throw new Error(`Condition failed: ${expression}\n${JSON.stringify({ body: await evaluate('document.body.innerText'), errors })}`)
  }
  const click = (label) => evaluate(`Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === ${JSON.stringify(label)}).click()`)
  const setInput = (selector, value) => evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`)
  const choosePhoto = async (index = 0) => {
    const { root } = await send('DOM.getDocument')
    const { nodeIds } = await send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: 'input[type=file]' })
    assert.ok(nodeIds[index], `Photo input exists: ${JSON.stringify({ nodeIds, inputs: await evaluate('Array.from(document.querySelectorAll("input")).map((input) => ({ type: input.type, html: input.outerHTML }))') })}`)
    await send('DOM.setFileInputFiles', { nodeId: nodeIds[index], files: [resolve(__dirname, '../src/assets/hero.png')] })
    await until('document.body.innerText.includes("hero.png")')
  }
  await send('Runtime.enable'); await send('Page.enable'); await send('DOM.enable'); await send('Network.enable')
  await send('Fetch.enable', { patterns: [{ urlPattern: `${origin}/api/*` }] })
  await send('Network.setCookie', { name: 'XSRF-TOKEN', value: 'test-token', url: origin, path: '/' })
  const { identifier } = await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('user', ${JSON.stringify(JSON.stringify(me))})` })
  await send('Page.navigate', { url: `${origin}/dashboard/turf` })
  await until('document.body.innerText.includes("Upload photos")')
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier })
  await evaluate(`(() => { const input = document.querySelector('input[type=file]'); const transfer = new DataTransfer(); transfer.items.add(new File(['text'], 'document.txt', { type: 'text/plain' })); input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true })); })()`)
  await until('document.body.innerText.includes("Choose JPG, PNG or WebP")')
  assert.ok(await evaluate(`Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Upload photos').disabled`))
  await evaluate(`(() => { const input = document.querySelector('input[type=file]'); const transfer = new DataTransfer(); transfer.items.add(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'too-big.jpg', { type: 'image/jpeg' })); input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true })); })()`)
  await until('document.body.innerText.includes("Each photo must be 5 MB or smaller")')
  await choosePhoto()
  await click('Upload photos')
  await until('document.body.innerText.includes("Delete photo") && !document.body.innerText.includes("hero.png")')
  assert.match(uploads[0].contentType, /^multipart\/form-data; boundary=/i, 'Browser must send a multipart boundary')
  assert.ok(uploads[0].body.includes('name="field_id"') && uploads[0].body.includes('name="photos[]"'), 'Field id and image are encoded as multipart fields')

  await evaluate('document.querySelector("details:last-of-type").open = true')
  // The add-field form is the one inside the Fields & facilities card.
  await evaluate(`Array.from(document.querySelectorAll('summary')).find((s) => s.textContent.includes('Add another field')).parentElement.open = true`)
  await evaluate(`(() => { const form = Array.from(document.querySelectorAll('form')).find((f) => f.textContent.includes('Create field')); form.id = 'new-field-form'; })()`)
  await setInput('#new-field-form input:not([type])', 'New pitch')
  await setInput('#new-field-form input[type=number]', '150')
  await evaluate('document.querySelector("#new-field-form input[type=checkbox]").click()')
  await evaluate(`Array.from(document.querySelectorAll('#new-field-form label')).find((label) => label.textContent.includes('Other sport')).querySelector('input').click()`)
  await setInput('#new-field-form input[aria-label="Other sport name"]', 'Pickleball')
  await choosePhoto(1)
  await click('Create field')
  await until('document.querySelector("#new-field-form input[type=number]").value === ""')
  assert.equal(uploads[1].path, '/api/turfs/1/fields')
  assert.match(uploads[1].contentType, /^multipart\/form-data; boundary=/i)
  assert.ok(uploads[1].body.includes('name="sports[]"'), 'Sports array survives multipart encoding')
  assert.ok(uploads[1].body.includes('name="custom_sport"') && uploads[1].body.includes('Pickleball'), 'Other sport survives multipart encoding')

  for (const role of ['turf', 'user', 'admin', 'superadmin']) {
    me = { ...me, role, name: `Test ${role}` }
    await evaluate(`localStorage.setItem('user', ${JSON.stringify(JSON.stringify(me))})`)
    await send('Page.navigate', { url: `${origin}/profile` })
    await until(`document.querySelector('input[aria-label="Full name"]') != null`)
    assert.ok(await evaluate(`document.querySelector('nav a[href="/profile"]') != null`), `${role} profile navigation`)
    await setInput('input[aria-label="Full name"]', `Updated ${role}`)
    await click('Save profile')
    await until('document.body.innerText.includes("Profile updated.")')
    assert.ok(await evaluate(`document.querySelector('input[aria-label="Full name"]').value === ${JSON.stringify(`Updated ${role}`)}`))
    assert.equal(await evaluate('JSON.parse(localStorage.getItem("user")).name'), undefined, 'Personal details are not cached in localStorage')
    if (role === 'turf') await until('document.body.innerText.includes("Complex details")')
    else assert.ok(await evaluate('document.body.innerText.includes("Delete my account")'))
    await send('Page.navigate', { url: `${origin}/turfs` })
    await until(`document.querySelector('h1')?.textContent === 'All Complexes'`)
    assert.ok(await evaluate(`document.querySelector('nav a[href="/turfs"]')?.textContent === 'All Complexes'`), `${role} directory navigation`)
  }

  me = { ...me, role: 'turf' }; turf.is_approved = false
  await evaluate(`localStorage.setItem('user', ${JSON.stringify(JSON.stringify(me))})`)
  await send('Page.navigate', { url: origin })
  await until('document.body.innerText.includes("is awaiting admin approval")')
  assert.ok(await evaluate(`document.querySelector('header a[href="/profile"]') != null`), 'Home profile link')

  turf = null; me = { ...me, role: 'turf' }
  await evaluate(`localStorage.setItem('user', ${JSON.stringify(JSON.stringify(me))})`)
  await send('Page.navigate', { url: `${origin}/dashboard/turf` })
  await until('document.body.innerText.includes("Register complex")')
  await choosePhoto()
  await setInput('form input[type=text]', 'New complex')
  await setInput('form input[type=email]', 'complex@example.invalid')
  const inputs = await evaluate('Array.from(document.querySelectorAll("form input[type=text]")).length')
  assert.equal(inputs, 4)
  await evaluate(`(() => { const inputs = document.querySelectorAll('form input[type=text]'); for (const [i, value] of [[1, '01700000000'], [2, 'Dhaka'], [3, 'First pitch']]) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inputs[i], value); inputs[i].dispatchEvent(new Event('input', { bubbles: true })); } })()`)
  await setInput('form input[type=number]', '100')
  await evaluate('document.querySelector("form input[type=checkbox]").click()')
  await click('Register complex')
  await until('document.body.innerText.includes("Fields & facilities")')
  assert.ok(await evaluate(`!!document.querySelector('a[href="/reports"]')`), 'Owner dashboard report button')
  await evaluate(`Array.from(document.querySelectorAll('input[type=checkbox]')).find((input) => input.closest('label')?.textContent.includes('Email me when')).click()`)
  await until(`Array.from(document.querySelectorAll('input[type=checkbox]')).find((input) => input.closest('label')?.textContent.includes('Email me when')).checked === false`)
  assert.equal(turf.booking_request_emails, false, 'Owner notification setting saved')
  assert.equal(uploads[2].path, '/api/turfs')
  assert.match(uploads[2].contentType, /^multipart\/form-data; boundary=/i)
  turf.is_approved = true
  turf.photos = [{ id: 1, url: '/favicon.svg' }]
  me = null
  await evaluate('localStorage.removeItem("user")')
  await send('Page.navigate', { url: `${origin}/turfs` })
  await until(`document.querySelector('h1')?.textContent === 'All Complexes'`)
  await until('document.querySelector("[data-complex-cover] img")?.complete')
  assert.ok(await evaluate(`(() => { const frame = document.querySelector('[data-complex-cover]'); const image = frame.querySelector('img'); const a = frame.getBoundingClientRect(), b = image.getBoundingClientRect(); return Math.abs(a.width / a.height - 16 / 9) < 0.02 && Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1 && getComputedStyle(image).objectFit === 'cover'; })()`), 'Card cover fills its frame automatically')
  await send('Page.navigate', { url: `${origin}/turfs/1` })
  await until(`!!document.querySelector('a[href="/turfs/1/fields/1"]')`)
  await evaluate(`document.querySelector('a[href="/turfs/1/fields/1"]').click()`)
  await until('document.body.innerText.includes("Sign in as a customer")')
  await evaluate(`document.querySelector('button[aria-label="View all 3 photos of Pitch one"]').click()`)
  await until('document.querySelector("dialog")?.open')
  assert.ok(await evaluate('document.body.style.overflow === "hidden"'), 'Gallery prevents background scrolling')
  await evaluate(`document.querySelector('button[aria-label="Next photo"]').click()`)
  await until('document.querySelector("dialog").innerText.includes("Photo 2 of 3")')
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight' })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight' })
  await until('document.querySelector("dialog").innerText.includes("Photo 3 of 3")')
  assert.equal(await evaluate('getComputedStyle(document.querySelector("dialog > img")).objectFit'), 'contain')
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' })
  await until('document.querySelector("dialog") === null')
  assert.equal(await evaluate('document.body.style.overflow'), '')
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  assert.equal(await evaluate(`document.querySelector('button[aria-controls="mobile-navigation"]').getAttribute('aria-expanded')`), 'false', 'Phone menu starts collapsed')
  await evaluate(`document.querySelector('button[aria-controls="mobile-navigation"]').click()`)
  await until(`document.querySelector('button[aria-controls="mobile-navigation"]').getAttribute('aria-expanded') === 'true'`)
  assert.ok(await evaluate(`document.querySelector('nav[aria-label="Primary mobile"] a[href="/turfs"]').getBoundingClientRect().width > 0`))
  assert.ok(await evaluate(`document.querySelector('#mobile-navigation a[href="/login"]').getBoundingClientRect().width > 0`), 'Guest login appears inside menu')
  assert.ok(await evaluate(`document.querySelector('#mobile-navigation a[href="/register"]').getBoundingClientRect().width > 0`), 'Guest signup appears inside menu')
  assert.ok(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Mobile navbar does not overflow the page')
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' })
  await until(`document.querySelector('button[aria-controls="mobile-navigation"]').getAttribute('aria-expanded') === 'false'`)
  assert.ok(await evaluate(`document.activeElement === document.querySelector('button[aria-controls="mobile-navigation"]')`), 'Escape restores hamburger focus')
  await evaluate(`document.querySelector('button[aria-controls="mobile-navigation"]').click()`)
  await evaluate(`document.querySelector('#mobile-navigation a[href="/turfs"]').click()`)
  await until(`document.querySelector('h1')?.textContent === 'All Complexes'`)
  assert.equal(await evaluate(`document.querySelector('button[aria-controls="mobile-navigation"]').getAttribute('aria-expanded')`), 'false', 'Navigation closes phone menu')
  me = { id: 1, name: 'Test customer', role: 'user', email: 'customer@example.invalid' }
  await evaluate(`localStorage.setItem('user', ${JSON.stringify(JSON.stringify(me))})`)
  await send('Page.navigate', { url: `${origin}/dashboard/user` })
  await until(`!!document.querySelector('a[href="/reports"]')`)
  await evaluate(`document.querySelector('button[aria-controls="mobile-navigation"]').click()`)
  await until(`document.querySelector('#mobile-navigation button')?.textContent === 'Logout'`)
  assert.ok(await evaluate(`document.querySelector('#mobile-navigation a[href="/bookings"]') != null`), 'Customer booking link is in menu')
  await evaluate(`document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`)
  await until(`document.querySelector('button[aria-controls="mobile-navigation"]').getAttribute('aria-expanded') === 'false'`)
  await evaluate(`document.querySelector('a[href="/reports"]').click()`)
  await until(`document.querySelector('textarea') !== null`)
  await setInput('form input', 'Missing booking')
  await evaluate(`(() => { const input = document.querySelector('textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, 'Please check booking 42.'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`)
  await click('Send report to admin')
  await until('document.body.innerText.includes("Report sent to the platform admins.")')
  assert.equal(reports[0].message, 'Please check booking 42.')
  me = { ...me, role: 'admin' }
  await evaluate(`localStorage.setItem('user', ${JSON.stringify(JSON.stringify(me))})`)
  await send('Page.navigate', { url: `${origin}/reports` })
  await until('document.body.innerText.includes("Missing booking")')
  await evaluate(`(() => { const input = document.querySelector('textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, 'We are checking this.'); input.dispatchEvent(new Event('input', { bubbles: true })); const select = document.querySelector('select'); select.value = 'in_progress'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`)
  await click('Save response')
  await until('document.body.innerText.includes("in progress")')
  assert.equal(reports[0].admin_reply, 'We are checking this.')
  me = { ...me, role: 'user' }
  await evaluate(`localStorage.setItem('user', ${JSON.stringify(JSON.stringify(me))})`)
  await send('Page.navigate', { url: `${origin}/reports` })
  await until('document.body.innerText.includes("Admin response")')
  assert.ok(await evaluate('document.body.innerText.includes("We are checking this.")'))
  for (const path of ['/', '/turfs']) {
    await send('Page.navigate', { url: origin + path })
    await until(`!!document.querySelector('form select')`)
    await evaluate(`(() => { const select = document.querySelector('form select'); select.value = '__other'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`)
    await until(`!!document.querySelector('input[aria-label="Other sport name"]')`)
    await setInput('input[aria-label="Other sport name"]', 'Pickleball')
    await evaluate(`document.querySelector('form').requestSubmit()`)
    await until(`document.body.innerText.includes('All Sports Complexes') || document.body.innerText.includes('All Complexes')`)
    for (let i = 0; i < 50 && sportSearches.at(-1) !== 'Pickleball'; i++) await wait(100)
    assert.equal(sportSearches.at(-1), 'Pickleball', 'Typed sport search reaches API')
  }
  assert.deepEqual(errors, [], 'No unhandled browser exceptions')
  console.log(JSON.stringify({ issue_reports: 'submit, admin response and reporter history passed', booking_email_setting: 'passed', field_selection_page: 'passed', existing_field_upload: 'passed', new_field_with_photos: 'passed', first_field_with_photos: 'passed',
    profile_roles: 'turf/user/admin/superadmin passed', field_gallery: 'open, navigation, keyboard, full image, Escape passed', card_image_fitting: 'passed', directory_access: 'all roles and guests passed', pending_owner_notice: 'passed', mobile_navigation: 'passed', multipart_boundary: 'passed', invalid_and_oversized_photos: 'passed', mode: 'intercepted API, no real writes', profile }, null, 2))
  await send('Browser.close')
})().catch((error) => { console.error(error); process.exitCode = 1 }).finally(() => { ws?.close(); browser.kill() })
