'use strict';
const { approve } = require('./approve-provider.cjs');
approve(process.argv[2], 'Kaduna', 'Kaduna', [
  'tailoring',
  'mechanic',
  'shoe-repair',
  'provisions',
  'soup-ingredients',
  'solar',
  'carpentry',
  'painting',
])
  .then((value) => console.log(JSON.stringify({ ...value, provisioned: true })))
  .catch((error) => {
    console.error(
      /Usage:|No account|must first register|DATABASE_URL/.test(error.message)
        ? error.message
        : 'Provider provisioning failed. Build the backend and check configuration.',
    );
    process.exitCode = 1;
  });
