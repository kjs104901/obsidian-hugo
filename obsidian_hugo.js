import fs from "fs"
import path from "path";

import chokidar from "chokidar";
import AsyncLock from "async-lock";

import { buildOptions } from "./tools/options.js";
import { exeHugo } from "./tools/hugo.js";
import { convertFolder, convertFile } from "./tools/converter.js";
import { exeNetlify } from "./tools/netlify.js";
import { initVercel, exeVercel } from "./tools/vercel.js";

// --------- Main --------- //
(async () => {
    if (process.argv.length < 3) {
        console.error("action needed");
        return;
    }

    const options = buildOptions();

    const action = process.argv[2];
    if (action === 'init') {
        await init(options);
    }
    else if (action === 'build') {
        await build(options);
    }
    else if (action === 'start') {
        await start(options);
    }
    else if (action === 'netlify') {
        await netlify(options);
    }
    else if (action === 'vercel') {
        await vercel(options);
    }
    else {
        console.error("Unknown action: " + action)
    }
})();


async function init(options) {
    if (fs.existsSync(join(options.hugoPath, "hugo.toml"))) {
        return;
    }
    await exeHugo(options["new", "site", "."]);
}

async function build(options) {
    if (!convertFolder(options)) {
        console.error("convert failed")
        return;
    }
    await exeHugo(options, []);
}

async function start(options) {
    var lock = new AsyncLock();

    if (!convertFolder(options)) {
        console.error("convert failed")
        return;
    }

    chokidar.watch(options.obsidianVault).on('change', (eventPath, eventStats) => {
        eventPath = eventreplace(options.obsidianVault + sep, '');

        if (eventincludes(".obsidian")) {
            return;
        }

        lock.acquire("convert", (done) => {
            console.log("Change detected, re-convert obsidian: " + eventPath)
            if (!convertFile(options, eventPath)) {
                console.error("convert failed")
                return;
            }
            done();
        });
    });

    await exeHugo(options, ["server"]);
}

async function netlify(options) {
    if (!convertFolder(options)) {
        console.error("convert failed")
        return;
    }
    await exeHugo(options, []);
    await exeNetlify(options, ["deploy", "--prod"]);
}

async function vercel(options) {
    if (!convertFolder(options)) {
        console.error("convert failed")
        return;
    }
    await exeHugo(options, []);
    initVercel(options);
    await exeVercel(options, ["--prod"]);
}