'use strict';
// Authentication credentials are kept in memory, never in browser storage.
let token = '',
  refreshToken = '',
  permissions = [],
  revision = 0;
const $ = (id) => document.getElementById(id);
const can = (permission) =>
  permissions.includes('*') || permissions.includes(permission);
const areas = [
  ['overview', 'Operations Centre', 'overview'],
  ['bookings', 'Booking and Dispatch', 'bookings'],
  ['providers', 'Provider Management', 'providers'],
  ['customers', 'Customer Management', 'customers'],
  ['parcels', 'Parcel Operations', 'owner'],
  ['support', 'Support and Disputes', 'support'],
  ['finance', 'Finance Operations', 'finance'],
  ['catalogue', 'Service Catalogue', 'catalogue'],
  ['staff', 'Staff and Permissions', 'owner'],
  ['reports', 'Business Reports', 'reports'],
  ['audit', 'Activity History', 'audit'],
];
function message(value) {
  $('notice').textContent = value;
}
function signedOut() {
  revision++;
  token = refreshToken = '';
  permissions = [];
  $('login').hidden = false;
  $('workspace').hidden = true;
  $('logout').hidden = true;
  $('content').replaceChildren();
}
async function api(path, body, authorization = token) {
  const response = await fetch('/api/v1/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authorization ? { Authorization: 'Bearer ' + authorization } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) signedOut();
    throw new Error(
      response.status === 403
        ? 'Your staff permissions do not allow this action.'
        : (Array.isArray(result.message)
            ? result.message.join(', ')
            : result.message) || 'Request failed. Please retry.',
    );
  }
  return result;
}
function node(tag, text) {
  const el = document.createElement(tag);
  if (text != null) el.textContent = text;
  return el;
}
function table(headers, rows) {
  const wrap = node('div');
  wrap.className = 'table-wrap';
  const t = node('table'),
    head = node('tr');
  headers.forEach((h) => {
    const th = node('th', h);
    th.scope = 'col';
    head.append(th);
  });
  const thead = node('thead');
  thead.append(head);
  t.append(thead);
  const body = node('tbody');
  rows.forEach((row) => {
    const r = node('tr');
    row.forEach((value) => r.append(node('td', value ?? '—')));
    body.append(r);
  });
  t.append(body);
  wrap.append(t);
  return wrap;
}
function button(label, action) {
  const b = node('button', label);
  b.type = 'button';
  b.onclick = async () => {
    b.disabled = true;
    try {
      await action();
    } catch (e) {
      message(e.message);
    } finally {
      b.disabled = false;
    }
  };
  return b;
}
function cards(container, values) {
  const wrap = node('div');
  wrap.className = 'cards';
  Object.entries(values).forEach(([label, value]) => {
    const card = node('article');
    card.className = 'card';
    card.append(node('strong', value ?? 'Not recorded'), node('span', label));
    wrap.append(card);
  });
  container.append(wrap);
}
async function view(name) {
  const area = areas.find((a) => a[0] === name);
  if (!area || !can(area[2])) return;
  const current = ++revision,
    container = node('div');
  $('content').replaceChildren(container);
  $('page-title').textContent = area[1];
  document
    .querySelectorAll('[data-view]')
    .forEach((b) =>
      b.setAttribute(
        'aria-current',
        b.dataset.view === name ? 'page' : 'false',
      ),
    );
  const loading = node('p', 'Loading ' + area[1].toLowerCase() + '…');
  loading.className = 'loading';
  container.append(loading);
  message('');
  try {
    if (name === 'providers' || name === 'bookings')
      await operationsView(name, container);
    else if (name === 'parcels') await parcelView(container);
    else await managementView(name, container);
  } catch (error) {
    if (current === revision) {
      container.replaceChildren(
        node('p', error.message),
        button('Retry', () => view(name)),
      );
      message(error.message);
    }
  } finally {
    loading.remove();
  }
}
$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const submit = e.target.querySelector('button');
  submit.disabled = true;
  try {
    const result = await api('auth/login', {
      email: $('email').value.trim(),
      password: $('password').value,
    });
    token = result.accessToken;
    refreshToken = result.refreshToken;
    $('password').value = '';
    const session = await api('management/session');
    permissions = session.permissions;
    $('operator').textContent = session.name + ' · ' + session.uid;
    $('navigation').replaceChildren(
      ...areas
        .filter((a) => can(a[2]))
        .map((a) => {
          const b = button(a[1], () => view(a[0]));
          b.dataset.view = a[0];
          return b;
        }),
    );
    $('login').hidden = true;
    $('workspace').hidden = false;
    $('logout').hidden = false;
    await view('overview');
  } catch (e) {
    if (token) await api('auth/logout', { refreshToken }).catch(() => {});
    signedOut();
    message(e.message);
  } finally {
    submit.disabled = false;
  }
});
$('logout').onclick = async () => {
  const refresh = refreshToken,
    authorization = token;
  signedOut();
  await api('auth/logout', { refreshToken: refresh }, authorization).catch(() =>
    message('Signed out locally. Server logout could not be confirmed.'),
  );
};
