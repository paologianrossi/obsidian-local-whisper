// insertTranscript.ts
import { Editor } from "obsidian";

/**
 * Insert the transcript text immediately after the matched link text,
 * based on the link's end index in the note content.
 */
export function insertTranscriptBelowRange(
    editor: Editor,
    startPos: number,
    endPos: number,
    transcript: string
) {
    const content = editor.getValue();

    // Figure out how many lines are before 'endPos'
    const preText = content.substring(0, endPos);
    const lineIndex = preText.split("\n").length - 1;

    // We'll insert on the line after that
    const insertionPos = { line: lineIndex + 1, ch: 0 };
    const insertionText = `\n>[!note] Transcription\n${transcript}\n`;
    editor.replaceRange(insertionText, insertionPos);
}
