// main.ts
import {
	App,
	FileSystemAdapter,
	MarkdownView,
	Notice,
	Plugin
} from "obsidian";
import {
	findAudioLinkMatches,
	resolveMatchesToFiles,
	AudioLinkFile
} from "./link_finder";
import { chooseAudioLinkModal } from "./choose_link_modal";
import {
	runWhisperCLI,
	getTranscriptPathInTmp,
	readTranscriptFile
} from "./transcription";
import { insertTranscriptBelowRange } from "./insert_transcript";

export default class LocalWhisperPlugin extends Plugin {
	async onload() {
		console.log("Loading Local Whisper Plugin (Modular)...");

		this.addCommand({
			id: "transcribe-audio-in-note",
			name: "Transcribe Audio Link in Note",
			checkCallback: (checking: boolean) => {
				const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!mdView) return false;
				if (checking) return true;

				this.transcribeAudioInCurrentNote(mdView);
				return true;
			},
		});
	}

	onunload() {
		console.log("Unloading Local Whisper Plugin (Modular)...");
	}

	private async transcribeAudioInCurrentNote(mdView: MarkdownView) {
		const editor = mdView.editor;
		const noteContent = editor.getValue();
		const currentFile = mdView.file!;

		// 1) Find raw link matches (like "SomeFolder/Meeting.m4a")
		const linkMatches = findAudioLinkMatches(noteContent);

		// 2) Resolve them to TFiles
		const audioFiles = resolveMatchesToFiles(
			this.app,
			linkMatches,
			currentFile.path
		);

		if (audioFiles.length === 0) {
			new Notice("No valid audio links found in this note.");
			return;
		}

		// 3) If multiple, show a modal
		let selected: AudioLinkFile;
		if (audioFiles.length === 1) {
			selected = audioFiles[0];
		} else {
			const chosen = await chooseAudioLinkModal(this.app, audioFiles);
			if (!chosen) return; // user canceled
			selected = chosen;
		}

		new Notice(`Transcribing: ${selected.tfile.path} ...`);

		// 4) Build an absolute path
		const adapter = this.app.vault.adapter;
		if (!(adapter instanceof FileSystemAdapter)) {
			new Notice("Your vault is not on a local file system.");
			return;
		}
		const vaultRoot = adapter.getBasePath();
		const absoluteAudioPath = require("path").join(vaultRoot, selected.tfile.path);

		// 5) Run Whisper
		try {
			// Hardcode or let the user specify:
			const whisperBinPath = "/opt/homebrew/bin/whisper";
			const model = "medium";
			await runWhisperCLI(whisperBinPath, absoluteAudioPath, model);
		} catch (err) {
			console.error("Error running Whisper:", err);
			new Notice("Error running Whisper. See console for details.");
			return;
		}

		// 6) Construct transcript path and read it
		const transcriptPath = getTranscriptPathInTmp(absoluteAudioPath);
		let transcript = "";
		try {
			transcript = readTranscriptFile(transcriptPath);
		} catch (e) {
			console.error("Could not read transcript:", e);
			new Notice("Could not read the transcript file.");
			return;
		}

		// 7) Insert into the note
		insertTranscriptBelowRange(
			editor,
			selected.startPos,
			selected.endPos,
			transcript
		);

		new Notice("Transcription inserted!");
	}
}
