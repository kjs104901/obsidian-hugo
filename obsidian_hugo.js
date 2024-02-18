import fs from "fs"
import path from "path";

import hugo from "hugo-extended";
import { spawn } from "child_process";
import chokidar from "chokidar";
import AsyncLock from "async-lock";
import toml from 'toml'

(async () => {
    if (process.argv.length < 3) {
        console.error("action needed");
        return;
    }

    const action = process.argv[2];

    const config = toml.parse(fs.readFileSync("obsidian_hugo.toml"));

    let obsidianVault = config["obsidianVault"];
    let hugoPath = config["hugo"]

    let hugoContent = config["hugoContent"];
    if (!path.isAbsolute(hugoContent)) {
        hugoContent = path.join(hugoPath, hugoContent)
    }

    console.log("obsidianVault: " + obsidianVault);
    console.log("hugo: " + hugoPath);
    console.log("hugoContent: " + hugoContent);

    if (action == 'init') {
        if (fs.existsSync(path.join(hugoPath, "hugo.toml"))) {
            return;
        }
        await exeHugo(hugoPath, ["new", "site", "."]);
    }
    else if (action == 'build') {
        if (!convertFolder(obsidianVault, hugoContent)) {
            console.error("convert failed")
            return;
        }
        await exeHugo(hugoPath, []);
    }
    else if (action == 'start') {
        var lock = new AsyncLock();

        if (!convertFolder(obsidianVault, hugoContent)) {
            console.error("convert failed")
            return;
        }

        chokidar.watch(obsidianVault).on('change', (eventPath, eventStats) => {
            eventPath = eventPath.replace(obsidianVault + path.sep, '');

            if (eventPath.includes(".obsidian")) {
                return;
            }

            lock.acquire("convert", (done) => {
                console.log("Change detected, re-convert obsidian: " + eventPath)
                if (!convertFile(obsidianVault, hugoContent, eventPath)) {
                    console.error("convert failed")
                    return;
                }
                done();
            });
        });

        await exeHugo(hugoPath, ["server"]);
    }
    else {
        console.error("Unknown action: " + action)
    }
})();


async function exeHugo(hugoPath, params) {
    const hugoSpawn = spawn(await hugo(), params, { cwd: hugoPath });

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




// converter //

export function convertFolder(obsidianVault, hugoContent) {
    const obsidianFiles = buildObsidianFiles(obsidianVault);
    if (!obsidianFiles.files) {
        console.error("failed to build obsidianfiles: " + obsidianVault)
        return false;
    }

    // clear output dir
    if (fs.existsSync(hugoContent)) {
        fs.rmSync(hugoContent, { recursive: true, force: true })
    }
    fs.mkdirSync(hugoContent, { recursive: true })

    obsidianFiles.files.forEach(file => {
        convert(obsidianVault, obsidianFiles, hugoContent, file);
    });

    return true;
}

export function convertFile(obsidianVault, hugoContent, file) {
    const obsidianFiles = buildObsidianFiles(obsidianVault);
    if (!obsidianFiles.files) {
        console.error("failed to build obsidianfiles: " + obsidianVault)
        return false;
    }
    convert(obsidianVault, obsidianFiles, hugoContent, file);
    return true;
}

function convert(obsidianVault, obsidianFiles, hugoContent, file) {
    const source = path.join(obsidianVault, file);
    const target = path.join(hugoContent, file);
    ensureOutputDir(target);

    if (path.parse(file).ext == ".md") {
        let sourceStr = fs.readFileSync(source, { encoding: 'utf-8', flag: 'r' });

        sourceStr = replaceWikilink(sourceStr, obsidianFiles.fileLinks)
        sourceStr = replaceRelativeLink(sourceStr, obsidianFiles.fileLinks)
        sourceStr = replaceHighlight(sourceStr)

        fs.writeFileSync(target, sourceStr);
    }
    else {
        fs.copyFileSync(source, target);
    }
    return true;
}

function buildObsidianFiles(obsidianVault) {
    const result = {}

    if (!fs.existsSync(obsidianVault)) {
        console.error("vault not exist: " + obsidianVault)
        return result;
    }

    result.files = fs.readdirSync(obsidianVault, { recursive: true }).filter(file => {
        const parsed = path.parse(file);
        if (parsed.dir == ".obsidian" || parsed.dir.startsWith(".obsidian" + path.sep)) {
            return false;
        }
        if (parsed.ext == "") {
            return false;
        }
        return true;
    });

    result.fileLinks = result.files.map(file => {
        let result = file.replaceAll(path.sep, "/");
        if (result.endsWith(".md")) {
            result = result.slice(0, -3);
        }
        return makePageName(result);
    });

    return result;
}

function ensureOutputDir(target) {
    const targetParsed = path.parse(target);
    if (!fs.existsSync(targetParsed.dir)) {
        fs.mkdirSync(targetParsed.dir, { recursive: true, force: true })
    }
}

function replaceWikilink(text, fileLinks) {
    const wikiLinkRegex = /\[\[(.*?)\]\]/g;

    return text.replace(wikiLinkRegex, (token, wikilink) => {
        let link = wikilink;
        let text = wikilink;

        if (link.includes("|")) {
            const splited = link.split("|");
            link = splited[0];
            text = splited[1];
        }

        link = makePageName(link);

        if (!fileLinks.includes(link)) {
            let found = false;
            fileLinks.forEach(fileLink => {
                if (fileLink.endsWith("/" + link)) {
                    found = true;
                    link = fileLink
                }
            });

            if (!found) {
                console.error("faile to find wikilink: " + link);
                return token;
            }
        }

        if (link.endsWith("_index")) {
            link = link.slice(0, -6);
        }

        return `[${text}](/${link})`
    });
}

function replaceRelativeLink(text, fileLinks) {
    const linkRegex = /\[(.*)\]\((.*?)\)/g;

    return text.replace(linkRegex, (token, text, link) => {
        if (link.startsWith("/") || link.startsWith("http:") || link.startsWith("https:")) {
            return token;
        }

        link = makePageName(link);

        if (!fileLinks.includes(link)) {
            let found = false;
            fileLinks.forEach(fileLink => {
                if (fileLink.endsWith("/" + link)) {
                    found = true;
                    link = fileLink
                }
            });

            if (!found) {
                console.error("faile to find relative link: " + link);
                return token;
            }
        }

        if (link.endsWith("_index")) {
            link = link.slice(0, -6);
        }
        return `[${text}](/${link})`
    });
}

function replaceHighlight(text) {
    const highlightRegex = /\=\=(.+)\=\=/g;

    return text.replace(highlightRegex, (token, text) => {
        return `<mark>${text}</mark>`
    });
}

function makePageName(name) {
    const parsed = path.parse(name);
    if (parsed.ext == "") {
        return name.toLowerCase().replace(/ /g, "-");
    }
    return name;
}

function replaceCallout(params) {

    /*
    {{< hint info >}}
**Markdown content**  
Lorem markdownum insigne. Olympo signis Delphis! Retexi Nereius nova develat
stringit, frustra Saturnius uteroque inter! Oculis non ritibus Telethusa
{{< /hint >}}

> [!note] 이것만 알아두세요!
> 옵시디언은 정말 편한 도구입니다.
> de


> [!note] 이것만 알아두세요!
> 옵시디언은 정말 편한 도구입니다.
> de

>[!error] what?
ewf
어디까지 적용?
ㄹ


Callout 지원리스트
Callout 문법이 좋은 이유는 위의 문법에서 [!note] 부분을 다음과 같은 키워드로 바꿔주면 알맞은 아이콘에 색상이 다른 Callout 상자가 생성된다는 것입니다. 한번씩 시도해보세요! (같은 줄에 있는 단어들은 같은 아이콘 유사어들입니다.)


https://help.obsidian.md/Editing+and+formatting/Callouts


[!note]
[!abstract], [!summary], [!tldr]
[!info]
[!todo]
[!tip], [!hint], [!important]
[!success], [!check], [!done]
[!question], [!help], [!faq]
[!warning], [!caution], [!attention]
[!failure], [!fail], [!missing]
[!danger], [!error]
[!bug]
[!example]
[!quote], [!cite]
    */
}

function imageResize(params) {

    /**
     * ![위키피디아 흑요석|100x100](https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/ObsidianOregon.jpg/360px-ObsidianOregon.jpg)
     * 
     * 
     * https://gohugo.io/content-management/image-processing/
     */
}