// Module-level variables
let meiFileInput = null;

// Load MEI HTML from 0031_MEI.html
fetch('0031_MEI.html')
	.then(response => response.text())
	.then(html => {
		document.getElementById('meiContainer').innerHTML = html;
		meiFileInput = document.getElementById('meiFileInput');
	})
	.catch(error => console.error('Error loading MEI:', error));


/**
 * MEI to SVG Renderer
 * Takes a .mei file as input and outputs an SVG file
 */
class MeiSvgRenderer {
    constructor(toolkitOptions = {}) {
        const defaultOptions = {
            svgHtml5: true,
            scale: 40,
            breaks: 'none', 
            header: 'none',
            footer: 'none',
            adjustPageHeight: true,
            ...toolkitOptions
        };
        
        if (typeof verovio === 'undefined') {
            throw new Error('Verovio toolkit not found. Check the script URL or build the toolkit locally.');
        }
        
        this.toolkit = new verovio.toolkit();
        this.toolkit.setOptions(defaultOptions);
    }

    /**
     * Renders MEI data to SVG
     * @param {string} meiData - MEI XML content as string
     * @param {number} pageNum - Page number to render (default: 1)
     * @returns {string} SVG as string
     */
    renderToSvg(meiData, pageNum = 1) {
        try {
            this.toolkit.loadData(meiData);
            const svg = this.toolkit.renderToSVG(pageNum, {});
            return svg;
        } catch (error) {
            throw new Error(`Failed to render MEI to SVG: ${error.message}`);
        }
    }

    /**
     * Renders MEI from a file and returns SVG
     * @param {File} meiFile - File object from file input
     * @returns {Promise<string>} SVG as string
     */
    async renderFromFile(meiFile) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const meiData = e.target.result;
                    const svg = this.renderToSvg(meiData);
                    resolve(svg);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = () => {
                reject(new Error('Failed to read MEI file'));
            };
            reader.readAsText(meiFile);
        });
    }

    /**
     * Saves SVG to a file and triggers download
     * @param {string} svg - SVG content as string
     * @param {string} filename - Output filename (default: 'output.svg')
     */
    downloadSvg(svg, filename = 'output.svg') {
        const dataStr = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute('href', dataStr);
        downloadAnchorNode.setAttribute('download', filename);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    }

    /**
     * Renders MEI file and downloads as SVG
     * @param {File} meiFile - File object from file input
     * @param {string} outputFilename - Output filename
     */
    async renderAndDownload(meiFile, outputFilename = null) {
        try {
            const svg = await this.renderFromFile(meiFile);
            const filename = outputFilename || meiFile.name.replace('.mei', '.svg');
            this.downloadSvg(svg, filename);
            return { success: true, filename };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Renders MEI file and returns SVG as data URL for display
     * @param {File} meiFile - File object from file input
     * @returns {Promise<string>} Data URL for SVG
     */
    async renderAsDataUrl(meiFile) {
        const svg = await this.renderFromFile(meiFile);
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }
}

/**
 * Global handler for MEI file selection
 * Called when user picks a .mei file from the file picker
 * @param {File} meiFile - The selected MEI file
 */
async function handleMeiFileSelection(meiFile) {
    try {
        // Create renderer instance
        const renderer = new MeiSvgRenderer();

        // Render the MEI file to SVG
        const svg = await renderer.renderFromFile(meiFile);

        // Display the SVG inside the existing MEI area so layout and scrolling remain intact
        const meiArea = document.querySelector('.mei-area');
        if (meiArea) {
            meiArea.innerHTML = '<div class="mei-svg-host"></div>';
            const host = meiArea.querySelector('.mei-svg-host');
            host.innerHTML = svg;
            
            // Track the currently selected note
            let currentlySelectedNote = null;

            // Setup the highlight functionality targeting only elements with data-class="note"
            host.addEventListener('mouseover', (e) => {
                const targetNote = e.target.closest('[class*="note"]'); 
                // Verovio often uses classes directly, but let's check for attribute data-class="note" too
                const targetNoteByDataClass = e.target.closest('[data-class="note"]');
                const note = targetNoteByDataClass || targetNote;
                
                if (note) {
                    note.classList.add('note-hover-highlight');
                }
            });

            host.addEventListener('mouseout', (e) => {
                const targetNote = e.target.closest('[class*="note"]');
                const targetNoteByDataClass = e.target.closest('[data-class="note"]');
                const note = targetNoteByDataClass || targetNote;
                
                if (note) {
                    note.classList.remove('note-hover-highlight');
                }
            });

            // Setup click handler for notes
            host.addEventListener('click', (e) => {
                const targetNote = e.target.closest('[class*="note"]');
                const targetNoteByDataClass = e.target.closest('[data-class="note"]');
                const note = targetNoteByDataClass || targetNote;
                
                if (note) {
                    // Remove the selected class from the previously selected note
                    if (currentlySelectedNote) {
                        currentlySelectedNote.classList.remove('note-selected');
                    }
                    
                    // Add the selected class to the newly clicked note
                    note.classList.add('note-selected');
                    currentlySelectedNote = note;
                    
                    const elementId = note.getAttribute('data-id');
                    console.log('You have hit element:', elementId);
                    // Store the note ID in a global variable accessible to other scripts
                    window.selectedNoteId = elementId;
                    console.log('window.selectedNoteId is now:', window.selectedNoteId);
                }
            });

            // Listen for region sync events to change note color
            document.addEventListener('regionSynced', (e) => {
                const { noteId } = e.detail;
                // Search from the meiArea since host is local scope
                const syncedNote = meiArea.querySelector(`[data-id="${noteId}"]`);
                if (syncedNote) {
                    syncedNote.classList.add('note-synced');
                    // Change the fill color to green by updating the element directly
                    syncedNote.setAttribute('fill', 'rgba(0, 255, 0, 0.8)');
                    syncedNote.style.fill = 'rgba(0, 255, 0, 0.8)';
                    console.log(`Note ${noteId} synced and colored green`);
                } else {
                    console.log(`Could not find note element with id: ${noteId}`);
                }
            });
        }
    } catch (error) {
        console.error('Error rendering MEI file:', error);
        const meiArea = document.querySelector('.mei-area');
        if (meiArea) {
            meiArea.innerHTML = `<div style="color: red; padding: 20px;">Error loading MEI file: ${error.message}</div>`;
        }
    }
}
