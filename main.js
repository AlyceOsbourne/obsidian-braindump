const obsidian = require('obsidian');

class BrainDump extends obsidian.Plugin {
    async onload() {
        await this.loadSettings();
        this.settings = new BrainDumpSettings(this.app, this);
        this.addSettingTab(this.settings);
        this.addRibbonIcon('pencil', 'Brain Dump', () => {
            new BrainDumpModal(this.app, this.settings).open();
        });
    }

    async loadSettings() {
        const data = await this.loadData();
        if (data) {
            this.settingsData = data;
        } else {
            this.settingsData = {
                customFolder: 'braindumps',
                customFilename: '',
                customDateFormat: 'YYYY-MM-DD HH:mm:ss',
                tags: 'braindump'
            };
        }
    }

    async saveSettings() {
        // Save settings to Obsidian's internal storage
        await this.saveData(this.settingsData);
    }
}

class BrainDumpSettings extends obsidian.PluginSettingTab {

    constructor(app, plugin) {
        super(app, plugin); 
        this.customFolder = plugin.settingsData.customFolder;
        this.customFilename = plugin.settingsData.customFilename;
        this.customDateFormat = plugin.settingsData.customDateFormat;
        this.tags = plugin.settingsData.tags;
    }
    

    display() {
        let {containerEl} = this;
        containerEl.empty();

        containerEl.createEl('h2', {text: 'Brain Dump Settings'});

        new obsidian.Setting(containerEl)
            .setName('Custom folder path')
            .setDesc('Optional folder path for brain dump files')
            .addText(text => text
                .setPlaceholder('Custom folder path')
                .setValue(this.plugin.settingsData.customFolder)
                .onChange(async (value) => {
                    this.plugin.settingsData.customFolder = value;
                    await this.plugin.saveSettings();
                }));
                
        new obsidian.Setting(containerEl)
            .setName('Custom date format')
            .setDesc('Optional date format for brain dump filenames')
            .addText(text => text
                .setPlaceholder('Custom date format')
                .setValue(this.plugin.settingsData.customDateFormat)
                .onChange(async (value) => {
                    this.plugin.settingsData.customDateFormat = value;
                    await this.plugin.saveSettings();
                }));
                
        new obsidian.Setting(containerEl)
            .setName('Tags')
            .setDesc('Optional tags for brain dump files')
            .addText(text => text
                .setPlaceholder('Tags (comma-separated)')
                .setValue(this.plugin.settingsData.tags)
                .onChange(async (value) => {
                    this.plugin.settingsData.tags = value;
                    await this.plugin.saveSettings();
                }));       
    }
}

class BrainDumpModal extends obsidian.Modal {
    constructor(app, settings) {
        super(app);
        this.settings = settings;
        this.customFolder = settings.customFolder;
        this.customDateFormat = settings.customDateFormat;
        this.tags = settings.tags;
    }

    onOpen() {
        let {contentEl} = this;
        contentEl.createEl('h3', {text: 'Brain Dump'});

        let textarea = contentEl.createEl('textarea');
        textarea.setAttribute('placeholder', 'Dump your thoughts here...');
        textarea.style.width = '100%';
        textarea.style.height = '200px';
        
        let titleInput = contentEl.createEl('input');
        titleInput.setAttribute('type', 'text');
        titleInput.setAttribute('placeholder', 'Title (optional)');
        titleInput.style.width = '100%';

        let tagsInput = contentEl.createEl('input');
        tagsInput.setAttribute('type', 'text');
        tagsInput.setAttribute('placeholder', 'Tags (comma-separated, optional)');
        tagsInput.style.width = '100%';

        let submitBtn = contentEl.createEl('button', {text: 'Dump it!'});
        submitBtn.onclick = () => {
            let settings_tags = this.settings.tags
            let dump_tags = tagsInput.value.trim()
            this.customFolder = this.settings.customFolder
            this.customFilename = titleInput.value.trim()
            this.tags = (settings_tags && dump_tags) ? settings_tags + ',' + dump_tags : settings_tags + dump_tags
            this.createBrainDumpFile(textarea.value);
        };

        let previewArea = contentEl.createEl('div');
        previewArea.style.marginTop = '20px';

        this.previewArea = previewArea; // Reference for later use
    }

    onClose() {
        let {contentEl} = this;
        contentEl.empty();
    }

    async createBrainDumpFile(content) {
        if (content.trim() === '') return; // Ignore empty submissions

        // API request as previously defined
        const payload = { Text: content };
        const headers = this.getApiHeaders();
        const url = "https://goblin.tools/api/Compiler";

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`API request failed with status ${response.status}`);
            }

            const tasks = await response.json();
            this.displayOutput(tasks, content);
        } catch (error) {
            console.error('Error processing brain dump:', error);
            new obsidian.Notice('Error processing brain dump.');
        }
    }

    getApiHeaders() {
        return {
            "Accept": "*/*",
            "Content-Type": "application/json",
            "DNT": "1",
            "Origin": "https://goblin.tools",
            "Referer": "https://goblin.tools/Compiler",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin",
            "X-Requested-With": "XMLHttpRequest",
        };
    }

    displayOutput(tasks, originalContent) {
        this.previewArea.empty(); // Clear previous content

        // Display tasks and provide option to reroll
        const todoList = tasks.map(task => `- [ ] ${task}`).join('\n');
        this.previewArea.createEl('pre', {text: todoList});

        let rerollBtn = this.previewArea.createEl('button', {text: 'Reroll'});
        rerollBtn.onclick = () => this.createBrainDumpFile(originalContent);

        let saveBtn = this.previewArea.createEl('button', {text: 'Save'});
        saveBtn.onclick = () => this.saveFile(todoList);
    }

    async saveFile(content) {
        if (!content) return;
    
        const filename = this.formatFilename();
        let folderPath = this.customFolder;
    
        // Ensure the folder path does not start with a slash for Obsidian's file system
        if (folderPath.startsWith('/')) {
            folderPath = folderPath.substring(1);
        }
    
        // Check if the folder exists, if not, create it
        if (folderPath && !(await this.app.vault.adapter.exists(folderPath))) {
            await this.app.vault.createFolder(folderPath);
        }
    
        const fullPath = folderPath ? `${folderPath}/${filename}` : filename;
        const fileContent = this.formatFileContent(content);
    
        // Use Obsidian's API to create the file at the fullPath
        await this.app.vault.create(fullPath, fileContent).catch(err => {
            console.error("Error creating file:", err);
            new obsidian.Notice('Error saving brain dump.');
        });
    
        new obsidian.Notice('Brain dump successfully processed and saved!');
        this.close();
    }

formatFilename() {
    if (this.customFilename) 
    // assert that it ends in .md
    if (this.customFilename.endsWith('.md')) return this.customFilename;
    else return `${this.customFilename}.md`;

    const now = moment();
    let formattedDate = now.format(this.customDateFormat).replace(/[\\/*?"<>|:]/g, '-');
    return `Brain Dump ${formattedDate}.md`;
}


    formatFileContent(content) {
        let fileContent = '';
        if (this.tags) {
            const tags = this.tags.split(',').map(tag => `#${tag.trim()}`).join(' ');
            fileContent += `${tags}\n\n`;
        }
        fileContent += content;
        return fileContent;
    }
}

module.exports = BrainDump;
