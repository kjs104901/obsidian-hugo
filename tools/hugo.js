import hugo from "hugo-extended";
import { spawn } from "child_process";

export async function exeHugo(options, params) {
    const hugoSpawn = spawn(await hugo(), params, { cwd: options.hugoPath });

    hugoSpawn.stdout.on('data', (data) => {
        console.log(data.toString());
    });

    hugoSpawn.stderr.on('data', (data) => {
        console.error(data.toString());
    });

    hugoSpawn.on('exit', (code) => {
        console.log('hugo exited with code ' + code.toString());
    });
}
