// Module-level variables
let spectrogramEl = null;
let wavesurfer = null;
let regionsPlugin = null;
let wheelZoomHandler = null;
let regionCounter = 0;
const regionToNoteMap = {}; // Maps region id to note id
const SPECTROGRAM_VERTICAL_PADDING = 15; //Pad necessary to make the panning slider visible and interactive

function sendInfo(text) {
	const infoText = document.getElementById("infoText");
	if (infoText) {
		infoText.textContent = text;
	}
}

// Listen for audio file selection from toolbar
window.addEventListener("audioFileSelected", (event) => {
    const { url, name } = event.detail;
    sendInfo(`Loaded: ${name}`);

	//set height of spectrogram to match container
	const canvasEl = document.getElementById("spectrogramCanvas");
	const containerHeight = canvasEl ? canvasEl.clientHeight : 0;
	const spectrogramHeight = Math.max(
		120,
		containerHeight - SPECTROGRAM_VERTICAL_PADDING * 2,
	);

    const spectrogramPlugin = window.WaveSurfer.Spectrogram.create({
        container: "#spectrogramCanvas",
		useWebWorker: true,
		height: spectrogramHeight,
        labels: true,
		colorMap: "roseus",
        labelsColor: "#ffffff",
        labelsHzColor: "#ffd400",
		frequencyMax: 4000,
		frequencyMin: 20,
		fftSamples: 1024,
		dbRange: 60,
		scale: "mel",
		windowFunc: 'hann',
		normalize: true,
		maxCanvasWidth: 2048,
    });

	if (canvasEl) {
		canvasEl.style.paddingBlock = `${SPECTROGRAM_VERTICAL_PADDING}px`;
	}


	const TimelinePlugin = window.WaveSurfer.Timeline;

	regionsPlugin = window.WaveSurfer.Regions.create();

    wavesurfer = window.WaveSurfer.create({
        container: "#spectrogramCanvas",
        url: url,  // The audio blob URL
		progressColor: "#ffffff",
		cursorWidth: 3,
        sampleRate: 44100,
        height: 0, //HIDE WAVEFORM, this is for displaying the spectrogram only.
		dragToSeek: true,
        plugins: [
			spectrogramPlugin,
			TimelinePlugin.create({
				height: 30,
				timeInterval: 0.1,
				primaryLabelInterval: 5,
				secondaryLabelInterval: 1,
				style: {
					fontSize: "20px",
					color: "#33ff00",
				},
			}),
			regionsPlugin,
		],
    });

	// Wire up Play/Pause button from toolbar
	const playBtn = document.getElementById("playBtn");
	const stopBtn = document.getElementById("stopBtn");
	
	if (playBtn) {
		playBtn.addEventListener("click", () => {
			wavesurfer.playPause();
		});
		
		wavesurfer.on("play", () => {
			playBtn.textContent = "Pause";
		});
		
		wavesurfer.on("pause", () => {
			playBtn.textContent = "Play";
		});
	}
	
	if (stopBtn) {
		stopBtn.addEventListener("click", () => {
			wavesurfer.stop();
		});
	}

	// Log regions when they are created or updated
	regionsPlugin.on("region-created", (region) => {
		regionCounter += 1;
		const timeFormatted = region.start.toFixed(2);
		const linkedNoteId = regionToNoteMap[region.id];
		const labelInfo = linkedNoteId ? ` - linked to note: ${linkedNoteId}` : "";
		console.log(`Time instance ${regionCounter} with time ${timeFormatted}${labelInfo}`);
	});

	regionsPlugin.on("region-updated", (region) => {
		const timeFormatted = region.start.toFixed(2);
		const linkedNoteId = regionToNoteMap[region.id];
		const labelInfo = linkedNoteId ? ` - linked to note: ${linkedNoteId}` : "";
		console.log(`Time instance updated with time ${timeFormatted}${labelInfo}`);
	});

	// Listen for comma key to create time instances
	document.addEventListener("keydown", (event) => {
		if (event.key === ",") {
			const currentTime = wavesurfer.getCurrentTime();
			const regionConfig = {
				start: currentTime,
				color: "rgb(255, 234, 0)",
				content: "un-linked instance",
				drag: true,
				resize: false,
			};
			
			// Create the region
			const region = regionsPlugin.addRegion(regionConfig);
			
			// If a note is selected, store the mapping and update visuals
			if (window.selectedNoteId) {
				regionToNoteMap[region.id] = window.selectedNoteId;
				
				// Set the content property on the region to display the note ID
				region.content = window.selectedNoteId;
				
				// Update the visible content in the DOM element
				if (region.element) {
					const contentEl = region.element.querySelector('[data-region-content]');
					if (contentEl) {
						contentEl.textContent = window.selectedNoteId;
					}
				}
				
				// Change region color to green
				region.color = "rgba(0, 255, 0, 0.3)";
				
				// Dispatch event to MEI module to change note color
				const syncEvent = new CustomEvent("regionSynced", {
					detail: { noteId: window.selectedNoteId, regionId: region.id }
				});
				document.dispatchEvent(syncEvent);
				
				console.log(`Linked region ${region.id} to note: ${window.selectedNoteId}`);
			}
		}
	});

	//Zoom functionality for spectrogram
	wavesurfer.once('decode', () => {
		const zoomTarget = document.getElementById("spectrogramCanvas");
		if (!zoomTarget) return;
		let currentZoom = 100;
		const minZoom = 10;
		const maxZoom = 1000;
		const zoomStep = 30;
		if (wheelZoomHandler) {
			zoomTarget.removeEventListener('wheel', wheelZoomHandler);
		}
		wheelZoomHandler = (e) => {
			e.preventDefault();
			const direction = e.deltaY < 0 ? -1 : 1;
			currentZoom = Math.min(maxZoom, Math.max(minZoom, currentZoom + direction * zoomStep));
			wavesurfer.zoom(currentZoom);
		};
		zoomTarget.addEventListener('wheel', wheelZoomHandler, { passive: false });
	})

	// Track loading progress, keep coments in line, i prefer this like it is
	wavesurfer.on('loading', (percent) => {console.log(`Audio loading: ${percent}%`);});
	wavesurfer.on('ready', () => {console.log("✓ WaveSurfer ready, decoding audio...");});
	wavesurfer.on('decode', () => {console.log("✓ Audio decoded, spectrogram rendering complete");});
});


// Load spectrogram HTML from 0021_SPECTOGRAM.html
fetch("0021_SPECTOGRAM.html")
	.then((response) => response.text())
	.then((html) => {
		document.getElementById("spectrogramContainer").innerHTML = html;
		spectrogramEl = document.getElementById("spectrogramCanvas");
		sendInfo("Select an audio file to render spectrogram.");
	})
	.catch((error) => console.error("Error loading spectrogram:", error));
