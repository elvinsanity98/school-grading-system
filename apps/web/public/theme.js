// Applies the saved theme before first paint so there is no flash. External file because the
// server's Content-Security-Policy does not allow inline scripts.
try {
  var t = localStorage.getItem('bnhs.theme');
  var dark = t === 'dark' || (t !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (dark) document.documentElement.classList.add('dark');
} catch (e) {}
