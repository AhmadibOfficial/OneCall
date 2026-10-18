'use strict';
// Credentials live only in memory; reload signs the operator out.
let token = '',
  refreshToken = '',
  busy = false;
const $ = (id) => document.getElementById(id);
function message(value) {
  $('notice').textContent = value;
}
function signedOut() {
  token = refreshToken = '';
  $('login').hidden = false;
  $('workspace').hidden = true;
  $('logout').hidden = true;
  $('content').replaceChildren();
}
async function api(path, body) {
  const response = await fetch('/api/v1/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) signedOut();
    throw new Error(
      response.status === 403
        ? 'Admin access is required. Ask your local operator to grant the ADMIN role.'
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
  headers.forEach((h) => head.append(node('th', h)));
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
async function view(name) {
  if (busy) return;
  busy = true;
  message('Loading…');
  try {
    if (name === 'providers' || name === 'bookings') {
      await operationsView(name);
      return;
    }
    const data = await api('admin/' + name),
      content = $('content');
    content.replaceChildren();
    if (name === 'overview') {
      const cards = node('div');
      cards.className = 'cards';
      Object.entries(data).forEach(([key, value]) => {
        const card = node('div');
        card.className = 'card';
        card.append(
          node('strong', value),
          node('span', key.replace(/([A-Z])/g, ' $1')),
        );
        cards.append(card);
      });
      content.append(cards);
    } else if (name === 'providers') {
      content.append(
        table(
          ['Provider', 'Email', 'Approval', 'Coverage'],
          data.map((p) => [
            p.displayName || p.user.uid,
            p.user.email,
            p.approved ? 'Approved' : 'Pending review',
            p.coverage
              .map((c) => c.serviceName + ' · ' + c.cityKey + ', ' + c.state)
              .join('\n') || 'No coverage',
          ]),
        ),
      );
    } else if (name === 'bookings') {
      content.append(
        table(
          [
            'Request ID',
            'Service / location',
            'Status',
            'Customer UID',
            'Provider UID',
          ],
          data.map((o) => [
            o.id,
            o.serviceName + '\n' + o.city + ', ' + o.state,
            o.status,
            o.customer.uid,
            o.provider?.user.uid,
          ]),
        ),
      );
    } else {
      data.forEach((ticket) => {
        const card = node('article');
        card.append(
          node('h2', ticket.subject),
          node('p', ticket.user.uid + ' · ' + ticket.status),
          node('p', ticket.message),
        );
        if (ticket.status === 'OPEN') {
          const form = node('form'),
            label = node('label', 'Response'),
            input = node('textarea');
          input.required = true;
          input.maxLength = 2000;
          label.append(input);
          const button = node('button', 'Respond and resolve');
          form.append(label, button);
          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            button.disabled = true;
            try {
              await api('admin/support/' + ticket.id + '/resolve', {
                response: input.value.trim(),
              });
              await view('support');
            } catch (error) {
              message(error.message);
            } finally {
              button.disabled = false;
            }
          });
          card.append(form);
        } else card.append(node('p', ticket.response));
        content.append(card);
      });
    }
    if (Array.isArray(data) && !data.length)
      content.append(node('p', 'No records yet.'));
    message('');
  } catch (error) {
    message(error.message);
  } finally {
    busy = false;
  }
}
$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const button = e.target.querySelector('button');
  button.disabled = true;
  try {
    const result = await api('auth/login', {
      email: $('email').value.trim(),
      password: $('password').value,
    });
    token = result.accessToken;
    refreshToken = result.refreshToken;
    $('password').value = '';
    await api('admin/overview');
    $('login').hidden = true;
    $('workspace').hidden = false;
    $('logout').hidden = false;
    await view('overview');
  } catch (error) {
    if (token) await api('auth/logout', { refreshToken }).catch(() => {});
    signedOut();
    message(error.message);
  } finally {
    button.disabled = false;
  }
});
$('logout').addEventListener('click', async () => {
  try {
    await api('auth/logout', { refreshToken });
    message('Signed out.');
  } catch {
    message('Signed out locally. Server logout could not be confirmed.');
  } finally {
    signedOut();
  }
});
document
  .querySelectorAll('[data-view]')
  .forEach((button) =>
    button.addEventListener('click', () => view(button.dataset.view)),
  );
