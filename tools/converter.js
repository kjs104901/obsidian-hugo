import fs from "fs"
import path from "path";

import sharp from "sharp";

const imageExtList = [".jpg", ".jpeg", ".png", ".bmp", ".gif", ".tif", ".tiff", ".webp"]

const wikiImageRegex = /\!\[\[(.*?)\]\]/g;
const imageRegex = /\!\[(.*)\]\((.*?)\)/g;

const wikiLinkRegex = /\[\[(.*?)\]\]/g;
const linkRegex = /\[(.*)\]\((.*?)\)/g;

const highlightRegex = /\=\=(.+)\=\=/g;
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
        fs.rmSync(options.hugoContent, {recursive: true, force: true})
    }
    fs.mkdirSync(options.hugoContent, {recursive: true})

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
    const targetContent = path.join(options.hugoContent, file);

    const ext = path.parse(file).ext.toLowerCase();

    ensureOutputDir(targetContent);

    if (ext === ".md") {
        let sourceStr = fs.readFileSync(source, {encoding: 'utf-8', flag: 'r'});

        sourceStr = sourceStr.replace(imageRegex, (token, text, link) =>
            replaceImage(token, text, link, options.obsidianFiles.fileLinks, options.unsafeRender))

        sourceStr = sourceStr.replace(wikiImageRegex, (token, wikilink) =>
            replaceWikiImage(token, wikilink, options.obsidianFiles.fileLinks, options.unsafeRender))

        sourceStr = sourceStr.replace(linkRegex, (token, text, link) =>
            replaceLink(token, text, link, options.obsidianFiles.fileLinks))

        sourceStr = sourceStr.replace(wikiLinkRegex, (token, wikilink) =>
            replaceWikilink(token, wikilink, options.obsidianFiles.fileLinks))

        sourceStr = replaceCallout(sourceStr)
        sourceStr = replaceHighlight(sourceStr, options.unsafeRender)

        fs.writeFileSync(targetContent, sourceStr);
    } else if (imageExtList.includes(ext)) {
        if (options.imageResize) {
            const image = sharp(source)

            image.metadata().then((metadata) => {
                if (metadata.width > options.imageResizeWidthMax || metadata.height > options.imageResizeHeightMax) {
                    image
                        .resize(options.imageResizeWidthMax, options.imageResizeHeightMax, {fit: "inside"})
                        .toFile(targetContent);
                } else {
                    fs.copyFileSync(source, targetContent);
                }
            })
        }
    } else {
        console.log("ext: " + ext)
        fs.copyFileSync(source, targetContent);
    }
    return true;
}

function buildObsidianFiles(obsidianVault) {
    const result = {}

    if (!fs.existsSync(obsidianVault)) {
        console.error("vault not exist: " + obsidianVault)
        return result;
    }

    result.files = fs.readdirSync(obsidianVault, {recursive: true}).filter(file => {
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
        return result;
    });

    return result;
}

function ensureOutputDir(target) {
    const targetParsed = path.parse(target);
    if (!fs.existsSync(targetParsed.dir)) {
        fs.mkdirSync(targetParsed.dir, {recursive: true, force: true})
    }
}

function getRelativeLink(link, fileLinks) {
    if (fileLinks.includes(link))
        return `/${link}`

    let found = false;
    fileLinks.forEach(fileLink => {
        if (fileLink.endsWith("/" + link)) {
            found = true;
            link = fileLink
        }
    });

    if (!found) {
        console.error("failed to find wikilink: " + link);
        return null;
    }

    if (link.endsWith("_index")) {
        link = link.slice(0, -6);
    }
    return `/${link}`
}

function getLinkText(wikilink) {
    let link = wikilink;
    let text = wikilink;
    if (link.includes("|")) {
        const split = link.split("|");
        link = split[0];
        text = split[1];
    }
    return {link, text};
}

function getImageInfo(text) {
    const originalText = text;

    if (text.includes("|")) {
        text = text.split("|")[1];
    }

    let widthStr = text;
    let heightStr = "0";

    if (text.includes("x")) {
        const split = text.split("x");
        widthStr = split[0];
        heightStr = split[1];
    }

    if (isNaN(widthStr) || isNaN(heightStr)) {
        return {alt: originalText, width: "", height: ""};
    }

    const width = widthStr * 1;
    const height = heightStr * 1;

    if (height > 0) {
        return {alt: "", width: `width=${width}`, height: `height=${height}`};
    }
    return {alt: "", width: `width=${width}`, height: ""};

}

function replaceWikiImage(token, wikilink, fileLinks, isUnsafeRender) {
    let {link, text} = getLinkText(wikilink);

    link = getRelativeLink(link, fileLinks)
    if (!link) {
        return token;
    }

    const ext = path.parse(link).ext.toLowerCase();
    if (!imageExtList.includes(ext))
        return token;

    const {alt, width, height} = getImageInfo(text);
    if (isUnsafeRender) {
        return `\n<p><img src="${link}" alt="${alt}" ${width} ${height}></p>\n`
    }
    return `{{< figure src="${link}" alt="${alt}" ${width} ${height} >}}`

}

function replaceImage(token, text, link, fileLinks, isUnsafeRender) {
    if (link.startsWith("/") || link.startsWith("http:") || link.startsWith("https:")) {
        //link = link;
    } else {
        link = getRelativeLink(link, fileLinks)
        if (!link) {
            return token;
        }
    }

    const ext = path.parse(link).ext.toLowerCase();
    if (!imageExtList.includes(ext))
        return token;

    const {alt, width, height} = getImageInfo(text);
    if (isUnsafeRender) {
        return `\n<p><img src="${link}" alt="${alt}" ${width} ${height}></p>\n`
    }
    return `{{< figure src="${link}" alt="${alt}" ${width} ${height} >}}`
}

function replaceWikilink(token, wikilink, fileLinks) {
    let {link, text} = getLinkText(wikilink);

    link = getRelativeLink(link, fileLinks)
    if (!link) {
        return token;
    }

    return `[${text}]({{< ref "${link}" >}})`
}

function replaceLink(token, text, link, fileLinks) {
    if (link.startsWith("/") || link.startsWith("http:") || link.startsWith("https:")) {
        return token;
    }

    link = getRelativeLink(link, fileLinks)
    if (!link) {
        return token;
    }
    return `[${text}](${link})`
}

function replaceHighlight(doc, isUnsafe) {
    return doc.replace(highlightRegex, (token, text) => {
        return isUnsafe ? `<mark>${text}</mark>` : `**${text}**`;
    });
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