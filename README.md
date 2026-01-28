# 🎸 Guitar Scale Learning Tool

An interactive web application for learning and practicing guitar scales. Built with pure HTML5, CSS3, and vanilla JavaScript - no build tools or dependencies required!

## 🚀 Quick Start

### Method 1: Direct File Opening (Simplest)
1. Navigate to the `guitar-scales` folder
2. Double-click on `index.html`
3. It will open in your default browser

### Method 2: Local Server (Recommended)
For the best experience, use a local server:

**Using Python:**
```bash
cd guitar-scales
python3 -m http.server 8000
```
Then open: `http://localhost:8000`

**Using Node.js:**
```bash
cd guitar-scales
npx serve .
```

**Using VS Code:**
Install the "Live Server" extension and right-click on `index.html` → "Open with Live Server"

## ✨ Features

### 🎯 Core Functionality
- **Interactive Fretboard**: 6-string guitar fretboard (E-A-D-G-B-E) with 22 frets
- **Scale Selection**: Choose from 14+ scale types with any root note
- **Scale Comparison**: Compare two scales side-by-side with color differentiation
- **Pattern Views**: Full, Vertical (3-notes-per-string), and Diagonal patterns
- **Manual Note Marking**: Click any fret to mark/unmark notes manually

### 🎨 Visual Features
- **Color-Coded Notes**: Different colors for root notes, scale notes, and comparison notes
- **Customizable Colors**: Color picker for personalizing your experience
- **Fret Markers**: Visual indicators for standard fret positions
- **Responsive Design**: Works great on laptop screens with mobile-friendly fallbacks

### 🎵 Scale Types Included
- **Major Scales**: Major, Natural Minor, Harmonic Minor, Melodic Minor
- **Pentatonic Scales**: Major Pentatonic, Minor Pentatonic
- **Blues Scale**: Classic blues scale with tritone
- **Modes**: All 7 modes (Ionian, Dorian, Phrygian, Lydian, Mixolydian, Aeolian, Locrian)
- **Special Scales**: Diminished, Whole Tone

### 🔧 Advanced Features
- **Scale Information**: Display scale formulas and intervals
- **Keyboard Shortcuts**: Quick navigation and control
- **Settings Panel**: Customize colors and display options
- **Export Functionality**: Save custom note selections (coming soon)

## 🎮 How to Use

### Basic Usage
1. **Select a Scale**: Choose a root note and scale type from the dropdowns
2. **View on Fretboard**: The scale will be highlighted on the fretboard
3. **Explore Patterns**: Switch between Full, Vertical, and Diagonal views
4. **Manual Marking**: Click any fret to mark/unmark notes

### Comparison Mode
1. **Enable Comparison**: Check the "Comparison Mode" checkbox
2. **Select Two Scales**: Choose different scales for comparison
3. **View Differences**: 
   - Purple: Notes in both scales
   - Blue: Notes only in Scale 1
   - Red: Notes only in Scale 2

### Customization
1. **Open Settings**: Click the settings button (top-right)
2. **Choose Colors**: Use the color pickers to customize note colors
3. **Save Preferences**: Your settings are automatically saved

## 🛠️ Technical Details

### File Structure
```
guitar-scales/
├── index.html          # Main HTML structure
├── styles.css          # All styling and responsive design
├── script.js           # Core JavaScript functionality
└── README.md           # This file
```

### Browser Compatibility
- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

### Performance
- Optimized for smooth interactions
- Efficient DOM manipulation
- Cached scale calculations
- Responsive rendering

## 🎯 Learning Tips

### For Beginners
1. Start with **Major** and **Natural Minor** scales
2. Use **Full** pattern view to see the complete scale
3. Practice identifying the **root note** (red color)
4. Try different **root notes** to understand transposition

### For Intermediate Players
1. Explore **modes** to understand scale relationships
2. Use **Comparison Mode** to see differences between scales
3. Practice **Vertical** patterns for 3-notes-per-string technique
4. Experiment with **color customization** for visual learning

### For Advanced Players
1. Use **Diagonal** patterns for advanced scale shapes
2. Compare **related scales** (e.g., C Major vs A Natural Minor)
3. Create **custom patterns** by manually marking notes
4. Study **scale formulas** and **intervals** for theory understanding

## 🔮 Future Enhancements

- [ ] Chord shape integration
- [ ] Metronome integration
- [ ] Scale practice exercises
- [ ] Custom scale creation
- [ ] Export/import functionality
- [ ] Audio playback
- [ ] Mobile app version

## 🤝 Contributing

This is a learning project! Feel free to:
- Report bugs or issues
- Suggest new features
- Submit improvements
- Share your learning experience

## 📝 License

This project is open source and available under the MIT License.

---

**Happy Learning! 🎸🎵**

*Built with ❤️ for guitarists who want to understand scales better.*
