/* Page hors-ligne : script externe car la CSP de production interdit les scripts inline. */
document.getElementById('retry')?.addEventListener('click', () => location.reload());
addEventListener('online', () => location.reload());
