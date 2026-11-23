'use strict';
function field(label, input) {
  const l = node('label', label);
  l.append(input);
  return l;
}
function selectOptions(items) {
  const s = node('select');
  items.forEach(([value, text]) => {
    const o = node('option', text);
    o.value = value;
    s.append(o);
  });
  return s;
}
function reasonInput() {
  const input = node('textarea');
  input.required = true;
  input.minLength = 3;
  input.maxLength = 500;
  return input;
}
function operationForm(container, title, inputs, action, done) {
  const form = node('form'),
    reason = reasonInput(),
    button = node('button', title);
  form.append(
    ...inputs.map(([label, input]) => field(label, input)),
    field('Reason (recorded in operations history)', reason),
    button,
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    button.disabled = true;
    message('Saving…');
    try {
      await action(reason.value.trim());
      await done();
      message('Operation saved.');
    } catch (error) {
      message(error.message);
    } finally {
      button.disabled = false;
    }
  });
  container.append(form);
}
async function operationsView(name, content = $('content')) {
  content.replaceChildren();
  const filters = node('form'),
    search = node('input');
  search.placeholder =
    name === 'providers'
      ? 'Provider UID, email or name'
      : 'Request ID, customer UID, service or town';
  search.maxLength = 120;
  filters.append(field('Search', search));
  const status = selectOptions([
    ['', 'All statuses'],
    ...['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map(
      (s) => [s, s],
    ),
  ]);
  if (name === 'bookings') filters.append(field('Status', status));
  const queue = selectOptions([
    ['', 'All bookings'],
    ['UNASSIGNED', 'Unassigned bookings'],
    ['OVERDUE', 'Past scheduled time'],
  ]);
  if (name === 'bookings') filters.append(field('Operations queue', queue));
  filters.append(node('button', 'Search'));
  content.append(filters);
  const list = node('div'),
    pager = node('div');
  content.append(list, pager);
  const catalogue =
    name === 'providers' ? await api('admin/operations/catalogue') : null;
  let page = 1,
    loading = false;
  async function load() {
    if (loading) return;
    loading = true;
    try {
      const params = new URLSearchParams({
        q: search.value.trim(),
        page: String(page),
      });
      if (name === 'bookings' && queue.value) params.set('queue', queue.value);
      if (name === 'bookings' && status.value)
        params.set('status', status.value);
      const data = await api('admin/operations/' + name + '?' + params);
      list.replaceChildren();
      pager.replaceChildren();
      for (const item of data.items) {
        const card = node('article');
        list.append(card);
        if (name === 'providers') {
          card.append(
            node('h2', item.displayName || item.user.uid),
            node('p', item.user.email),
            node(
              'p',
              (item.approved ? 'Approved' : 'Pending review') +
                ' · Account ' +
                item.user.status,
            ),
            node(
              'p',
              'Email verified: ' +
                item.user.emailVerified +
                ' · Phone verified: ' +
                item.user.phoneVerified,
            ),
            node(
              'p',
              item.coverage
                .map((c) => c.serviceName + ' · ' + c.cityKey + ', ' + c.state)
                .join('\n') || 'No coverage',
            ),
          );
          if (!can('providers.write')) continue;
          const state = selectOptions(catalogue.states.map((s) => [s, s]));
          state.value = 'Kaduna';
          const city = node('input');
          city.required = true;
          city.maxLength = 60;
          city.value = 'Kaduna';
          const services = node('select');
          services.multiple = true;
          services.required = true;
          catalogue.services.forEach((service) => {
            const option = node('option', service.name);
            option.value = service.key;
            services.append(option);
          });
          card.append(
            node(
              'p',
              'First approval replaces proposed coverage. Later approvals add reviewed coverage. A town of * grants the whole state.',
            ),
          );
          operationForm(
            card,
            item.approved
              ? 'Add approved coverage'
              : 'Approve reviewed provider',
            [
              ['State', state],
              ['Town', city],
              ['Services (select one or more)', services],
            ],
            (reason) =>
              api('admin/operations/providers/' + item.id + '/approve', {
                state: state.value,
                city: city.value.trim(),
                services: [...services.selectedOptions].map((o) => o.value),
                reason,
              }),
            load,
          );
          if (item.approved)
            operationForm(
              card,
              'Revoke approval',
              [],
              (reason) =>
                api('admin/operations/providers/' + item.id + '/revoke', {
                  reason,
                }),
              load,
            );
        } else {
          card.append(
            node('h2', item.serviceName),
            node('p', item.id),
            node('p', item.city + ', ' + item.state + ' · ' + item.status),
            node(
              'p',
              'Customer ' +
                item.customer.uid +
                ' · Provider ' +
                (item.provider?.user.uid || 'Unassigned'),
            ),
          );
          const button = node('button', 'Inspect booking');
          card.append(button);
          button.addEventListener('click', async () => {
            button.disabled = true;
            try {
              await bookingDetail(item.id);
            } catch (error) {
              message(error.message);
            } finally {
              button.disabled = false;
            }
          });
        }
      }
      if (!data.items.length) list.append(node('p', 'No matching records.'));
      pager.append(
        node('p', 'Page ' + data.page + ' · ' + data.total + ' records'),
      );
      for (const [text, enabled, delta] of [
        ['Previous', page > 1, -1],
        ['Next', page * data.pageSize < data.total, 1],
      ]) {
        const button = node('button', text);
        button.disabled = !enabled;
        button.addEventListener('click', () => {
          page += delta;
          load();
        });
        pager.append(button);
      }
      message('');
    } catch (error) {
      message(error.message);
    } finally {
      loading = false;
    }
  }
  filters.addEventListener('submit', (e) => {
    e.preventDefault();
    page = 1;
    load();
  });
  await load();
}
async function bookingDetail(id) {
  const content = $('content').firstElementChild;
  const data = await api('admin/operations/bookings/' + id),
    b = data.booking;
  content.replaceChildren();
  const back = node('button', 'Back to bookings');
  back.addEventListener('click', () => view('bookings'));
  content.append(back);
  content.append(
    node('h2', b.serviceName + ' · ' + b.status),
    node('p', b.id),
    node('p', b.city + ', ' + b.state),
    node('p', b.address || b.pickupAddress || 'No address'),
    node('p', b.destinationAddress || ''),
    node('p', b.description || ''),
    node(
      'p',
      'Customer ' +
        b.customer.uid +
        ' · Provider ' +
        (b.provider?.user.uid || 'Unassigned'),
    ),
    node('p', 'Scheduled: ' + (b.scheduledAt || 'Not scheduled')),
    node(
      'p',
      'Quoted amount: ' + (b.quote?.amount ?? 'Awaiting provider quote'),
    ),
    node(
      'p',
      b.quoteRequired
        ? b.quote?.acceptedAt
          ? 'Customer accepted quote'
          : 'Customer quote acceptance is required before work starts'
        : 'Legacy booking',
    ),
  );
  if (can('bookings.write') && b.status === 'PENDING' && !b.provider) {
    const provider = selectOptions(
      data.eligibleProviders.map((p) => [
        p.id,
        (p.displayName || p.user.uid) + ' · ' + p.user.uid,
      ]),
    );
    provider.required = true;
    if (data.eligibleProviders.length)
      operationForm(
        content,
        'Assign approved provider',
        [['Eligible providers (up to 100)', provider]],
        (reason) =>
          api('admin/operations/bookings/' + id + '/assign', {
            providerId: provider.value,
            reason,
          }),
        () => bookingDetail(id),
      );
    else
      content.append(
        node(
          'p',
          'No eligible provider. Review and approve service coverage first.',
        ),
      );
  }
  if (
    can('bookings.write') &&
    ['PENDING', 'ACCEPTED', 'IN_PROGRESS'].includes(b.status)
  )
    operationForm(
      content,
      'Cancel booking',
      [],
      (reason) =>
        api('admin/operations/bookings/' + id + '/cancel', { reason }),
      () => bookingDetail(id),
    );
  if (can('bookings.write') && ['PENDING', 'ACCEPTED'].includes(b.status)) {
    const date = node('input');
    date.type = 'datetime-local';
    date.required = true;
    operationForm(
      content,
      'Reschedule booking',
      [['Requested time', date]],
      (reason) =>
        api('management/bookings/' + id + '/schedule', {
          scheduledAt: new Date(date.value).toISOString(),
          reason,
        }),
      () => bookingDetail(id),
    );
  }
  content.append(node('h2', 'Booking evidence'));
  content.append(
    node(
      'p',
      'Uploaded booking photos support review; they are not automatic proof of completion.',
    ),
  );
  for (const photo of b.photos || [])
    content.append(
      button(
        'Download photo · ' + new Date(photo.createdAt).toLocaleString(),
        async () => {
          const reason = window.prompt(
            'Record why you need to review this private booking photo (3–500 characters)',
          );
          if (!reason || reason.trim().length < 3) return;
          const response = await fetch(
            '/api/v1/management/bookings/' + id + '/photos/' + photo.id,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + token,
              },
              body: JSON.stringify({ reason: reason.trim() }),
            },
          );
          if (!response.ok)
            throw new Error(
              'Photo download failed. Check your access and retry.',
            );
          const url = URL.createObjectURL(await response.blob());
          const a = node('a');
          a.href = url;
          a.download =
            'onecall-booking-photo.' +
            (photo.mime === 'image/png' ? 'png' : 'jpg');
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        },
      ),
    );
  content.append(node('h2', 'Admin operations history'));
  if (!data.history.length)
    content.append(
      node(
        'p',
        'No admin operations recorded. Earlier provider/customer status changes are not reconstructed.',
      ),
    );
  data.history.forEach((event) =>
    content.append(
      node(
        'article',
        event.createdAt +
          ' · ' +
          event.action +
          '\nActor ' +
          event.actorId +
          '\n' +
          event.reason +
          '\n' +
          JSON.stringify(event.details),
      ),
    ),
  );
}
