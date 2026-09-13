const { execSync } = require('child_process');

console.log('--- Git commit & push WHATANAGENT ---');
try {
  execSync('git add -A', { cwd: 'C:/app2026/WHATANAGENT' });
  try {
    execSync('git commit -m "feat: Add WhatsApp Web sync progress bar, sync history modal, and AI Copilot drawer"', { cwd: 'C:/app2026/WHATANAGENT' });
  } catch (e) {
    console.log('Commit note:', e.message);
  }
  const pushRes1 = execSync('git push origin main', { cwd: 'C:/app2026/WHATANAGENT' }).toString();
  console.log('✅ WHATANAGENT pushed to GitHub:\n', pushRes1);
} catch (e) {
  console.error('❌ WHATANAGENT push error:', e.message);
}

console.log('--- Git commit & push easyInvoice ---');
try {
  execSync('git add -A', { cwd: 'C:/app2026/easyInvoice' });
  try {
    execSync('git commit -m "feat: Multi-tenant profile isolation security fix and production build"', { cwd: 'C:/app2026/easyInvoice' });
  } catch (e) {
    console.log('Commit note:', e.message);
  }
  const pushRes2 = execSync('git push origin main', { cwd: 'C:/app2026/easyInvoice' }).toString();
  console.log('✅ easyInvoice pushed to GitHub:\n', pushRes2);
} catch (e) {
  console.error('❌ easyInvoice push error:', e.message);
}
