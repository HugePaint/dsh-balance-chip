/**
 * Host half of dsh-balance-chip.
 *
 * Everything the feature does happens in the browser bundle (`./client`):
 * it reads the account Remote and renders a balance row in the sidebar footer
 * slot (`sidebar.footer.action`, directly above the avatar / account entry).
 *
 * This half exists because the loader imports the package on the host side too.
 * It declares no host service and performs no work.
 */

/** No host-side behaviour: the plugin is client-only. */
export function apply() {
	// Intentionally empty.
}

/** Declared for the loader; the plugin injects no host services. */
export const inject = [];
