import fs from "fs"
import path from "path";

import { spawn } from "child_process";

export function initVercel(options) {
    fs.writeFileSync(path.join(options.hugoPublic, '.gitignore'), '.vercel');

    fs.mkdirSync(path.join(options.hugoPublic, '.vercel'), { recursive: true });

    fs.writeFileSync(path.join(options.hugoPublic, '.vercel', 'project.json'), JSON.stringify({
        projectId: options.vercelProjectId,
        orgId: options.vercelOrg,
    }));
}

export async function exeVercel(options, params) {
    params.push("--token");
    params.push(options.vercelToken);

    params.push("--cwd");
    params.push(options.hugoPublic);

    const vercelSpawn = spawn("vercel", params, { shell: true });

    vercelSpawn.stdout.on('data', (data) => {
        console.log(data.toString());
    });

    vercelSpawn.stderr.on('data', (data) => {
        console.error(data.toString());
    });

    vercelSpawn.on('exit', (code) => {
        console.log('vercel exited with code ' + code.toString());
    });
}