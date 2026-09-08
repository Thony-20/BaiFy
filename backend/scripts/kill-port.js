import { execSync } from 'child_process';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const port = String(process.env.PORT || '3000');

try {
    const output = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
    const pids = new Set();

    for (const line of output.split(/\r?\n/)) {
        if (!line.includes('LISTENING')) continue;
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid) && pid !== '0') {
            pids.add(pid);
        }
    }

    for (const pid of pids) {
        try {
            execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
            console.log(`Proceso ${pid} liberado del puerto ${port}`);
        } catch {
            // El proceso pudo haberse cerrado solo.
        }
    }

    if (pids.size === 0) {
        console.log(`Puerto ${port} libre`);
    }
} catch {
    console.log(`Puerto ${port} libre`);
}
