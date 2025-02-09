// transcription.ts
import { execFile } from "child_process";
import { promisify } from "util";
import * as path from "path";
import * as fs from "fs";

const execFileAsync = promisify(execFile);

/**
 * Call the local Whisper CLI with arguments. Writes .txt to /tmp (or anywhere you want).
 */
export async function runWhisperCLI(whisperBinPath: string, audioPath: string, model: string) {
    // If the user didn't specify a custom bin path, default to just "whisper"
    const whisperPath = whisperBinPath || "whisper";

    // We'll store the .txt in /tmp
    const args = [
        audioPath,
        "--model", model,
        "--output_format", "txt",
        "--output_dir", "/tmp"
    ];

    // If you need a custom PATH, add it here.
    const options = {
        env: {
            ...process.env,
            PATH: "/opt/homebrew/bin:" + (process.env.PATH ?? "")
        }
    };

    console.log("[Transcription] Running whisper:", whisperPath, args);
    const { stdout, stderr } = await execFileAsync(whisperPath, args, options);
    if (stdout) console.log("Whisper stdout:", stdout);
    if (stderr) console.warn("Whisper stderr:", stderr);
}

/**
 * If your output_dir is /tmp and your input file is "Meeting.m4a",
 * you'll get "/tmp/Meeting.txt".
 */
export function getTranscriptPathInTmp(audioPath: string): string {
    const baseName = path.basename(audioPath); // "Meeting.m4a"
    const coreName = baseName.replace(/\.(mp3|wav|m4a|flac|ogg|aac)$/i, "");
    return `/tmp/${coreName}.txt`;
}

/**
 * Read the transcript from disk and return the text. Throw if not found.
 */
export function readTranscriptFile(transcriptPath: string): string {
    const data = fs.readFileSync(transcriptPath, "utf-8");
    return data.trim();
}
