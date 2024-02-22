import fs from "fs"
import path from "path";

import sharp from "sharp";

const imageExtList = [".jpg", ".jpeg", ".png"]

const wikiLinkRegex = /\[\[(.*?)\]\]/g;
const linkRegex = /\[(.*)\]\((.*?)\)/g;
const highlightRegex = /\=\=(.+)\=\=/g;
const imageRegex = /\!\[(.*)\]\((.*?)\)/g;
const calloutRegex = /\>\s*\[\!(.*)\](.*)/g;

const calloutEmoji = {
    "note": "✏️",
    "abstract": "📋", "summary": "📋", "tldr": "📋",
    "info": "ℹ️",
    "todo": "☑️",
    "tip": "💡", "hint": "💡", "important": "💡",
    "success": "✅", "check": "✅", "done": "✅",
    "question": "❓", "help": "❓", "faq": "❓",
    "warning": "⚠️", "caution": "⚠️", "attention": "⚠️",
    "failure": "❌", "fail": "❌", "missing": "❌",
    "danger": "🚨", "error": "🚨",
    "bug": "🐛",
    "example": "🧾",
    "quote": "❝", "cite": "❝"
};


export function convertFolder(options) {
    options.obsidianFiles = buildObsidianFiles(options.obsidianVault);
    if (!options.obsidianFiles.files) {
        console.error("failed to build obsidianfiles: " + options.obsidianVault)
        return false;
    }

    // clear output dir
    if (fs.existsSync(options.hugoContent)) {
        fs.rmSync(options.hugoContent, { recursive: true, force: true })
    }
    fs.mkdirSync(options.hugoContent, { recursive: true })

    options.obsidianFiles.files.forEach(file => {
        convert(options, file);
    });

    return true;
}

export function convertFile(options, file) {
    options.obsidianFiles = buildObsidianFiles(options.obsidianVault);
    if (!options.obsidianFiles.files) {
        console.error("failed to build obsidianfiles: " + options.obsidianVault)
        return false;
    }
    convert(options, file);
    return true;
}

function convert(options, file) {
    const source = path.join(options.obsidianVault, file);
    const target = path.join(options.hugoContent, file);
    ensureOutputDir(target);

    const ext = path.parse(file).ext.toLowerCase();

    if (ext === ".md") {
        let sourceStr = fs.readFileSync(source, { encoding: 'utf-8', flag: 'r' });

        sourceStr = replaceWikilink(sourceStr, options.obsidianFiles.fileLinks)
        sourceStr = replaceRelativeLink(sourceStr, options.obsidianFiles.fileLinks)

        if (options.unsafeRender) {
            sourceStr = replaceHighlight(sourceStr)
            sourceStr = replaceImageResize(sourceStr)
            sourceStr = replaceCallout(sourceStr)
        }

        fs.writeFileSync(target, sourceStr);
    }
    else if (imageExtList.includes(ext)) {
        if (options.imageResize) {
            const image = sharp(source)

            image.metadata().then((metadata) => {
                if (metadata.width > options.imageResizeWidthMax || metadata.height > options.imageResizeHeightMax) {
                    image
                        .resize(options.imageResizeWidthMax, options.imageResizeHeightMax, { fit: "inside" })
                        .toFile(target);
                }
                else {
                    fs.copyFileSync(source, target);
                }
            })
        }
    }
    else {
        console.log("ext: " + ext)
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
        if (parsed.dir === ".obsidian" || parsed.dir.startsWith(".obsidian" + path.sep)) {
            return false;
        }
        if (parsed.ext === "") {
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
                console.error("failed to find wikilink: " + link);
                return token;
            }
        }

        if (link.endsWith("_index")) {
            link = link.slice(0, -6);
        }

        return `[${text}](/${link})`
    });
}

function replaceRelativeLink(doc, fileLinks) {
    return doc.replace(linkRegex, (token, text, link) => {
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
                console.error("failed to find relative link: " + link);
                return token;
            }
        }

        if (link.endsWith("_index")) {
            link = link.slice(0, -6);
        }
        return `[${text}](/${link})`
    });
}

function replaceHighlight(doc) {
    return doc.replace(highlightRegex, (token, text) => {
        return `<mark>${text}</mark>`
    });
}

function makePageName(doc) {
    const parsed = path.parse(doc);
    if (parsed.ext === "") {
        return doc.toLowerCase().replace(/ /g, "-");
    }
    return doc;
}

function replaceCallout(doc) {
    return doc.replace(calloutRegex, (token, callout, body) => {
        const emoji = calloutEmoji[callout];
        if (emoji) {
            if (body) {
                return `> **${emoji} ${body}**`;
            }
            return `> **${emoji} ${callout}**`;
        }
        return token;
    })
}

function replaceImageResize(doc) {
    return doc.replace(imageRegex, (token, size, link) => {
        if (false === /\.(jpg|jpeg|png|webp|avif|gif|svg)$/.test(link)) {
            return token;
        }

        let name = "";

        if (size.includes("|")) {
            const splited = size.split("|");
            name = splited[0];
            size = splited[1];
        }

        let widthStr = size;
        let heightStr = "0";
        if (size.includes("x")) {
            const splited = size.split("x");
            widthStr = splited[0];
            heightStr = splited[1];
        }

        if (isNaN(widthStr) || isNaN(heightStr)) {
            return token;
        }

        const width = widthStr * 1;
        const height = heightStr * 1;

        if (height > 0) {
            return `\n<p><img src="${link}" alt="${name}" width="${width}" height="${height}"></p>\n`
        }
        return `\n<p><img src="${link}" alt="${name}" width="${width}"></p>\n`
    });
}