// chooseLinkModal.ts
import { App, Modal } from "obsidian";
import type { AudioLinkFile } from "./link_finder";

/** Show a small modal so the user can pick which link to transcribe. */
export async function chooseAudioLinkModal(
    app: App,
    items: AudioLinkFile[]
): Promise<AudioLinkFile | null> {
    return new Promise((resolve) => {
        const modal = new ChooseLinkModal(app, items, resolve);
        modal.open();
    });
}

class ChooseLinkModal extends Modal {
    private items: AudioLinkFile[];
    private resolveFn: (value: AudioLinkFile | null) => void;

    constructor(app: App, items: AudioLinkFile[], resolveFn: (value: AudioLinkFile | null) => void) {
        super(app);
        this.items = items;
        this.resolveFn = resolveFn;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h2", { text: "Choose an audio link to transcribe" });

        this.items.forEach((item) => {
            // We'll show the file path
            const btn = contentEl.createEl("button", { text: item.tfile.path });
            btn.addEventListener("click", () => {
                this.resolveFn(item);
                this.close();
            });
            contentEl.createEl("br");
        });

        // A Cancel button
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
