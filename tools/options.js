import fs from "fs"
import path from "path";

import toml from 'toml'

export function buildOptions() {
    const config = toml.parse(fs.readFileSync("obsidian_hugo.toml"));
    const options = {}

    options.obsidianVault = config["obsidianVault"];
    options.hugoPath = config["hugo"]

    options.hugoContent = config["hugoContent"];
    if (!path.isAbsolute(options.hugoContent)) {
        options.hugoContent = path.join(options.hugoPath, options.hugoContent);
    }

    options.hugoPublic = config["hugoPublic"];
    if (!path.isAbsolute(options.hugoPublic)) {
        options.hugoPublic = path.join(options.hugoPath, options.hugoPublic)
    }

    options.unsafeRender = config["unsafeRender"];

    options.imageResize = config["imageResize"];
    options.imageResizeWidthMax = config["imageResizeWidthMax"];
    options.imageResizeHeightMax = config["imageResizeHeightMax"];

    console.log("options: " + JSON.stringify(options, null, 2));

    // secret options
    options.netlifySite = config["netlifySite"];
    options.netlifyToken = config["netlifyToken"];

    return options;
}