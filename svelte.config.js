/** @type {import("@sveltejs/vite-plugin-svelte").SvelteConfig} */
export default {
  // Labels in this app sit directly above their input (no `for`/`id` pairing).
  // That's a deliberate, faithful port of the original markup; silence just that one rule.
  onwarn(warning, handler) {
    if (warning.code === 'a11y_label_has_associated_control') return
    handler(warning)
  },
}
