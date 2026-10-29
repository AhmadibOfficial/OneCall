'use strict';
/* global api, node, table, $, message */
async function parcelView() {
  const data = await api('admin/parcels');
  const content = $('content');
  content.replaceChildren();
  content.append(
    node('h2', 'Parcel network'),
    node(
      'p',
      'Latest 100 shops, routes and parcels. Approve only after identity, shop and custody arrangements have been checked. Approval is an operator decision; this screen does not perform NIN verification. Online payments and wallet payouts are disabled.',
    ),
  );
  function action(label, run) {
    const button = node('button', label);
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await run();
      } catch (e) {
        message(e.message || 'Operation failed');
      } finally {
        button.disabled = false;
      }
    });
    return button;
  }
  function reason() {
    const value = window.prompt(
      'Record the review reason or evidence (10–500 characters)',
    );
    if (value === null) return null;
    if (value.trim().length < 10 || value.trim().length > 500)
      throw new Error('Enter a reason with 10–500 characters');
    return value.trim();
  }
  function section(title, values, render) {
    content.append(node('h3', title));
    if (!values.length) content.append(node('p', 'No records yet.'));
    for (const row of values) {
      const card = node('section');
      card.className = 'card';
      render(card, row);
      content.append(card);
    }
  }
  section('Shop applications', data.agents, (card, agent) => {
    card.append(
      node('h4', agent.shopName),
      node('p', agent.address + ' · ' + agent.city + ', ' + agent.state),
      node('p', 'Status: ' + agent.status),
      node('p', 'Shop ID: ' + agent.id),
      node('p', 'Account ID: ' + agent.userId),
    );
    for (const approved of [true, false])
      card.append(
        action(approved ? 'Approve shop' : 'Suspend shop', async () => {
          const why = reason();
          if (why === null) return;
          const reviewReference = window.prompt(
            'Identity/shop check reference (3–120 characters). Do not paste NIN, identity documents or secrets here.',
            agent.reviewReference || '',
          );
          if (reviewReference === null) return;
          if (
            reviewReference.trim().length < 3 ||
            reviewReference.trim().length > 120
          )
            throw new Error('Enter a valid review reference');
          await api('admin/parcels/agents/' + agent.id + '/review', {
            approved,
            reason: why,
            reviewReference: reviewReference.trim(),
          });
          await parcelView();
          message('Shop review recorded.');
        }),
      );
  });
  section('Route review', data.routes, (card, route) => {
    card.append(
      node(
        'h4',
        route.originAgent.shopName + ' → ' + route.destinationAgent.shopName,
      ),
      node(
        'p',
        route.originAgent.city +
          ', ' +
          route.originAgent.state +
          ' → ' +
          route.destinationAgent.city +
          ', ' +
          route.destinationAgent.state,
      ),
      node(
        'p',
        '₦' +
          (route.priceKobo / 100).toFixed(2) +
          ' · ' +
          route.maxWeightGrams +
          ' g · ' +
          route.estimatedHours +
          ' hours · ' +
          route.status,
      ),
      node(
        'p',
        route.homePickup
          ? 'Home pickup fee: ₦' + (route.homePickupFeeKobo / 100).toFixed(2)
          : 'Shop drop-off only',
      ),
    );
    for (const active of [true, false])
      card.append(
        action(active ? 'Activate route' : 'Pause route', async () => {
          const why = reason();
          if (why === null) return;
          if (
            active &&
            !window.confirm(
              'Independent route review: confirm BOTH shop identities and locations, the full price and pickup fee, capacity and transit estimate, physical custody/return arrangements, and permitted-item restrictions. Cancel if any check is incomplete.',
            )
          )
            return;
          await api('admin/parcels/routes/' + route.id + '/review', {
            active,
            ...(active
              ? {
                  shopsConfirmed: true,
                  pricingConfirmed: true,
                  custodyConfirmed: true,
                  restrictionsConfirmed: true,
                }
              : {}),
            reason: why,
          });
          await parcelView();
          message('Route review recorded.');
        }),
      );
  });
  section('Parcel operations', data.shipments, (card, parcel) => {
    card.append(
      node('h4', parcel.reference),
      node(
        'p',
        parcel.status +
          ' · ' +
          parcel.originAgent.shopName +
          ' → ' +
          parcel.destinationAgent.shopName,
      ),
    );
    card.append(
      action('View parcel & custody history', async () => {
        const why = reason();
        if (why === null) return;
        const detail = await api(
          'admin/parcels/shipments/' + parcel.id + '/view',
          { reason: why },
        );
        const panel = node('div');
        panel.append(
          node(
            'p',
            'Recipient: ' +
              detail.recipientName +
              ' · ' +
              detail.recipientPhone,
          ),
          node('p', 'Contents: ' + detail.description),
          node('p', 'Pickup: ' + (detail.pickupAddress || 'Origin shop')),
        );
        panel.append(
          table(
            ['Recorded at', 'Status', 'Custody note'],
            detail.events.map((event) => [
              event.createdAt,
              event.status,
              event.note,
            ]),
          ),
        );
        card.append(panel);
        message(
          'Private view recorded in the admin audit history. Collection codes are never shown to administrators.',
        );
      }),
    );
  });
  message('Parcel operations loaded.');
}
