import { spawn } from "child_process";

export async function exeNetlify(options, params) {
    params.push("--site");
    params.push(options.netlifySite);

    params.push("--auth");
    params.push(options.netlifyToken);

    params.push("--dir");
    params.push(options.hugoPublic);

    const netlifySpawn = spawn('cmd', ["/c", "netlify"].concat(params));

    netlifySpawn.stdout.on('data', (data) => {
        console.log(data.toString());
    });

    netlifySpawn.stderr.on('data', (data) => {
        console.error(data.toString());
    });

    netlifySpawn.on('exit', (code) => {
        console.log('netlify exited with code ' + code.toString());
    });
}