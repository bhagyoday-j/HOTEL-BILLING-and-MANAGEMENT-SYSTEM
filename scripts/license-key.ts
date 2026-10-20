/**
 * Vendor tool: issue a per-machine activation key.
 *
 *   npm run license:key -- ABCD-EFGH-IJKL-MNOP
 *
 * The machine code is shown on the activation screen of the customer's PC. The
 * printed key activates (and renews) that one computer only. The shared
 * activation password also works, so issuing per-machine keys is optional.
 */
import { formatLicenseCode } from '@hotel-billing/shared';
import {
  ACTIVATION_KEY,
  derivedActivationKey,
} from '../apps/server/src/services/licenseService';

const code = process.argv[2];
if (!code) {
  console.error('Usage: npm run license:key -- <machine-code>');
  console.error('Example: npm run license:key -- ABCD-EFGH-IJKL-MNOP');
  process.exit(1);
}

console.log(`machine code  : ${formatLicenseCode(code)}`);
console.log(`activation key: ${formatLicenseCode(derivedActivationKey(code))}`);
console.log(`shared password: ${ACTIVATION_KEY}`);
