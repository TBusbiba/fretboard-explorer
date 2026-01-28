// Guitar Scale Learning Tool - Main JavaScript

class GuitarScaleApp {
    constructor() {
        this.fretboard = null;
        this.scaleManager = new ScaleManager();
        this.comparisonManager = new ComparisonManager();
        this.patternManager = new PatternManager();
        this.colorManager = new ColorManager();
        
        this.currentScale1 = null;
        this.currentScale2 = null;
        this.comparisonMode = false;
        this.currentPattern = 'full';
        this.selectedNote = null;
        this.selectedFret = null;  // null = show all, number = show position at that fret
        this.showTab = false;
        this.showCaged = false;
        this.selectedStrings = new Set([0, 1, 2, 3, 4, 5]); // All strings selected by default
        
        // CAGED chord shape definitions (relative positions from root)
        // Each shape is defined by intervals from the root on specific strings
        this.cagedShapes = {
            C: {
                name: 'C Shape',
                color: 'rgba(255, 193, 7, 0.4)',
                // Positions relative to root: [string (0-5), fret offset from shape start]
                positions: [
                    { string: 4, fretOffset: 0, interval: 'R' },  // Root on A string
                    { string: 3, fretOffset: 2, interval: '5' },
                    { string: 2, fretOffset: 0, interval: 'R' },
                    { string: 1, fretOffset: 1, interval: '3' },
                    { string: 0, fretOffset: 0, interval: '5' }
                ]
            },
            A: {
                name: 'A Shape',
                color: 'rgba(78, 205, 196, 0.4)',
                positions: [
                    { string: 4, fretOffset: 0, interval: 'R' },
                    { string: 3, fretOffset: 2, interval: '5' },
                    { string: 2, fretOffset: 2, interval: 'R' },
                    { string: 1, fretOffset: 2, interval: '3' },
                    { string: 0, fretOffset: 0, interval: '5' }
                ]
            },
            G: {
                name: 'G Shape',
                color: 'rgba(150, 206, 180, 0.4)',
                positions: [
                    { string: 5, fretOffset: 0, interval: 'R' },
                    { string: 4, fretOffset: 2, interval: '3' },
                    { string: 3, fretOffset: 0, interval: '5' },
                    { string: 2, fretOffset: 0, interval: 'R' },
                    { string: 1, fretOffset: 0, interval: '3' },
                    { string: 0, fretOffset: 0, interval: 'R' }
                ]
            },
            E: {
                name: 'E Shape',
                color: 'rgba(255, 107, 107, 0.4)',
                positions: [
                    { string: 5, fretOffset: 0, interval: 'R' },
                    { string: 4, fretOffset: 2, interval: '5' },
                    { string: 3, fretOffset: 2, interval: 'R' },
                    { string: 2, fretOffset: 1, interval: '3' },
                    { string: 1, fretOffset: 0, interval: '5' },
                    { string: 0, fretOffset: 0, interval: 'R' }
                ]
            },
            D: {
                name: 'D Shape',
                color: 'rgba(165, 94, 234, 0.4)',
                positions: [
                    { string: 3, fretOffset: 0, interval: 'R' },
                    { string: 2, fretOffset: 2, interval: '5' },
                    { string: 1, fretOffset: 3, interval: 'R' },
                    { string: 0, fretOffset: 2, interval: '3' }
                ]
            }
        };
        
        this.init();
    }
    
    init() {
        this.createFretboard();
        this.setupEventListeners();
        this.patternManager.setApp(this);
        this.loadDefaultScale();
        console.log('Guitar Scale Learning Tool initialized!');
    }
    
    createFretboard() {
        const fretboardContainer = document.getElementById('fretboard');
        fretboardContainer.innerHTML = '';
        
        // Create wrapper with minimum width for scrolling
        const wrapper = document.createElement('div');
        wrapper.className = 'min-w-[1100px]';
        
        // Create fret numbers row
        const fretNumbersRow = document.createElement('div');
        fretNumbersRow.className = 'flex pr-4 mb-1';
        
        for (let fret = 0; fret < 22; fret++) {
            const fretNum = document.createElement('div');
            // Fret 0 gets fixed width to match nut (50px), others are flex-1
            if (fret === 0) {
                fretNum.className = 'fret-number w-[50px] text-center text-[10px] font-bold shrink-0';
            } else {
                fretNum.className = 'fret-number flex-1 text-center text-[10px] font-bold';
            }
            
            // Highlight specific frets
            const highlightFrets = [3, 5, 7, 9, 15, 17, 19, 21];
            if (fret === 12) {
                fretNum.classList.add('text-primary');
            } else if (highlightFrets.includes(fret)) {
                fretNum.classList.add('text-[#92adc9]');
            } else {
                fretNum.classList.add('text-[#5a6b7c]');
            }
            
            fretNum.textContent = fret;
            fretNum.dataset.fret = fret;
            fretNumbersRow.appendChild(fretNum);
        }
        wrapper.appendChild(fretNumbersRow);
        
        // Create fretboard body
        const fretboardBody = document.createElement('div');
        fretboardBody.className = 'relative min-w-[1100px] h-[220px] bg-[#24303c] rounded-xl border-[6px] border-[#16202a] shadow-2xl overflow-hidden select-none';
        fretboardBody.id = 'fretboard-body';
        
        // Background gradient
        const bgGradient = document.createElement('div');
        bgGradient.className = 'absolute inset-0 opacity-30 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#334155] via-[#1e293b] to-[#0f172a]';
        fretboardBody.appendChild(bgGradient);
        
        // String lines
        const stringLinesContainer = document.createElement('div');
        stringLinesContainer.className = 'absolute inset-0 grid grid-rows-6 pointer-events-none z-10';
        const stringThicknesses = ['h-[1px]', 'h-[1px]', 'h-[2px]', 'h-[2px]', 'h-[3px]', 'h-[3px]'];
        for (let i = 0; i < 6; i++) {
            const stringRow = document.createElement('div');
            stringRow.className = 'flex items-center w-full px-0 justify-center h-full';
            const stringLine = document.createElement('div');
            stringLine.className = `string-line ${stringThicknesses[i]}`;
            stringRow.appendChild(stringLine);
            stringLinesContainer.appendChild(stringRow);
        }
        fretboardBody.appendChild(stringLinesContainer);
        
        // Frets container
        const fretsContainer = document.createElement('div');
        fretsContainer.className = 'absolute inset-0 flex pl-[50px] pr-4 z-20';
        fretsContainer.id = 'frets-container';
        
        // Nut (open strings area)
        const nut = document.createElement('div');
        nut.className = 'absolute left-0 top-0 bottom-0 w-[50px] bg-[#111820] border-r-[6px] border-[#94a3b8] z-20 grid grid-rows-6 justify-items-center items-center';
        
        const nutLabel = document.createElement('span');
        nutLabel.className = 'text-[#5a6b7c] font-bold text-[10px] -rotate-90 absolute left-3';
        nutLabel.textContent = 'NUT';
        nut.appendChild(nutLabel);
        
        // Add open string notes
        const openNotes = ['E', 'B', 'G', 'D', 'A', 'E'];
        for (let string = 0; string < 6; string++) {
            const noteBtn = document.createElement('button');
            noteBtn.className = 'note-circle scale-note';
            noteBtn.textContent = openNotes[string];
            noteBtn.dataset.string = string;
            noteBtn.dataset.fret = 0;
            noteBtn.style.gridRow = `${string + 1}`;
            noteBtn.addEventListener('click', () => this.handleNoteClick(string, 0));
            nut.appendChild(noteBtn);
        }
        fretsContainer.appendChild(nut);
        
        // Fret cells (1-21)
        const singleDotFrets = [3, 5, 7, 9, 15, 17, 19, 21];
        const doubleDotFret = 12;
        
        for (let fret = 1; fret < 22; fret++) {
            const fretCell = document.createElement('div');
            fretCell.className = 'fret-cell flex-1 group';
            fretCell.dataset.fret = fret;
            
            // Special styling for 12th fret
            if (fret === 12) {
                fretCell.classList.add('border-r-[#94a3b8]', 'border-r-4');
            }
            
            // Add inlay dots
            if (singleDotFrets.includes(fret)) {
                const dot = document.createElement('div');
                dot.className = 'inlay-dot';
                fretCell.appendChild(dot);
            } else if (fret === doubleDotFret) {
                const dotTop = document.createElement('div');
                dotTop.className = 'inlay-dot inlay-double-top';
                const dotBottom = document.createElement('div');
                dotBottom.className = 'inlay-dot inlay-double-bottom';
                fretCell.appendChild(dotTop);
                fretCell.appendChild(dotBottom);
            }
            
            // Add note positions for each string
            for (let string = 0; string < 6; string++) {
                const noteSlot = document.createElement('div');
                noteSlot.className = 'note-slot';
                noteSlot.dataset.string = string;
                noteSlot.dataset.fret = fret;
                noteSlot.style.gridRow = `${string + 1}`;
                noteSlot.style.display = 'flex';
                noteSlot.style.justifyContent = 'center';
                noteSlot.style.alignItems = 'center';
                noteSlot.addEventListener('click', () => this.handleNoteClick(string, fret));
                fretCell.appendChild(noteSlot);
            }
            
            fretsContainer.appendChild(fretCell);
        }
        
        fretboardBody.appendChild(fretsContainer);
        wrapper.appendChild(fretboardBody);
        fretboardContainer.appendChild(wrapper);
        
        this.fretboard = fretboardBody;
    }
    
    handleNoteClick(string, fret) {
        const note = this.getNoteAtPosition(string, fret);
        
        // Update selected note display
        this.updateSelectedNoteDisplay(note, string, fret);
        
        // Check if a color is selected
        if (this.selectedColor) {
            this.colorAllInstancesOfNote(note, this.selectedColor);
            return;
        }
        
        // Toggle note marking
        this.toggleNoteMarking(string, fret);
    }
    
    updateSelectedNoteDisplay(note, string, fret) {
        const noteNameEl = document.getElementById('selected-note-name');
        const noteTypeEl = document.getElementById('selected-note-type');
        const noteFreqEl = document.getElementById('selected-note-freq');
        
        if (noteNameEl) {
            noteNameEl.textContent = note;
        }
        
        // Determine if it's sharp/flat
        if (noteTypeEl) {
            if (note.includes('#')) {
                noteTypeEl.textContent = 'Sharp';
            } else if (note.includes('b')) {
                noteTypeEl.textContent = 'Flat';
            } else {
                noteTypeEl.textContent = 'Natural';
            }
        }
        
        // Calculate approximate frequency
        if (noteFreqEl) {
            const freq = this.calculateFrequency(note, string, fret);
            noteFreqEl.textContent = `Frequency: ${freq.toFixed(2)} Hz`;
        }
        
        this.selectedNote = { note, string, fret };
    }
    
    calculateFrequency(note, string, fret) {
        // Base frequencies for open strings (standard tuning)
        const openFreqs = [329.63, 246.94, 196.00, 146.83, 110.00, 82.41]; // E4, B3, G3, D3, A2, E2
        const baseFreq = openFreqs[string];
        // Each fret is a semitone = multiply by 2^(1/12)
        return baseFreq * Math.pow(2, fret / 12);
    }
    
    getNoteAtPosition(string, fret) {
        const openNotes = ['E', 'B', 'G', 'D', 'A', 'E'];
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        
        const openNote = openNotes[string];
        const openNoteIndex = noteNames.indexOf(openNote);
        const noteIndex = (openNoteIndex + fret) % 12;
        
        return noteNames[noteIndex];
    }
    
    toggleNoteMarking(string, fret) {
        const noteSlot = this.fretboard.querySelector(`[data-string="${string}"][data-fret="${fret}"]`);
        if (!noteSlot) return;
        
        const existingCircle = noteSlot.querySelector('.note-circle');
        if (existingCircle && existingCircle.style.background) {
            this.revertNoteToPreviousState(string, fret);
            return;
        }
        
        if (this.selectedColor) {
            const note = this.getNoteAtPosition(string, fret);
            this.colorAllInstancesOfNote(note, this.selectedColor);
            return;
        }
        
        this.updateScaleDisplay();
    }
    
    setupEventListeners() {
        // Root note dropdown
        const rootSelect = document.getElementById('root-select');
        if (rootSelect) {
            rootSelect.addEventListener('change', () => this.updateScale1());
        }
        
        // Scale type dropdown
        const scaleSelect = document.getElementById('scale-select');
        if (scaleSelect) {
            scaleSelect.addEventListener('change', () => this.updateScale1());
        }
        
        // Scale 2 dropdowns (for comparison)
        const rootSelect2 = document.getElementById('root-select-2');
        if (rootSelect2) {
            rootSelect2.addEventListener('change', () => this.updateScale2());
        }
        
        const scaleSelect2 = document.getElementById('scale-select-2');
        if (scaleSelect2) {
            scaleSelect2.addEventListener('change', () => this.updateScale2());
        }
        
        // Scale degrees
        this.setupScaleDegrees();
        
        // Comparison mode toggle
        const comparisonToggle = document.getElementById('comparison-mode');
        if (comparisonToggle) {
            comparisonToggle.addEventListener('change', (e) => {
                this.comparisonMode = e.target.checked;
                this.toggleComparisonMode();
            });
        }
        
        // Pattern buttons
        document.querySelectorAll('.pattern-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.setPattern(e.target.dataset.pattern);
            });
        });
        
        // Action buttons
        const clearNotesBtn = document.getElementById('clear-notes');
        if (clearNotesBtn) {
            clearNotesBtn.addEventListener('click', () => this.clearNotes());
        }
        
        const resetAllBtn = document.getElementById('reset-all');
        if (resetAllBtn) {
            resetAllBtn.addEventListener('click', () => this.resetAll());
        }
        
        // Settings panel
        const toggleSettingsBtn = document.getElementById('toggle-settings');
        if (toggleSettingsBtn) {
            toggleSettingsBtn.addEventListener('click', () => this.toggleSettingsPanel());
        }
        
        const closeSettingsBtn = document.getElementById('close-settings');
        if (closeSettingsBtn) {
            closeSettingsBtn.addEventListener('click', () => this.toggleSettingsPanel());
        }
        
        // Color customization
        const rootColorInput = document.getElementById('root-color');
        if (rootColorInput) {
            rootColorInput.addEventListener('change', (e) => {
                this.colorManager.setRootColor(e.target.value);
                this.updateScaleDisplay();
            });
        }
        
        const scaleColorInput = document.getElementById('scale-color');
        if (scaleColorInput) {
            scaleColorInput.addEventListener('change', (e) => {
                this.colorManager.setScaleColor(e.target.value);
                this.updateScaleDisplay();
            });
        }
        
        const comparisonColorInput = document.getElementById('comparison-color');
        if (comparisonColorInput) {
            comparisonColorInput.addEventListener('change', (e) => {
                this.colorManager.setComparisonColor(e.target.value);
                this.updateScaleDisplay();
            });
        }
        
        // Color button picker
        this.setupColorButtons();
        
        // Triad finder toggle
        const triadModeElement = document.getElementById('triad-mode');
        if (triadModeElement) {
            triadModeElement.addEventListener('change', (e) => {
                this.toggleTriadMode(e.target.checked);
            });
        }
        
        // String group selection
        const stringGroupInputs = document.querySelectorAll('.string-group-option input');
        stringGroupInputs.forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                const triadModeElement = document.getElementById('triad-mode');
                if (triadModeElement && triadModeElement.checked) {
                    this.updateTriadDisplay();
                }
            });
        });
        
        // Circle of Fifths click handlers
        document.querySelectorAll('.cof-label').forEach(label => {
            label.addEventListener('click', () => {
                const note = label.dataset.note;
                const rootSelect = document.getElementById('root-select');
                if (rootSelect) {
                    rootSelect.value = note;
                    this.updateScale1();
                }
            });
        });
        
        // Fret number click handlers (for position selection)
        this.setupFretNumberClickHandlers();
        
        // TAB toggle
        const tabToggle = document.getElementById('tab-toggle');
        if (tabToggle) {
            tabToggle.addEventListener('click', () => {
                this.toggleTab();
            });
        }
        
        // CAGED toggle
        const cagedToggle = document.getElementById('caged-toggle');
        if (cagedToggle) {
            cagedToggle.addEventListener('click', () => {
                this.toggleCaged();
            });
        }
        
        // String filter buttons
        this.setupStringFilterButtons();
    }
    
    setupStringFilterButtons() {
        const stringFilterButtons = document.querySelectorAll('.string-filter-btn');
        stringFilterButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const stringNum = parseInt(btn.dataset.string);
                this.toggleString(stringNum);
            });
        });
        
        // Toggle all button
        const toggleAllBtn = document.getElementById('toggle-all-strings');
        if (toggleAllBtn) {
            toggleAllBtn.addEventListener('click', () => {
                this.toggleAllStrings();
            });
        }
    }
    
    toggleString(stringNum) {
        if (this.selectedStrings.has(stringNum)) {
            // Don't allow deselecting if it's the only one selected
            if (this.selectedStrings.size > 1) {
                this.selectedStrings.delete(stringNum);
            }
        } else {
            this.selectedStrings.add(stringNum);
        }
        
        this.updateStringFilterUI();
        this.updateScaleDisplay();
        
        // Update TAB if visible
        if (this.showTab) {
            this.generateTab();
        }
    }
    
    toggleAllStrings() {
        if (this.selectedStrings.size === 6) {
            // If all selected, select only the first string
            this.selectedStrings = new Set([0]);
        } else {
            // Otherwise, select all
            this.selectedStrings = new Set([0, 1, 2, 3, 4, 5]);
        }
        
        this.updateStringFilterUI();
        this.updateScaleDisplay();
        
        // Update TAB if visible
        if (this.showTab) {
            this.generateTab();
        }
    }
    
    updateStringFilterUI() {
        const stringFilterButtons = document.querySelectorAll('.string-filter-btn');
        stringFilterButtons.forEach(btn => {
            const stringNum = parseInt(btn.dataset.string);
            if (this.selectedStrings.has(stringNum)) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }
    
    loadDefaultScale() {
        this.updateScale1();
    }
    
    updateScale1() {
        const rootSelect = document.getElementById('root-select');
        const scaleSelect = document.getElementById('scale-select');
        
        if (!rootSelect || !scaleSelect) return;
        
        const rootNote = rootSelect.value;
        const scaleType = scaleSelect.value;
        
        this.currentScale1 = this.scaleManager.getScale(rootNote, scaleType);
        this.updateScaleDegrees();
        this.updateScaleDisplay();
        this.updateCircleOfFifths();
        this.updateScaleEmotions();
        this.updateRootLegend();
    }
    
    updateScale2() {
        const rootSelect = document.getElementById('root-select-2');
        const scaleSelect = document.getElementById('scale-select-2');
        
        if (!rootSelect || !scaleSelect) return;
        
        const rootNote = rootSelect.value;
        const scaleType = scaleSelect.value;
        
        this.currentScale2 = this.scaleManager.getScale(rootNote, scaleType);
        this.updateScaleDisplay();
    }
    
    updateRootLegend() {
        const rootLegend = document.getElementById('root-legend');
        if (rootLegend && this.currentScale1) {
            rootLegend.textContent = `Root (${this.currentScale1.root})`;
        }
    }
    
    updateCircleOfFifths() {
        if (!this.currentScale1) return;
        
        const scaleNotes = this.currentScale1.notes;
        
        // Update all CoF labels
        document.querySelectorAll('.cof-label').forEach(label => {
            const note = label.dataset.note;
            if (scaleNotes.includes(note)) {
                label.classList.add('active');
            } else {
                label.classList.remove('active');
            }
        });
        
        // Update center display
        const cofKey = document.getElementById('cof-key');
        const cofScale = document.getElementById('cof-scale');
        if (cofKey) cofKey.textContent = this.currentScale1.root;
        if (cofScale) {
            // Get just the scale name without the root
            const scaleName = this.currentScale1.name.replace(this.currentScale1.root + ' ', '');
            cofScale.textContent = scaleName;
        }
    }
    
    updateScaleEmotions() {
        const container = document.getElementById('scale-emotions');
        if (!container || !this.currentScale1) return;
        
        // Define emotions for each interval
        const intervalEmotions = {
            'Root': { degree: '1', name: 'Root (Tonic)', desc: 'Home base. Stable, restful, and resolved. All other notes gravitate here.' },
            'Minor 2nd': { degree: 'b2', name: 'Minor 2nd', desc: 'Tension and dissonance. Creates a dark, unsettling feeling.' },
            'Major 2nd': { degree: '2', name: 'Major 2nd', desc: 'Slightly unstable but pleasant. Adds movement and anticipation.' },
            'Minor 3rd': { degree: 'b3', name: 'Minor 3rd', desc: 'The sad note. Gives the scale its dark, melancholic, or bluesy quality.' },
            'Major 3rd': { degree: '3', name: 'Major 3rd', desc: 'Happy and bright. Defines the major quality of a chord or scale.' },
            'Perfect 4th': { degree: '4', name: 'Perfect 4th', desc: 'Stable but suspended. Often wants to resolve down to the third.' },
            'Augmented 4th': { degree: '#4', name: 'Tritone', desc: 'The devils interval. Maximum tension, wants to resolve.' },
            'Tritone': { degree: 'b5', name: 'Tritone', desc: 'Unstable and tense. The blue note in blues scales.' },
            'Diminished 5th': { degree: 'b5', name: 'Diminished 5th', desc: 'Creates tension and instability. Common in diminished chords.' },
            'Perfect 5th': { degree: '5', name: 'Perfect 5th', desc: 'Power and stability. Supports the root strongly.' },
            'Augmented 5th': { degree: '#5', name: 'Augmented 5th', desc: 'Bright tension. Creates an uplifting, ethereal quality.' },
            'Minor 6th': { degree: 'b6', name: 'Minor 6th', desc: 'Melancholic and mysterious. Adds depth to minor scales.' },
            'Major 6th': { degree: '6', name: 'Major 6th', desc: 'Sweet and pleasant. Adds color without much tension.' },
            'Augmented 6th': { degree: '#6', name: 'Augmented 6th', desc: 'Exotic and unusual. Creates a unique flavor.' },
            'Minor 7th': { degree: 'b7', name: 'Minor 7th', desc: 'Tension seeking resolve. Very bluesy when used in a dominant context.' },
            'Major 7th': { degree: '7', name: 'Major 7th', desc: 'Dreamy and jazzy. Just a half step from resolution.' }
        };
        
        container.innerHTML = '';
        
        this.currentScale1.intervals.forEach((interval, index) => {
            const emotion = intervalEmotions[interval];
            if (!emotion) return;
            
            const card = document.createElement('div');
            card.className = 'bg-[#111a22] p-3 rounded-lg border border-[#324d67]/50 hover:border-primary/50 transition-colors';
            
            const isRoot = index === 0;
            const badgeClass = isRoot ? 'bg-primary' : 'bg-[#1e293b] border border-[#324d67]';
            const badgeTextClass = isRoot ? 'text-white' : 'text-[#92adc9]';
            
            card.innerHTML = `
                <div class="flex items-center gap-2 mb-1">
                    <span class="w-6 h-6 rounded-full ${badgeClass} flex items-center justify-center text-xs font-bold ${badgeTextClass}">${emotion.degree}</span>
                    <span class="text-white font-bold text-sm">${emotion.name}</span>
                </div>
                <p class="text-xs text-[#92adc9]">${emotion.desc}</p>
            `;
            
            container.appendChild(card);
        });
    }
    
    updateScaleDisplay() {
        this.clearFretboard();
        this.clearCagedMarkers();
        
        // Check if triad mode is enabled
        const triadMode = document.getElementById('triad-mode');
        if (triadMode && triadMode.checked) {
            this.updateTriadDisplay();
            return;
        }
        
        if (this.comparisonMode && this.currentScale1 && this.currentScale2) {
            this.comparisonManager.displayComparison(this.fretboard, this.currentScale1, this.currentScale2, this);
        } else if (this.currentScale1) {
            this.displayScale(this.fretboard, this.currentScale1);
        }
        
        // Add CAGED overlay if enabled
        if (this.showCaged) {
            this.renderCagedOverlay();
        }
        
        this.updateScaleInfo();
        
        // Update TAB if visible
        if (this.showTab) {
            this.generateTab();
        }
    }
    
    displayScale(fretboard, scale) {
        const scaleNotes = scale.notes;
        
        // Check if we're in vertical mode and should filter notes
        const positionNotes = this.patternManager.filterNotesForPosition(
            scaleNotes, 
            (s, f) => this.getNoteAtPosition(s, f)
        );
        
        // Check if we're filtering by fret position (new system)
        const fretPositionNotes = this.filterNotesForFretPosition(scaleNotes);
        
        if (positionNotes) {
            // Vertical mode: only show filtered notes
            for (const pos of positionNotes) {
                // Check string filter
                if (!this.selectedStrings.has(pos.string)) continue;
                this.addNoteToFretboard(pos.string, pos.fret, pos.note, pos.note === scale.root);
            }
        } else if (fretPositionNotes) {
            // Fret position mode: show box pattern starting at selected fret
            for (const pos of fretPositionNotes) {
                // Check string filter
                if (!this.selectedStrings.has(pos.string)) continue;
                this.addNoteToFretboard(pos.string, pos.fret, pos.note, pos.note === scale.root);
            }
        } else {
            // Full mode: show all notes
            for (let string = 0; string < 6; string++) {
                // Check string filter
                if (!this.selectedStrings.has(string)) continue;
                
                for (let fret = 0; fret < 22; fret++) {
                    const note = this.getNoteAtPosition(string, fret);
                    if (scaleNotes.includes(note)) {
                        this.addNoteToFretboard(string, fret, note, note === scale.root);
                    }
                }
            }
        }
    }
    
    addNoteToFretboard(string, fret, note, isRoot) {
        let noteSlot;
        
        if (fret === 0) {
            // Open string - find in nut
            noteSlot = this.fretboard.querySelector(`button[data-string="${string}"][data-fret="0"]`);
            if (noteSlot) {
                noteSlot.className = `note-circle ${isRoot ? 'root-note' : 'scale-note'}`;
                noteSlot.textContent = note;
            }
        } else {
            // Fretted note
            noteSlot = this.fretboard.querySelector(`.note-slot[data-string="${string}"][data-fret="${fret}"]`);
            if (noteSlot) {
                noteSlot.innerHTML = '';
                const noteCircle = document.createElement('button');
                noteCircle.className = `note-circle ${isRoot ? 'root-note' : 'scale-note'}`;
                noteCircle.textContent = note;
                noteCircle.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.handleNoteClick(string, fret);
                });
                noteSlot.appendChild(noteCircle);
            }
        }
    }
    
    clearFretboard() {
        // Clear all note slots
        const noteSlots = this.fretboard.querySelectorAll('.note-slot');
        noteSlots.forEach(slot => {
            slot.innerHTML = '';
        });
        
        // Reset open string notes
        const openNotes = ['E', 'B', 'G', 'D', 'A', 'E'];
        for (let string = 0; string < 6; string++) {
            const noteBtn = this.fretboard.querySelector(`button[data-string="${string}"][data-fret="0"]`);
            if (noteBtn) {
                noteBtn.className = 'note-circle scale-note';
                noteBtn.textContent = openNotes[string];
                noteBtn.style.background = '';
            }
        }
    }
    
    toggleComparisonMode() {
        const scale2Controls = document.getElementById('scale-2-controls');
        if (this.comparisonMode) {
            scale2Controls.classList.remove('hidden');
            
            // Pre-fill Scale 2 with current Scale 1 values
            const rootSelect1 = document.getElementById('root-select');
            const scaleSelect1 = document.getElementById('scale-select');
            const rootSelect2 = document.getElementById('root-select-2');
            const scaleSelect2 = document.getElementById('scale-select-2');
            
            if (rootSelect1 && rootSelect2) {
                rootSelect2.value = rootSelect1.value;
            }
            if (scaleSelect1 && scaleSelect2) {
                scaleSelect2.value = scaleSelect1.value;
            }
            
            this.updateScale2();
        } else {
            scale2Controls.classList.add('hidden');
            this.updateScaleDisplay();
        }
    }
    
    setPattern(pattern) {
        this.currentPattern = pattern;
        
        // Update active button styling
        document.querySelectorAll('.pattern-btn').forEach(btn => {
            if (btn.dataset.pattern === pattern) {
                btn.className = 'pattern-btn active px-3 h-10 rounded-lg bg-primary text-white text-sm font-semibold transition-all';
            } else {
                btn.className = 'pattern-btn px-3 h-10 rounded-lg bg-[#111a22] border border-[#324d67] text-[#92adc9] text-sm font-medium hover:border-primary transition-all';
            }
        });
        
        // Apply pattern logic
        this.patternManager.applyPattern(this.fretboard, pattern);
        
        // Update the scale display with the new pattern
        this.updateScaleDisplay();
    }
    
    clearNotes() {
        this.selectedColor = null;
        document.querySelectorAll('.color-btn').forEach(btn => btn.classList.remove('selected'));
        this.updateScaleDisplay();
    }
    
    resetAll() {
        // Reset dropdowns to defaults
        const rootSelect = document.getElementById('root-select');
        const scaleSelect = document.getElementById('scale-select');
        if (rootSelect) rootSelect.value = 'C';
        if (scaleSelect) scaleSelect.value = 'major';
        
        // Reset comparison mode
        this.comparisonMode = false;
        const comparisonToggle = document.getElementById('comparison-mode');
        if (comparisonToggle) comparisonToggle.checked = false;
        this.toggleComparisonMode();
        
        // Reset triad mode
        const triadMode = document.getElementById('triad-mode');
        if (triadMode) {
            triadMode.checked = false;
            this.toggleTriadMode(false);
        }
        
        // Reset pattern
        this.setPattern('full');
        
        // Reset fret position to show all
        this.selectedFret = null;
        this.updateFretHighlight();
        this.updatePositionInfo();
        
        // Reset string filter to all strings
        this.selectedStrings = new Set([0, 1, 2, 3, 4, 5]);
        this.updateStringFilterUI();
        
        // Reset TAB display
        if (this.showTab) {
            this.toggleTab();
        }
        
        // Reset CAGED display
        if (this.showCaged) {
            this.toggleCaged();
        }
        
        // Clear colors
        this.clearNotes();
        
        // Reload default scale
        this.loadDefaultScale();
    }
    
    toggleSettingsPanel() {
        const panel = document.getElementById('settings-panel');
        if (panel) {
            panel.classList.toggle('open');
        }
    }
    
    // Fret Position Methods (replaces old shape system)
    setupFretNumberClickHandlers() {
        const fretNumbers = document.querySelectorAll('.fret-number');
        fretNumbers.forEach((fretNum) => {
            const fret = parseInt(fretNum.dataset.fret);
            if (fret >= 0 && fret < 22) {
                fretNum.classList.add('cursor-pointer', 'hover:text-primary', 'transition-colors');
                fretNum.addEventListener('click', () => this.toggleFretPosition(fret));
            }
        });
    }
    
    toggleFretPosition(fret) {
        if (this.selectedFret === fret) {
            // Clicking same fret reverts to showing all
            this.selectedFret = null;
        } else {
            this.selectedFret = fret;
        }
        
        this.updateFretHighlight();
        this.updatePositionInfo();
        this.updateScaleDisplay();
        
        // Update TAB if visible
        if (this.showTab) {
            this.generateTab();
        }
    }
    
    updateFretHighlight() {
        const fretNumbers = document.querySelectorAll('.fret-number');
        fretNumbers.forEach((fretNum) => {
            const fret = parseInt(fretNum.dataset.fret);
            fretNum.classList.remove('selected-position', 'text-primary', 'font-bold');
            
            if (fret === this.selectedFret) {
                fretNum.classList.add('selected-position', 'text-primary', 'font-bold');
            }
        });
    }
    
    updatePositionInfo() {
        const positionInfoBar = document.getElementById('position-info-bar');
        const positionInfo = document.getElementById('position-info');
        
        if (positionInfoBar && positionInfo) {
            if (this.selectedFret !== null) {
                positionInfoBar.classList.remove('hidden');
                positionInfo.textContent = `Showing position starting at fret ${this.selectedFret}`;
            } else {
                positionInfoBar.classList.add('hidden');
            }
        }
    }
    
    // Core algorithm: filter notes to show a "box" position starting at the selected fret
    filterNotesForFretPosition(scaleNotes) {
        if (this.selectedFret === null) {
            return null; // Show all notes
        }
        
        const startFret = this.selectedFret;
        const endFret = Math.min(startFret + 4, 21); // 5-fret window (fret N to N+4)
        const filteredNotes = [];
        const seenPitches = new Set(); // Track pitches to avoid duplicates
        
        // Process strings from high e (0) to low E (5)
        // For each pitch, we show it on the FIRST string where it appears (working down)
        // This creates a natural box pattern prioritizing higher strings
        for (let string = 0; string <= 5; string++) {
            for (let fret = startFret; fret <= endFret; fret++) {
                const note = this.getNoteAtPosition(string, fret);
                
                // Check if this note is in the scale
                if (scaleNotes.includes(note)) {
                    // Create a unique pitch identifier (note + octave approximation)
                    // Use string and fret to calculate approximate pitch
                    const pitchId = this.getPitchId(string, fret);
                    
                    // Only add if we haven't seen this pitch yet
                    if (!seenPitches.has(pitchId)) {
                        seenPitches.add(pitchId);
                        filteredNotes.push({ string, fret, note });
                    }
                }
            }
        }
        
        return filteredNotes;
    }
    
    // Helper: get a unique pitch ID for a position (to detect same-pitch duplicates)
    getPitchId(string, fret) {
        // Standard tuning open string MIDI notes: E2=40, A2=45, D3=50, G3=55, B3=59, E4=64
        const openStringMidi = [64, 59, 55, 50, 45, 40]; // high e to low E (string 0 to 5)
        return openStringMidi[string] + fret;
    }
    
    // TAB Methods
    toggleTab() {
        this.showTab = !this.showTab;
        
        const tabDisplay = document.getElementById('tab-display');
        const tabToggle = document.getElementById('tab-toggle');
        
        if (tabDisplay) {
            if (this.showTab) {
                tabDisplay.classList.remove('hidden');
                this.generateTab();
            } else {
                tabDisplay.classList.add('hidden');
            }
        }
        
        if (tabToggle) {
            if (this.showTab) {
                tabToggle.className = 'flex items-center gap-2 px-4 py-2 bg-primary text-white border border-primary rounded-lg text-sm font-bold transition-colors';
            } else {
                tabToggle.className = 'flex items-center gap-2 px-4 py-2 bg-[#1e293b] hover:bg-[#2a3848] text-[#92adc9] border border-[#324d67] rounded-lg text-sm font-medium transition-colors';
            }
        }
    }
    
    generateTab() {
        const tabContent = document.getElementById('tab-content');
        const tabShapeLabel = document.getElementById('tab-shape-label');
        if (!tabContent || !this.currentScale1) return;
        
        // Update label
        if (tabShapeLabel) {
            if (this.selectedFret === null) {
                tabShapeLabel.textContent = '(All Positions)';
            } else {
                tabShapeLabel.textContent = `(Position at Fret ${this.selectedFret})`;
            }
        }
        
        const scaleNotes = this.currentScale1.notes;
        const stringNames = ['e', 'B', 'G', 'D', 'A', 'E'];
        
        // Get notes for current position or all
        let notesToShow = [];
        
        if (this.selectedFret === null) {
            // For "all", show first octave ascending pattern
            for (let string = 5; string >= 0; string--) {
                for (let fret = 0; fret < 5; fret++) {
                    const note = this.getNoteAtPosition(string, fret);
                    if (scaleNotes.includes(note)) {
                        notesToShow.push({ string, fret, note });
                    }
                }
            }
        } else {
            const positionNotes = this.filterNotesForFretPosition(scaleNotes);
            if (positionNotes) {
                // Sort by string (low to high) then by fret
                notesToShow = positionNotes.sort((a, b) => {
                    if (b.string !== a.string) return b.string - a.string;
                    return a.fret - b.fret;
                });
            }
        }
        
        // Build TAB strings
        const tabLines = [[], [], [], [], [], []];
        
        // Create ascending pattern
        const ascendingNotes = [...notesToShow];
        const descendingNotes = [...notesToShow].reverse().slice(1); // Skip the highest note to avoid repetition
        const allNotes = [...ascendingNotes, ...descendingNotes];
        
        // Initialize tab lines
        for (let i = 0; i < 6; i++) {
            tabLines[i].push(stringNames[i] + '|');
        }
        
        // Add notes to tab
        let noteCount = 0;
        for (const noteData of allNotes) {
            if (noteCount > 20) break; // Limit notes shown
            
            for (let string = 0; string < 6; string++) {
                if (string === noteData.string) {
                    const fretStr = noteData.fret.toString().padStart(2, '-');
                    tabLines[string].push(fretStr + '-');
                } else {
                    tabLines[string].push('---');
                }
            }
            noteCount++;
        }
        
        // Close tab lines
        for (let i = 0; i < 6; i++) {
            tabLines[i].push('-|');
        }
        
        // Build final string
        const tabString = tabLines.map(line => line.join('')).join('\n');
        tabContent.textContent = tabString;
    }
    
    // CAGED Methods
    toggleCaged() {
        this.showCaged = !this.showCaged;
        
        const cagedToggle = document.getElementById('caged-toggle');
        if (cagedToggle) {
            if (this.showCaged) {
                cagedToggle.className = 'flex items-center gap-2 px-4 py-2 bg-primary text-white border border-primary rounded-lg text-sm font-bold transition-colors';
            } else {
                cagedToggle.className = 'flex items-center gap-2 px-4 py-2 bg-[#1e293b] hover:bg-[#2a3848] text-[#92adc9] border border-[#324d67] rounded-lg text-sm font-medium transition-colors';
            }
        }
        
        this.updateScaleDisplay();
    }
    
    renderCagedOverlay() {
        if (!this.showCaged || !this.currentScale1) return;
        
        const rootNote = this.currentScale1.root;
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const rootIndex = noteNames.indexOf(rootNote);
        
        // Find root positions and draw CAGED shapes
        const openStrings = ['E', 'B', 'G', 'D', 'A', 'E'];
        
        // For each CAGED shape, calculate positions and add overlay
        const cagedOrder = ['E', 'D', 'C', 'A', 'G'];
        
        cagedOrder.forEach((shapeName, shapeIndex) => {
            const shape = this.cagedShapes[shapeName];
            
            // Calculate base fret for this shape based on root
            let baseFret = 0;
            
            // Find where this shape's root falls
            if (shapeName === 'E') {
                // E shape root is on string 5 (low E)
                const lowEIndex = noteNames.indexOf('E');
                baseFret = (rootIndex - lowEIndex + 12) % 12;
            } else if (shapeName === 'A') {
                const aIndex = noteNames.indexOf('A');
                baseFret = (rootIndex - aIndex + 12) % 12;
            } else if (shapeName === 'D') {
                const dIndex = noteNames.indexOf('D');
                baseFret = (rootIndex - dIndex + 12) % 12;
            } else if (shapeName === 'G') {
                const gIndex = noteNames.indexOf('G');
                baseFret = (rootIndex - gIndex + 12) % 12;
                if (baseFret < 2) baseFret += 12;
            } else if (shapeName === 'C') {
                const cIndex = noteNames.indexOf('C');
                baseFret = (rootIndex - cIndex + 12) % 12;
            }
            
            // Draw chord tones with overlay
            shape.positions.forEach(pos => {
                const fret = baseFret + pos.fretOffset;
                if (fret >= 0 && fret < 22) {
                    this.addCagedMarker(pos.string, fret, shape.color, pos.interval);
                }
            });
        });
    }
    
    addCagedMarker(string, fret, color, interval) {
        let noteSlot;
        
        if (fret === 0) {
            noteSlot = this.fretboard.querySelector(`button[data-string="${string}"][data-fret="0"]`);
            if (noteSlot) {
                // Add a ring around the note
                noteSlot.style.boxShadow = `0 0 0 4px ${color}, 0 2px 4px rgba(0,0,0,0.5)`;
            }
        } else {
            noteSlot = this.fretboard.querySelector(`.note-slot[data-string="${string}"][data-fret="${fret}"]`);
            if (noteSlot) {
                const existingCircle = noteSlot.querySelector('.note-circle');
                if (existingCircle) {
                    existingCircle.style.boxShadow = `0 0 0 4px ${color}, 0 2px 4px rgba(0,0,0,0.5)`;
                } else {
                    // Create a background marker for CAGED position
                    const marker = document.createElement('div');
                    marker.className = 'caged-marker';
                    marker.style.cssText = `
                        position: absolute;
                        width: 32px;
                        height: 32px;
                        border-radius: 50%;
                        background: ${color};
                        z-index: 15;
                        opacity: 0.6;
                    `;
                    noteSlot.style.position = 'relative';
                    noteSlot.appendChild(marker);
                }
            }
        }
    }
    
    clearCagedMarkers() {
        // Remove all CAGED markers
        const markers = this.fretboard.querySelectorAll('.caged-marker');
        markers.forEach(m => m.remove());
        
        // Reset box shadows on note circles
        const noteCircles = this.fretboard.querySelectorAll('.note-circle');
        noteCircles.forEach(circle => {
            if (circle.classList.contains('root-note')) {
                circle.style.boxShadow = '0 0 0 4px rgba(19,127,236,0.3)';
            } else {
                circle.style.boxShadow = '0 2px 4px rgba(0,0,0,0.5)';
            }
        });
    }
    
    setupColorButtons() {
        this.selectedColor = null;
        
        document.querySelectorAll('.color-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                document.querySelectorAll('.color-btn').forEach(btn => btn.classList.remove('selected'));
                e.target.classList.add('selected');
                this.selectedColor = e.target.dataset.color;
            });
        });
    }
    
    setupScaleDegrees() {
        this.updateScaleDegrees();
    }
    
    updateScaleDegrees() {
        const degreeButtonsContainer = document.getElementById('degree-buttons');
        if (!degreeButtonsContainer) return;
        
        degreeButtonsContainer.innerHTML = '';
        
        if (!this.currentScale1) return;
        
        const scaleNotes = this.currentScale1.notes;
        const rootNote = this.currentScale1.root;
        
        const degreeNames = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];
        
        scaleNotes.forEach((note, index) => {
            const button = document.createElement('button');
            button.className = 'degree-btn';
            button.textContent = `${note} (${degreeNames[index] || (index + 1) + 'th'})`;
            button.dataset.note = note;
            button.dataset.degree = index;
            
            if (note === rootNote) {
                button.classList.add('root');
            }
            
            button.addEventListener('click', () => {
                document.querySelectorAll('.degree-btn').forEach(btn => btn.classList.remove('selected'));
                button.classList.add('selected');
                this.colorAllInstancesOfNote(note, '#137fec');
            });
            
            degreeButtonsContainer.appendChild(button);
        });
    }
    
    colorAllInstancesOfNote(note, color) {
        for (let string = 0; string < 6; string++) {
            // Check string filter
            if (!this.selectedStrings.has(string)) continue;
            
            for (let fret = 0; fret < 22; fret++) {
                const cellNote = this.getNoteAtPosition(string, fret);
                
                if (cellNote === note) {
                    if (fret === 0) {
                        const noteBtn = this.fretboard.querySelector(`button[data-string="${string}"][data-fret="0"]`);
                        if (noteBtn) {
                            noteBtn.style.background = color;
                            noteBtn.style.color = '#ffffff';
                        }
                    } else {
                        const noteSlot = this.fretboard.querySelector(`.note-slot[data-string="${string}"][data-fret="${fret}"]`);
                        if (noteSlot) {
                            const existingCircle = noteSlot.querySelector('.note-circle');
                            if (existingCircle) {
                                existingCircle.style.background = color;
                                existingCircle.style.color = '#ffffff';
                            } else {
                                const noteCircle = document.createElement('button');
                                noteCircle.className = 'note-circle';
                                noteCircle.textContent = note;
                                noteCircle.style.background = color;
                                noteCircle.style.color = '#ffffff';
                                noteCircle.addEventListener('click', (e) => {
                                    e.stopPropagation();
                                    this.handleNoteClick(string, fret);
                                });
                                noteSlot.appendChild(noteCircle);
                            }
                        }
                    }
                }
            }
        }
    }
    
    revertNoteToPreviousState(string, fret) {
        const note = this.getNoteAtPosition(string, fret);
        
        for (let s = 0; s < 6; s++) {
            for (let f = 0; f < 22; f++) {
                const cellNote = this.getNoteAtPosition(s, f);
                
                if (cellNote === note) {
                    if (f === 0) {
                        const noteBtn = this.fretboard.querySelector(`button[data-string="${s}"][data-fret="0"]`);
                        if (noteBtn && noteBtn.style.background) {
                            noteBtn.style.background = '';
                            noteBtn.style.color = '';
                        }
                    } else {
                        const noteSlot = this.fretboard.querySelector(`.note-slot[data-string="${s}"][data-fret="${f}"]`);
                        if (noteSlot) {
                            const existingCircle = noteSlot.querySelector('.note-circle');
                            if (existingCircle && existingCircle.style.background) {
                                existingCircle.style.background = '';
                                existingCircle.style.color = '';
                            }
                        }
                    }
                }
            }
        }
        
        // Refresh display
        this.updateScaleDisplay();
    }
    
    toggleTriadMode(enabled) {
        const stringGroups = document.getElementById('string-groups');
        if (enabled) {
            if (stringGroups) stringGroups.classList.remove('hidden');
            this.updateTriadDisplay();
        } else {
            if (stringGroups) stringGroups.classList.add('hidden');
            this.updateScaleDisplay();
        }
    }
    
    updateTriadDisplay() {
        const triadMode = document.getElementById('triad-mode');
        if (!triadMode || !triadMode.checked) return;
        
        const selectedGroups = [];
        document.querySelectorAll('.string-group-option input:checked').forEach(checkbox => {
            const strings = checkbox.value.split(',').map(s => parseInt(s));
            selectedGroups.push(strings);
        });
        
        if (selectedGroups.length === 0) {
            this.updateScaleDisplay();
            return;
        }
        
        this.clearFretboard();
        
        if (!this.currentScale1) return;
        
        const scaleNotes = this.currentScale1.notes;
        const rootNote = this.currentScale1.root;
        
        const intervals = [0, 2, 4];
        const triadNotes = intervals.map(interval => scaleNotes[interval]).filter(Boolean);
        
        const triadColors = {
            [triadNotes[0]]: '#137fec',
            [triadNotes[1]]: '#4ecdc4',
            [triadNotes[2]]: '#45b7d1'
        };
        
        // Track processed positions to avoid duplicates when string groups overlap
        const processedPositions = new Set();
        
        for (const stringGroup of selectedGroups) {
            for (const string of stringGroup) {
                // Check string filter
                if (!this.selectedStrings.has(string)) continue;
                
                for (let fret = 0; fret < 22; fret++) {
                    const positionKey = `${string}-${fret}`;
                    
                    // Skip if already processed
                    if (processedPositions.has(positionKey)) continue;
                    
                    const note = this.getNoteAtPosition(string, fret);
                    
                    if (triadNotes.includes(note)) {
                        processedPositions.add(positionKey);
                        const color = triadColors[note];
                        
                        if (fret === 0) {
                            const noteBtn = this.fretboard.querySelector(`button[data-string="${string}"][data-fret="0"]`);
                            if (noteBtn) {
                                noteBtn.style.background = color;
                                noteBtn.style.color = '#ffffff';
                                noteBtn.textContent = note;
                            }
                        } else {
                            const noteSlot = this.fretboard.querySelector(`.note-slot[data-string="${string}"][data-fret="${fret}"]`);
                            if (noteSlot) {
                                const noteCircle = document.createElement('button');
                                noteCircle.className = 'note-circle';
                                noteCircle.textContent = note;
                                noteCircle.style.background = color;
                                noteCircle.style.color = '#ffffff';
                                noteCircle.addEventListener('click', (e) => {
                                    e.stopPropagation();
                                    this.handleNoteClick(string, fret);
                                });
                                noteSlot.appendChild(noteCircle);
                            }
                        }
                    }
                }
            }
        }
        
        // Update scale info for triads
        const scaleInfo = document.getElementById('scale-formula');
        const intervalsInfo = document.getElementById('scale-intervals');
        
        if (scaleInfo) {
            scaleInfo.innerHTML = `<p><strong class="text-white">Triad:</strong> ${triadNotes.join(' - ')}</p>`;
        }
        
        if (intervalsInfo) {
            intervalsInfo.innerHTML = `
                <span class="px-2 py-1 rounded text-xs font-bold" style="background: #137fec; color: white;">Root</span>
                <span class="px-2 py-1 rounded text-xs font-bold" style="background: #4ecdc4; color: white;">3rd</span>
                <span class="px-2 py-1 rounded text-xs font-bold" style="background: #45b7d1; color: white;">5th</span>
            `;
        }
    }
    
    updateScaleInfo() {
        const formulaElement = document.getElementById('scale-formula');
        const intervalsElement = document.getElementById('scale-intervals');
        const scaleTitleElement = document.getElementById('scale-title');
        const scaleFormulaDisplay = document.getElementById('scale-formula-display');
        
        if (this.currentScale1) {
            // Update the main scale title
            if (scaleTitleElement) {
                const h2 = scaleTitleElement.querySelector('h2');
                if (h2) h2.textContent = this.currentScale1.name;
            }
            if (scaleFormulaDisplay) {
                scaleFormulaDisplay.textContent = this.currentScale1.intervals.join(', ');
            }
            
            if (formulaElement) {
                formulaElement.innerHTML = `<p><strong class="text-white">${this.currentScale1.formula}</strong></p>`;
            }
            
            if (intervalsElement) {
                intervalsElement.innerHTML = this.currentScale1.intervals.map((interval, i) => {
                    const isRoot = i === 0;
                    return `<span class="px-2 py-1 rounded-full text-xs ${isRoot ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-[#1e293b] text-[#92adc9] border border-[#324d67]'}">${interval}</span>`;
                }).join('');
            }
        }
    }
}

// Scale Manager Class
class ScaleManager {
    constructor() {
        this.scaleDefinitions = {
            'major': {
                name: 'Major',
                formula: 'W-W-H-W-W-W-H',
                intervals: ['Root', 'Major 2nd', 'Major 3rd', 'Perfect 4th', 'Perfect 5th', 'Major 6th', 'Major 7th'],
                pattern: [0, 2, 4, 5, 7, 9, 11]
            },
            'natural-minor': {
                name: 'Natural Minor',
                formula: 'W-H-W-W-H-W-W',
                intervals: ['Root', 'Major 2nd', 'Minor 3rd', 'Perfect 4th', 'Perfect 5th', 'Minor 6th', 'Minor 7th'],
                pattern: [0, 2, 3, 5, 7, 8, 10]
            },
            'harmonic-minor': {
                name: 'Harmonic Minor',
                formula: 'W-H-W-W-H-WH-H',
                intervals: ['Root', 'Major 2nd', 'Minor 3rd', 'Perfect 4th', 'Perfect 5th', 'Minor 6th', 'Major 7th'],
                pattern: [0, 2, 3, 5, 7, 8, 11]
            },
            'melodic-minor': {
                name: 'Melodic Minor',
                formula: 'W-H-W-W-W-W-H',
                intervals: ['Root', 'Major 2nd', 'Minor 3rd', 'Perfect 4th', 'Perfect 5th', 'Major 6th', 'Major 7th'],
                pattern: [0, 2, 3, 5, 7, 9, 11]
            },
            'pentatonic-major': {
                name: 'Pentatonic Major',
                formula: 'W-W-WH-W-WH',
                intervals: ['Root', 'Major 2nd', 'Major 3rd', 'Perfect 5th', 'Major 6th'],
                pattern: [0, 2, 4, 7, 9]
            },
            'pentatonic-minor': {
                name: 'Pentatonic Minor',
                formula: 'WH-W-W-WH-W',
                intervals: ['Root', 'Minor 3rd', 'Perfect 4th', 'Perfect 5th', 'Minor 7th'],
                pattern: [0, 3, 5, 7, 10]
            },
            'blues': {
                name: 'Blues',
                formula: 'WH-W-H-H-WH-W',
                intervals: ['Root', 'Minor 3rd', 'Perfect 4th', 'Tritone', 'Perfect 5th', 'Minor 7th'],
                pattern: [0, 3, 5, 6, 7, 10]
            },
            'pentatonic-blues': {
                name: 'Blues Scale',
                formula: 'WH-W-H-H-WH-W',
                intervals: ['Root', 'Minor 3rd', 'Perfect 4th', 'Tritone', 'Perfect 5th', 'Minor 7th'],
                pattern: [0, 3, 5, 6, 7, 10]
            },
            'pentatonic-neutral': {
                name: 'Pentatonic Neutral',
                formula: 'W-WH-W-W-WH',
                intervals: ['Root', 'Major 2nd', 'Perfect 4th', 'Perfect 5th', 'Minor 7th'],
                pattern: [0, 2, 5, 7, 10]
            },
            'ionian': {
                name: 'Ionian',
                formula: 'W-W-H-W-W-W-H',
                intervals: ['Root', 'Major 2nd', 'Major 3rd', 'Perfect 4th', 'Perfect 5th', 'Major 6th', 'Major 7th'],
                pattern: [0, 2, 4, 5, 7, 9, 11]
            },
            'aeolian': {
                name: 'Aeolian',
                formula: 'W-H-W-W-H-W-W',
                intervals: ['Root', 'Major 2nd', 'Minor 3rd', 'Perfect 4th', 'Perfect 5th', 'Minor 6th', 'Minor 7th'],
                pattern: [0, 2, 3, 5, 7, 8, 10]
            },
            'diatonic': {
                name: 'Diatonic',
                formula: 'W-W-H-W-W-W-H',
                intervals: ['Root', 'Major 2nd', 'Major 3rd', 'Perfect 4th', 'Perfect 5th', 'Major 6th', 'Major 7th'],
                pattern: [0, 2, 4, 5, 7, 9, 11]
            },
            'diminished-half': {
                name: 'Diminished Half',
                formula: 'H-W-H-W-H-W-H-W',
                intervals: ['Root', 'Minor 2nd', 'Minor 3rd', 'Major 3rd', 'Tritone', 'Perfect 5th', 'Major 6th', 'Minor 7th'],
                pattern: [0, 1, 3, 4, 6, 7, 9, 10]
            },
            'diminished-whole': {
                name: 'Diminished Whole',
                formula: 'W-H-W-H-W-H-W-H',
                intervals: ['Root', 'Major 2nd', 'Minor 3rd', 'Perfect 4th', 'Diminished 5th', 'Minor 6th', 'Minor 7th', 'Major 7th'],
                pattern: [0, 2, 3, 5, 6, 8, 9, 11]
            },
            'diminished-whole-tone': {
                name: 'Diminished Whole Tone',
                formula: 'H-W-H-W-W-W',
                intervals: ['Root', 'Minor 2nd', 'Minor 3rd', 'Perfect 4th', 'Perfect 5th', 'Augmented 6th'],
                pattern: [0, 1, 3, 4, 6, 8]
            },
            'dominant-7th': {
                name: 'Dominant 7th',
                formula: 'W-W-H-W-W-H-W',
                intervals: ['Root', 'Major 2nd', 'Major 3rd', 'Perfect 4th', 'Perfect 5th', 'Major 6th', 'Minor 7th'],
                pattern: [0, 2, 4, 5, 7, 9, 10]
            },
            'lydian-augmented': {
                name: 'Lydian Augmented',
                formula: 'W-W-W-W-H-W-H',
                intervals: ['Root', 'Major 2nd', 'Major 3rd', 'Augmented 4th', 'Augmented 5th', 'Major 6th', 'Major 7th'],
                pattern: [0, 2, 4, 6, 8, 9, 11]
            },
            'lydian-minor': {
                name: 'Lydian Minor',
                formula: 'W-W-W-H-H-W-W',
                intervals: ['Root', 'Major 2nd', 'Major 3rd', 'Augmented 4th', 'Perfect 5th', 'Minor 6th', 'Minor 7th'],
                pattern: [0, 2, 4, 6, 7, 8, 10]
            },
            'lydian-diminished': {
                name: 'Lydian Diminished',
                formula: 'W-H-W-W-W-H-W',
                intervals: ['Root', 'Major 2nd', 'Minor 3rd', 'Augmented 4th', 'Perfect 5th', 'Major 6th', 'Minor 7th'],
                pattern: [0, 2, 3, 6, 7, 9, 10]
            },
            'dorian': {
                name: 'Dorian',
                formula: 'W-H-W-W-W-H-W',
                intervals: ['Root', 'Major 2nd', 'Minor 3rd', 'Perfect 4th', 'Perfect 5th', 'Major 6th', 'Minor 7th'],
                pattern: [0, 2, 3, 5, 7, 9, 10]
            },
            'phrygian': {
                name: 'Phrygian',
                formula: 'H-W-W-W-H-W-W',
                intervals: ['Root', 'Minor 2nd', 'Minor 3rd', 'Perfect 4th', 'Perfect 5th', 'Minor 6th', 'Minor 7th'],
                pattern: [0, 1, 3, 5, 7, 8, 10]
            },
            'lydian': {
                name: 'Lydian',
                formula: 'W-W-W-H-W-W-H',
                intervals: ['Root', 'Major 2nd', 'Major 3rd', 'Augmented 4th', 'Perfect 5th', 'Major 6th', 'Major 7th'],
                pattern: [0, 2, 4, 6, 7, 9, 11]
            },
            'mixolydian': {
                name: 'Mixolydian',
                formula: 'W-W-H-W-W-H-W',
                intervals: ['Root', 'Major 2nd', 'Major 3rd', 'Perfect 4th', 'Perfect 5th', 'Major 6th', 'Minor 7th'],
                pattern: [0, 2, 4, 5, 7, 9, 10]
            },
            'locrian': {
                name: 'Locrian',
                formula: 'H-W-W-H-W-W-W',
                intervals: ['Root', 'Minor 2nd', 'Minor 3rd', 'Perfect 4th', 'Diminished 5th', 'Minor 6th', 'Minor 7th'],
                pattern: [0, 1, 3, 5, 6, 8, 10]
            },
            'diminished': {
                name: 'Diminished',
                formula: 'W-H-W-H-W-H-W-H',
                intervals: ['Root', 'Major 2nd', 'Minor 3rd', 'Perfect 4th', 'Diminished 5th', 'Minor 6th', 'Minor 7th', 'Major 7th'],
                pattern: [0, 2, 3, 5, 6, 8, 9, 11]
            },
            'whole-tone': {
                name: 'Whole Tone',
                formula: 'W-W-W-W-W-W',
                intervals: ['Root', 'Major 2nd', 'Major 3rd', 'Augmented 4th', 'Augmented 5th', 'Minor 7th'],
                pattern: [0, 2, 4, 6, 8, 10]
            }
        };
    }
    
    getScale(rootNote, scaleType) {
        const definition = this.scaleDefinitions[scaleType];
        if (!definition) return null;
        
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const rootIndex = noteNames.indexOf(rootNote);
        
        const notes = definition.pattern.map(interval => {
            const noteIndex = (rootIndex + interval) % 12;
            return noteNames[noteIndex];
        });
        
        return {
            name: `${rootNote} ${definition.name}`,
            root: rootNote,
            notes: notes,
            formula: definition.formula,
            intervals: definition.intervals,
            type: scaleType
        };
    }
}

// Comparison Manager Class
class ComparisonManager {
    displayComparison(fretboard, scale1, scale2, app) {
        const notes1 = scale1.notes;
        const notes2 = scale2.notes;
        const sharedNotes = notes1.filter(note => notes2.includes(note));
        const onlyInScale1 = notes1.filter(note => !notes2.includes(note));
        const onlyInScale2 = notes2.filter(note => !notes1.includes(note));
        
        for (let string = 0; string < 6; string++) {
            // Check string filter
            if (!app.selectedStrings.has(string)) continue;
            
            for (let fret = 0; fret < 22; fret++) {
                const note = app.getNoteAtPosition(string, fret);
                
                let className = '';
                let shouldShow = false;
                
                if (sharedNotes.includes(note)) {
                    className = 'shared-note';
                    shouldShow = true;
                } else if (onlyInScale1.includes(note)) {
                    className = 'different-note';
                    shouldShow = true;
                } else if (onlyInScale2.includes(note)) {
                    className = 'comparison-note';
                    shouldShow = true;
                }
                
                if (shouldShow) {
                    if (fret === 0) {
                        const noteBtn = fretboard.querySelector(`button[data-string="${string}"][data-fret="0"]`);
                        if (noteBtn) {
                            noteBtn.className = `note-circle ${className}`;
                            noteBtn.textContent = note;
                        }
                    } else {
                        const noteSlot = fretboard.querySelector(`.note-slot[data-string="${string}"][data-fret="${fret}"]`);
                        if (noteSlot) {
                            const noteCircle = document.createElement('button');
                            noteCircle.className = `note-circle ${className}`;
                            noteCircle.textContent = note;
                            noteCircle.addEventListener('click', (e) => {
                                e.stopPropagation();
                                app.handleNoteClick(string, fret);
                            });
                            noteSlot.appendChild(noteCircle);
                        }
                    }
                }
            }
        }
    }
}

// Pattern Manager Class
class PatternManager {
    constructor() {
        this.currentPosition = 0;
        this.positionWidth = 5;
        this.verticalMode = false;
        this.app = null;
    }
    
    setApp(app) {
        this.app = app;
    }
    
    applyPattern(fretboard, pattern) {
        if (pattern === 'vertical') {
            this.verticalMode = true;
            this.enableVerticalView(fretboard);
        } else if (pattern === 'diagonal') {
            this.verticalMode = false;
            this.enableDiagonalView(fretboard);
        } else {
            this.verticalMode = false;
            this.enableFullView(fretboard);
        }
    }
    
    enableVerticalView(fretboard) {
        this.makeFretNumbersClickable();
        this.addPositionIndicator();
    }
    
    enableDiagonalView(fretboard) {
        this.enableFullView(fretboard);
    }
    
    enableFullView(fretboard) {
        this.removeFretNumberClickability();
        this.removePositionIndicator();
    }
    
    shouldShowNote(string, fret) {
        if (!this.verticalMode) return true;
        
        const minFret = this.currentPosition;
        const maxFret = this.currentPosition + this.positionWidth - 1;
        
        return fret >= minFret && fret <= maxFret;
    }
    
    filterNotesForPosition(scaleNotes, getNoteAtPosition) {
        if (!this.verticalMode) return null;
        
        const stringBasePitch = [64, 59, 55, 50, 45, 40];
        const positionNotes = [];
        const seenPitches = new Set();
        
        const minFret = this.currentPosition;
        const maxFret = this.currentPosition + this.positionWidth - 1;
        
        for (let string = 5; string >= 0; string--) {
            for (let fret = minFret; fret <= maxFret; fret++) {
                const note = getNoteAtPosition(string, fret);
                
                if (scaleNotes.includes(note)) {
                    const absolutePitch = stringBasePitch[string] + fret;
                    
                    if (!seenPitches.has(absolutePitch)) {
                        positionNotes.push({ string, fret, note });
                        seenPitches.add(absolutePitch);
                    }
                }
            }
        }
        
        return positionNotes;
    }
    
    makeFretNumbersClickable() {
        this.removeFretNumberClickability();
        
        const fretNumbers = document.querySelectorAll('.fret-number');
        fretNumbers.forEach((fretNum) => {
            const fret = parseInt(fretNum.dataset.fret);
            if (fret >= 0 && fret < 22) {
                fretNum.classList.add('clickable-fret');
                
                if (fret === this.currentPosition) {
                    fretNum.classList.add('selected-position');
                }
                
                fretNum._clickHandler = () => {
                    this.jumpToPosition(fret);
                };
                fretNum.addEventListener('click', fretNum._clickHandler);
            }
        });
    }
    
    removeFretNumberClickability() {
        const fretNumbers = document.querySelectorAll('.fret-number');
        fretNumbers.forEach(fretNum => {
            fretNum.classList.remove('clickable-fret', 'selected-position');
            
            if (fretNum._clickHandler) {
                fretNum.removeEventListener('click', fretNum._clickHandler);
                delete fretNum._clickHandler;
            }
        });
    }
    
    jumpToPosition(startFret) {
        this.currentPosition = startFret;
        
        const fretNumbers = document.querySelectorAll('.fret-number');
        fretNumbers.forEach((fretNum) => {
            const fret = parseInt(fretNum.dataset.fret);
            if (fret >= 0 && fret < 22) {
                fretNum.classList.remove('selected-position');
                if (fret === startFret) {
                    fretNum.classList.add('selected-position');
                }
            }
        });
        
        this.updatePositionIndicator();
        
        if (this.app) {
            this.app.updateScaleDisplay();
        }
    }
    
    addPositionIndicator() {
        this.removePositionIndicator();
        
        const fretboard = document.getElementById('fretboard');
        if (!fretboard) return;
        
        const indicator = document.createElement('div');
        indicator.id = 'position-indicator';
        indicator.className = 'absolute -top-8 left-1/2 transform -translate-x-1/2 bg-primary text-white px-3 py-1 rounded text-sm font-bold z-30';
        
        fretboard.style.position = 'relative';
        fretboard.appendChild(indicator);
        this.updatePositionIndicator();
    }
    
    updatePositionIndicator() {
        const indicator = document.getElementById('position-indicator');
        if (indicator) {
            indicator.textContent = `Position: Frets ${this.currentPosition}-${this.currentPosition + this.positionWidth - 1}`;
        }
    }
    
    removePositionIndicator() {
        const indicator = document.getElementById('position-indicator');
        if (indicator) {
            indicator.remove();
        }
    }
}

// Color Manager Class
class ColorManager {
    constructor() {
        this.rootColor = '#137fec';
        this.scaleColor = '#16202a';
        this.comparisonColor = '#7a9ca8';
    }
    
    setRootColor(color) {
        this.rootColor = color;
        document.documentElement.style.setProperty('--root-color', color);
    }
    
    setScaleColor(color) {
        this.scaleColor = color;
        document.documentElement.style.setProperty('--scale-color', color);
    }
    
    setComparisonColor(color) {
        this.comparisonColor = color;
        document.documentElement.style.setProperty('--comparison-color', color);
    }
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.guitarScaleApp = new GuitarScaleApp();
});
