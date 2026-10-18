/**
 * Host half of dsh-balance-chip.
 *
 * Everything the feature does happens in the browser bundle (`./client`):
 * it reads the account Remote and renders a balance row in the sidebar footer
 * slot (`sidebar.footer.action`, directly above the avatar / account entry).
 *
 * This half exists because the loader imports the package on the host side too
 * — and it doubles as a probe: if the package resolves at all, `apply` runs and
 * appends a line to PROBE_LOG. An empty log means the loader never got as far
 * as this package, which is a different failure from "the chip did not render".
 */

import { appendFileSync } from "node:fs";

/** Where the host half records that it was loaded. */
const PROBE_LOG = "/tmp/dsh-balance-chip-host.log";

/** No host-side behaviour beyond the probe. */
export function apply() {
	try {
		appendFileSync(
			PROBE_LOG,
			`${new Date().toISOString()} pid=${process.pid} host apply ran\n`
		);
	} catch {
		// 探针失败不影响任何事
	}
}

/** Declared for the loader; the plugin injects no host services. */
export const inject = [];
