// linkFinder.ts
import { App, TFile } from "obsidian";

/** A raw match in the note's text, with the link text and its positions. */
export interface LinkMatch {
    linkText: string;
    startPos: number;
    endPos: number;
}

/** We store the final resolved TFile and the note positions. */
export interface AudioLinkFile {
    tfile: TFile;
    startPos: number;
    endPos: number;
}

/**
 * Use regex to find references that end with .mp3, .m4a, etc.
 * e.g. [Label](MyRecording.m4a) or [[MyRecording.m4a]]
 */
export function findAudioLinkMatches(noteContent: string): LinkMatch[] {
    const audioExtensions = ["mp3", "wav", "m4a", "flac", "ogg", "aac"];
    const extPattern = audioExtensions.join("|");

    // Captures either:
    //   1) [Label](Something.ext)
    //   2) [[Something.ext]]
    // group(2) or group(3) is the link text
    const linkRegex = new RegExp(
        `\\[([^\\]]*)\\]\\(([^)]+(?:${extPattern}))\\)|\\[\\[([^\\]]+(?:${extPattern}))\\]\\]`,
        "gi"
    );

    const results: LinkMatch[] = [];
    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(noteContent)) !== null) {
        const linkText = match[2] || match[3];
        if (!linkText) continue;

        results.push({
            linkText,
            startPos: match.index,
            endPos: linkRegex.lastIndex,
        });
    }
    return results;
}

/**
 * Convert each LinkMatch into an AudioLinkFile by using Obsidian's metadata cache.
 * This means we actually find the TFile in the vault, if it exists.
 */
export function resolveMatchesToFiles(
    app: App,
    linkMatches: LinkMatch[],
    currentFilePath: string
): AudioLinkFile[] {
    const results: AudioLinkFile[] = [];
    for (const match of linkMatches) {
        const tfile = app.metadataCache.getFirstLinkpathDest(
            match.linkText,
            currentFilePath
        );
        if (tfile) {
            results.push({
                tfile,
                startPos: match.startPos,
                endPos: match.endPos,
            });
        }
    }
    return results;
}
