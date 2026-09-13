const { execSync } = require('child_process');

console.log('--- 1. Pushing WHATANAGENT to GitHub (master) ---');
try {
  execSync('git add -A', { cwd: 'C:/app2026/WHATANAGENT' });
  try {
    execSync('git commit -m "feat: Add WhatsApp Web sync progress bar, sync history modal, and AI Copilot drawer"', { cwd: 'C:/app2026/WHATANAGENT' });
  } catch (e) {}
  const res1 = execSync('git push origin master', { cwd: 'C:/app2026/WHATANAGENT' }).toString();
  console.log('✅ WHATANAGENT pushed successfully to master:\n', res1);
} catch (e) {
  console.error('❌ WHATANAGENT push error:', e.stdout ? e.stdout.toString() : e.message);
}

console.log('--- 2. Pushing easyInvoice to GitHub (master) ---');
try {
  execSync('git add -A', { cwd: 'C:/app2026/easyInvoice' });
  try {
    execSync('git commit -m "feat: Multi-tenant profile isolation security fix and production build"', { cwd: 'C:/app2026/easyInvoice' });
  } catch (e) {}
  const res2 = execSync('git push origin master', { cwd: 'C:/app2026/easyInvoice' }).toString();
  console.log('✅ easyInvoice pushed successfully to master:\n', res2);
} catch (e) {
  console.error('❌ easyInvoice push error:', e.stdout ? e.stdout.toString() : e.message);
}

console.log('--- 3. Deploying easyInvoice to Firebase ---');
try {
  const fbRes1 = execSync('firebase deploy --only "hosting,firestore" --non-interactive', { cwd: 'C:/app2026/easyInvoice' }).toString();
  console.log('✅ easyInvoice Firebase Deploy:\n', fbRes1);
} catch (e) {
  console.error('❌ easyInvoice Firebase deploy note:', e.stdout ? e.stdout.toString() : e.message);
}

console.log('--- 4. Deploying WHATANAGENT to Firebase ---');
try {
  const fbRes2 = execSync('firebase deploy --only "hosting,firestore" --non-interactive', { cwd: 'C:/app2026/WHATANAGENT' }).toString();
  console.log('✅ WHATANAGENT Firebase Deploy:\n', fbRes2);
} catch (e) {
  console.error('❌ WHATANAGENT Firebase deploy note:', e.stdout ? e.stdout.toString() : e.message);
}
