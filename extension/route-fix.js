// Next.js router fix for Chrome Extensions
// Next.js expects URLs like /analyze/, not /analyze/index.html
if (window.location.pathname.endsWith('.html')) {
  var newPath = window.location.pathname.replace(/\/[^\/]+\.html$/, '/');
  if (newPath === '') newPath = '/';
  window.history.replaceState(null, '', newPath);
}