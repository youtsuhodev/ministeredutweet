/* Applique le thème choisi avant le premier rendu (évite un flash sombre). */
try {
  const p = localStorage.getItem('wouaff-theme') || 'dark';
  const t = p === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : p;
  document.documentElement.setAttribute('data-theme', t);
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.setAttribute('content', t === 'light' ? '#eef2f7' : '#020617');
} catch {
  /* stockage indisponible : le thème par défaut du HTML reste appliqué */
}
