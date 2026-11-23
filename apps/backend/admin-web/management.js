'use strict';
async function managementView(name, content) {
  if (name === 'overview') {
    const d = await api('management/overview');
    content.replaceChildren();
    cards(content, {
      'Unassigned bookings': d.unassigned,
      'Past scheduled time': d.overdue,
      'Providers awaiting review': d.pendingProviders,
      'Unresolved cases': d.unresolved,
      'Overdue cases': d.overdueCases,
      'Agent applications': d.pendingAgents,
      'Routes awaiting review': d.pendingRoutes,
    });
    content.append(
      node(
        'p',
        'Updated ' +
          new Date(d.asOf).toLocaleString() +
          '. Past scheduled time flags a requested arrival time; it does not establish a missed service agreement.',
      ),
    );
    const shortcuts = node('div');
    shortcuts.className = 'actions';
    ['bookings', 'providers', 'support', 'parcels']
      .filter((n) => can(areas.find((a) => a[0] === n)[2]))
      .forEach((n) => shortcuts.append(button('Review ' + n, () => view(n))));
    content.append(shortcuts);
    return;
  }
  if (name === 'reports') {
    const d = await api('management/reports');
    content.replaceChildren();
    cards(content, {
      'Bookings created': d.bookings,
      'Completed bookings': d.completed,
      'Assignment conversion':
        d.assignmentConversionRate === null
          ? 'No bookings'
          : (d.assignmentConversionRate * 100).toFixed(1) + '%',
      'Completion rate':
        d.completionRate === null
          ? 'No bookings'
          : (d.completionRate * 100).toFixed(1) + '%',
      'Providers assigned work': d.activeProviders,
      'Repeat booking customers': d.repeatBookingCustomers,
      'Booking customers': d.bookingCustomers,
      'Recognized OneCall revenue': 'Not recorded',
    });
    content.append(
      node('p', d.definitions),
      node('p', 'Window begins ' + new Date(d.since).toLocaleString()),
      table(
        ['Currency', 'Verified live gross collections', 'Payments'],
        d.verifiedLiveCollections.map((r) => [
          r.currency,
          r._sum.amount,
          r._count._all,
        ]),
      ),
    );
    return;
  }
  if (name === 'catalogue') {
    const d = await api('management/catalogue');
    content.replaceChildren(node('p', d.availability), node('details'));
    const locations = content.querySelector('details');
    locations.append(
      node('summary', 'Supported states'),
      node('p', d.states.join(', ')),
    );
    d.services.forEach((s) => {
      const card = node('article');
      card.append(
        node('h2', s.name),
        node('p', s.description),
        node('p', s.enabled ? 'Accepting new requests' : 'New requests paused'),
      );
      if (can('owner')) {
        const description = node('textarea');
        description.value = s.description;
        description.required = true;
        description.maxLength = 500;
        const enabled = selectOptions([
          ['true', 'Accept requests'],
          ['false', 'Pause new requests'],
        ]);
        enabled.value = String(s.enabled);
        operationForm(
          card,
          'Save catalogue',
          [
            ['Description', description],
            ['Availability', enabled],
          ],
          (reason) =>
            api('management/catalogue/' + encodeURIComponent(s.key), {
              description: description.value.trim(),
              enabled: enabled.value === 'true',
              reason,
            }),
          () => view('catalogue'),
        );
      }
      content.append(card);
    });
    return;
  }
  if (name === 'staff') {
    const d = await api('management/staff');
    content.replaceChildren(
      node(
        'p',
        'Only the owner can delegate these responsibilities. Owner authority cannot be granted or removed here. Existing customer and provider accounts are preserved.',
      ),
      table(
        ['OneCall ID', 'Name', 'Status', 'Roles'],
        d.items.map((u) => [
          u.uid,
          u.firstName + ' ' + u.lastName,
          u.status,
          u.roles.join(', '),
        ]),
      ),
    );
    const uid = node('input');
    uid.required = true;
    uid.pattern = '[0-9]{10}';
    uid.maxLength = 10;
    const role = selectOptions(
      Object.keys(d.availableRoles).map((r) => [r, r.replace('ONECALL_', '')]),
    );
    const enabled = selectOptions([
      ['true', 'Grant'],
      ['false', 'Revoke'],
    ]);
    const password = node('input');
    password.type = 'password';
    password.autocomplete = 'current-password';
    password.required = true;
    const details = node('details');
    details.append(
      node('summary', 'Responsibilities for each role'),
      table(
        ['Role', 'Permissions'],
        Object.entries(d.availableRoles).map(([r, p]) => [r, p.join(', ')]),
      ),
    );
    content.append(details);
    operationForm(
      content,
      'Update staff access',
      [
        ['Existing account OneCall ID', uid],
        ['Responsibility', role],
        ['Action', enabled],
        ['Confirm your password', password],
      ],
      async (reason) => {
        try {
          return await api('management/staff', {
            uid: uid.value,
            role: role.value,
            enabled: enabled.value === 'true',
            password: password.value,
            reason,
          });
        } finally {
          password.value = '';
        }
      },
      () => view('staff'),
    );
    return;
  }
  const filters = node('form'),
    search = node('input');
  search.maxLength = 120;
  search.placeholder =
    name === 'customers'
      ? 'OneCall ID, name or email'
      : name === 'support'
        ? 'Subject, OneCall ID or case status'
        : 'Action name';
  filters.append(field('Search', search), node('button', 'Search'));
  content.replaceChildren();
  if (name !== 'finance') content.append(filters);
  const list = node('div'),
    pager = node('div');
  content.append(list, pager);
  let page = 1,
    loading = false;
  async function load() {
    if (loading) return;
    loading = true;
    try {
      const d = await api(
        'management/' +
          name +
          '?' +
          new URLSearchParams({ q: search.value.trim(), page: String(page) }),
      );
      list.replaceChildren();
      pager.replaceChildren();
      if (name === 'customers')
        d.items.forEach((u) => {
          const card = node('article');
          card.append(
            node('h2', u.firstName + ' ' + u.lastName),
            node('p', u.uid + ' · ' + u.email + ' · ' + u.status),
            button('Account history', async () => {
              const h = await api('management/customers/' + u.id);
              const history = node('section');
              history.append(
                node('h3', 'Latest bookings'),
                table(
                  ['Booking', 'Service', 'Status', 'Created'],
                  h.bookings.map((b) => [
                    b.id,
                    b.serviceName,
                    b.status,
                    b.createdAt,
                  ]),
                ),
                node('h3', 'Support and privacy requests'),
                table(
                  ['Case', 'Subject', 'Status'],
                  h.cases.map((c) => [c.id, c.subject, c.status]),
                ),
                node(
                  'p',
                  'Latest ' +
                    h.limitPerHistory +
                    ' records in each history. Privacy responses do not certify data deletion.',
                ),
              );
              card.querySelector('section')?.remove();
              card.append(history);
            }),
          );
          list.append(card);
        });
      else if (name === 'support')
        d.items.forEach((t) => {
          const card = node('article');
          card.append(
            node('h2', t.subject),
            node('p', t.user.uid + ' · ' + t.status + ' · ' + t.priority),
            node('p', t.message),
            node('p', t.response || 'No response yet'),
            node(
              'p',
              'Deadline: ' +
                (t.dueAt ? new Date(t.dueAt).toLocaleString() : 'Not set'),
            ),
          );
          if (can('support.write')) {
            const status = selectOptions(
              ['OPEN', 'IN_REVIEW', 'ESCALATED', 'RESOLVED'].map((s) => [s, s]),
            );
            status.value = t.status;
            const priority = selectOptions(
              ['NORMAL', 'HIGH', 'URGENT'].map((s) => [s, s]),
            );
            priority.value = t.priority;
            const owner = selectOptions([
              ['', 'Unassigned'],
              ...d.staff.map((u) => [u.id, u.firstName + ' · ' + u.uid]),
            ]);
            owner.value = t.assignedToId || '';
            const due = node('input');
            due.type = 'datetime-local';
            if (t.dueAt) {
              const date = new Date(t.dueAt);
              due.value = new Date(
                date.getTime() - date.getTimezoneOffset() * 60000,
              )
                .toISOString()
                .slice(0, 16);
            }
            const response = node('textarea');
            response.maxLength = 2000;
            response.value = t.response || '';
            operationForm(
              card,
              'Save case',
              [
                ['Status', status],
                ['Priority', priority],
                ['Case owner', owner],
                ['Response deadline', due],
                ['Customer response', response],
              ],
              (reason) =>
                api('management/support/' + t.id, {
                  status: status.value,
                  priority: priority.value,
                  ...(owner.value ? { assignedToId: owner.value } : {}),
                  ...(due.value
                    ? { dueAt: new Date(due.value).toISOString() }
                    : {}),
                  ...(response.value.trim()
                    ? { response: response.value.trim() }
                    : {}),
                  reason,
                }),
              load,
            );
          }
          list.append(card);
        });
      else if (name === 'finance') {
        list.append(
          node(
            'p',
            'Payment mode: ' + d.mode + ' · Live approval: ' + d.liveApproved,
          ),
          node(
            'p',
            'Review references against the payment provider. This workspace cannot execute refunds or payouts. Commission revenue is not recorded.',
          ),
          table(
            [
              'Payment',
              'Booking',
              'Amount',
              'Currency',
              'Mode',
              'Status',
              'Provider reference',
            ],
            d.items.map((p) => [
              p.id,
              p.orderId,
              p.amount,
              p.currency,
              p.providerMode,
              p.status,
              p.providerReference,
            ]),
          ),
        );
      } else if (name === 'audit')
        list.append(
          table(
            ['Time', 'Action', 'Actor record', 'Resource', 'Reason'],
            d.items.map((a) => [
              new Date(a.createdAt).toLocaleString(),
              a.action,
              a.actorId,
              a.resourceId,
              a.reason,
            ]),
          ),
        );
      if (!d.items.length) list.append(node('p', 'No matching records.'));
      pager.append(node('p', d.total + ' records · Page ' + page));
      if (page > 1)
        pager.append(
          button('Previous', () => {
            page--;
            return load();
          }),
        );
      if (page * 25 < d.total)
        pager.append(
          button('Next', () => {
            page++;
            return load();
          }),
        );
    } finally {
      loading = false;
    }
  }
  filters.onsubmit = (e) => {
    e.preventDefault();
    page = 1;
    load().catch((e) => message(e.message));
  };
  await load();
}
