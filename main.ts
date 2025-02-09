import {
	App,
	Editor,
	FileSystemAdapter,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting
} from "obsidian";
import { execFile } from "child_process";
import { promisify } from "util";

import * as path from "path";
import * as fs from "fs";

// We'll turn 'exec' into a Promise-based function.
const execFileAsync = promisify(execFile);



/** Define the shape of our plugin settings. */
interface LocalWhisperSettings {
	/** The Whisper model name, e.g. "tiny", "base", "small", "medium", "large" */
	whisperModel: string;

	/**
	 * Absolute path to the Whisper CLI binary, e.g. "/opt/homebrew/bin/whisper"
	 * If left blank, we'll just call "whisper" from the system PATH.
	 */
	whisperBinaryPath: string;
}

/** Default values for the settings. */
const DEFAULT_SETTINGS: LocalWhisperSettings = {
	whisperModel: "base",
	whisperBinaryPath: "", // empty means "just call whisper from PATH"
};

/**
 * The main plugin class that Obsidian will load.
 * Replace "LocalWhisperPlugin" with any name you like.
 */
export default class LocalWhisperPlugin extends Plugin {
	async onload() {
		console.log("Loading Local Whisper Plugin...");

		// Register a command in the Command Palette
		this.addCommand({
			id: "transcribe-audio-in-note",
			name: "Transcribe Audio Link in Note",
			checkCallback: (checking: boolean) => {
				// Only show this command if we're looking at a Markdown note
				const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!mdView) return false;
				if (checking) return true;

				// Actually run the transcription process
				this.transcribeAudioInCurrentNote(mdView);
				return true;
			},
		});
	}

	onunload() {
		console.log("Unloading Local Whisper Plugin...");
	}

	/**
	 * Main logic flow:
	 * 1. Find audio links in the note.
	 * 2. Pick which link if there's more than one.
	 * 3. Build an absolute path (so Whisper can find the file).
	 * 4. Run Whisper CLI to get a .txt transcript.
	 * 5. Read the .txt and insert into the note.
	 */
	private async transcribeAudioInCurrentNote(mdView: MarkdownView) {
		const editor = mdView.editor;
		const noteContent = editor.getValue();

		// 1) Find audio links
		const audioLinks = findAudioLinks(noteContent);
		if (audioLinks.length === 0) {
			new Notice("No audio links found in this note.");
			return;
		}

		// 2) If multiple, show a modal to pick. If only one, use that.
		let selectedLink: AudioLink | null;
		if (audioLinks.length === 1) {
			selectedLink = audioLinks[0];
		} else {
			selectedLink = await chooseAudioLinkModal(this.app, audioLinks);
			if (!selectedLink) return; // user canceled
		}

		new Notice(`Transcribing: ${selectedLink.filePath} ...`);

		// -- Convert the vault-relative file path to an absolute path --
		const adapter = this.app.vault.adapter;
		if (!(adapter instanceof FileSystemAdapter)) {
			new Notice("Your vault does not appear to use a local file system.");
			return;
		}
		const vaultRoot = adapter.getBasePath(); // e.g. "/Users/Me/MyObsidianVault"
		const absoluteAudioPath = path.join(vaultRoot, selectedLink.filePath);

		// 3) Run Whisper CLI
		try {
			// You can change "--model base" to something else if you want smaller or bigger models.
			await runWhisperCLI(absoluteAudioPath, "medium");
		} catch (err) {
			console.error("Error running Whisper:", err);
			new Notice("Error running Whisper. See console for details.");
			return;
		}

		// 4) Whisper CLI creates a .txt file with same base name.
		const transcriptPath = getTranscriptPath(absoluteAudioPath);

		// 5) Read the .txt with fs
		let transcriptText = "";
		try {
			transcriptText = fs.readFileSync(transcriptPath, "utf-8").trim();
		} catch (readErr) {
			console.error("Could not read transcript file:", readErr);
			new Notice("Could not read the transcript file.");
			return;
		}

		// 6) Insert transcript below the link in the note
		insertTranscriptBelowLink(editor, selectedLink, transcriptText);

		new Notice("Transcription inserted.");

	}
}

/**
 * Interface to represent a matched audio link in the note.
 */
interface AudioLink {
	filePath: string; // the path text, e.g. "Audio/meeting.m4a"
	startPos: number; // position in the note text
	endPos: number;   // position in the note text
}

/**
 * Regex-based function to find Markdown or bracketed links
 * that end with .mp3, .wav, .m4a, .flac, .ogg, .aac, etc.
 *
 * Example match:
 * [Meeting Audio](Audio/meeting.m4a)
 * or <Audio/meeting.mp3>
 */
function findAudioLinks(noteContent: string): AudioLink[] {
	const audioExtensions = ["mp3", "wav", "m4a", "flac", "ogg", "aac"];
	const extPattern = audioExtensions.join("|");

	// Captures either [Text](file.ext) or <file.ext>
	const linkRegex = new RegExp(
		`\\[([^\\]]*)\\]\\(([^)]+(?:${extPattern}))\\)|\\[\\[([^\\[]+(?:${extPattern}))\\]\\]`,
		"gi"
	);

	const results: AudioLink[] = [];
	let match: RegExpExecArray | null;

	while ((match = linkRegex.exec(noteContent)) !== null) {
		// match[2] is from the parentheses, or match[3] is from the angle brackets
		const filePath = match[2] || match[3];
		if (!filePath) continue;

		results.push({
			filePath,
			startPos: match.index,
			endPos: linkRegex.lastIndex,
		});
	}

	return results;
}

/**
 * If there's more than one audio link, pop up a modal with buttons for each link.
 */
async function chooseAudioLinkModal(app: App, links: AudioLink[]): Promise<AudioLink | null> {
	return new Promise((resolve) => {
		const modal = new ChooseLinkModal(app, links, resolve);
		modal.open();
	});
}

class ChooseLinkModal extends Modal {
	private links: AudioLink[];
	private resolveFn: (value: AudioLink | null) => void;

	constructor(app: App, links: AudioLink[], resolveFn: (value: AudioLink | null) => void) {
		super(app);
		this.links = links;
		this.resolveFn = resolveFn;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: "Choose an audio link to transcribe" });

		this.links.forEach((link) => {
			const btn = contentEl.createEl("button", { text: link.filePath });
			btn.addEventListener("click", () => {
				this.resolveFn(link);
				this.close();
			});
			contentEl.createEl("br");
		});

		const cancelBtn = contentEl.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => {
			this.resolveFn(null);
			this.close();
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}

/**
 * Actually call the Whisper CLI:
 *   whisper "/absolute/path/to/file.m4a" --model base
 * This generates "file.m4a.txt" in the same folder.
 *
 * If you need a custom PATH environment, or an absolute path
 * to 'whisper' itself, you can adjust here.
 */
async function runWhisperCLI(absoluteFilePath: string, model: string) {
	// For advanced scenarios, you might do:
	//   const command = `/opt/homebrew/bin/whisper "${absoluteFilePath}" --model ${model}`;
	// If the user doesn't have whisper on a known PATH.
	const file = "/opt/homebrew/bin/whisper";
	const args = [absoluteFilePath, "--model", model, "--output_format", "txt", "--output_dir", "/tmp"];
	const command = `/opt/homebrew/bin/whisper "${absoluteFilePath}" --model ${model} --output_format txt --output_dir "/tmp"`;
	try {
		const { stdout, stderr } = await execFileAsync(file, args, {
			env: {
				...process.env,
				PATH: "/opt/homebrew/bin:" + process.env.PATH,
			},
		});
		if (stdout) {
			console.log("Whisper stdout:", stdout);
		}
		if (stderr) {
			console.warn("Whisper stderr:", stderr);
		}
	} catch (error) {
		console.error("Whisper execFile error:", error);
		throw error;
	}
}

/**
 * The Whisper CLI, by default, writes a .txt file with the same base name.
 * e.g. "meeting.m4a" -> "meeting.txt"
 */
function getTranscriptPath(absoluteFilePath: string): string {
	const fileName = path.basename(absoluteFilePath);
	return "/tmp/" + fileName.replace(/\.(mp3|wav|m4a|flac|ogg|aac)$/i, "") + ".txt";
}

/**
 * Insert the transcript text immediately below the matched audio link.
 */
function insertTranscriptBelowLink(editor: Editor, link: AudioLink, transcript: string) {
	const noteContent = editor.getValue();

	// Count how many line breaks occur before link.endPos
	const preText = noteContent.substring(0, link.endPos);
	const lineIndex = preText.split("\n").length - 1;

	// We'll insert our text on the next line after the link
	const insertionPos = { line: lineIndex + 1, ch: 0 };

	const insertionText = `\n>[!note] Transcription\n${transcript}\n`;
	editor.replaceRange(insertionText, insertionPos);
}
