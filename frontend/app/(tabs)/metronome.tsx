import { setAudioModeAsync } from 'expo-audio';
import React, { useEffect, useRef, useState } from 'react';
import {
    Dimensions,
    StyleSheet,
    View
} from 'react-native';
import { WebView } from 'react-native-webview';

const {width, height} = Dimensions.get('window');

const MetronomeScreen: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpm] = useState(120);
  const [timeSignature, setTimeSignature] = useState('4/4');
  const webViewRef = useRef<WebView>(null);

  useEffect(() => {
    const configureAudio = async () => {
      try {
        // Configure audio session to play even in silent mode
        await setAudioModeAsync({
          playsInSilentMode: true,
        });
      } catch (error) {
        console.log('Error configuring audio:', error);
      }
    };

    configureAudio();
  }, []);

  const metronomeHTML = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <title>Metronome</title>
        <style>
            body {
                margin: 0;
                padding: 20px;
                font-family: Arial, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                text-align: center;
                height: 100vh;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
            }
            .metronome-container {
                background: rgba(255, 255, 255, 0.1);
                border-radius: 20px;
                padding: 30px;
                backdrop-filter: blur(10px);
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            }
            .bpm-display {
                font-size: 4rem;
                font-weight: bold;
                margin: 20px 0;
                text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
            }
            .time-signature-dropdown {
                font-size: 1.5rem;
                margin: 10px 0;
                padding: 10px 20px;
                border: 2px solid rgba(255, 255, 255, 0.3);
                border-radius: 15px;
                background: rgba(255, 255, 255, 0.1);
                color: white;
                cursor: pointer;
                outline: none;
                transition: all 0.3s ease;
                appearance: none;
                background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6,9 12,15 18,9'%3e%3c/polyline%3e%3c/svg%3e");
                background-repeat: no-repeat;
                background-position: right 15px center;
                background-size: 20px;
                padding-right: 50px;
            }
            .time-signature-dropdown:hover {
                border-color: rgba(255, 255, 255, 0.5);
                background: rgba(255, 255, 255, 0.2);
            }
            .time-signature-dropdown:focus {
                border-color: #4ecdc4;
                box-shadow: 0 0 0 3px rgba(78, 205, 196, 0.3);
            }
            .time-signature-dropdown option {
                background: #333;
                color: white;
                padding: 10px;
            }
            .beat-indicators {
                display: flex;
                justify-content: space-between;
                margin: 20px 16px;
                flex-wrap: nowrap;
                max-width: calc(100% - 32px);
            }
            .beat-rect {
                height: 50px;
                background: rgba(255, 255, 255, 0.2);
                border: 2px solid rgba(255, 255, 255, 0.3);
                border-radius: 8px;
                transition: all 0.1s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                position: relative;
                overflow: hidden;
                flex: 1;
                min-width: 15px;
                max-width: 50px;
            }
            .beat-rect:not(:last-child) {
                margin-right: 3px;
            }
            .beat-rect::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: transparent;
                transition: all 0.2s ease;
            }
            .beat-rect.half-filled::before {
                background: linear-gradient(to bottom, #4ecdc4 50%, transparent 50%);
            }
            .beat-rect.full-filled::before {
                background: #4ecdc4;
            }
            .beat-rect.active {
                border-color: #4ecdc4;
                transform: scale(1.1);
                box-shadow: 0 4px 15px rgba(78, 205, 196, 0.6);
            }
            .beat-rect.hidden {
                display: none;
            }
            .controls {
                margin-top: 20px;
            }
            .control-button {
                background: rgba(255, 255, 255, 0.2);
                border: 2px solid rgba(255, 255, 255, 0.3);
                color: white;
                padding: 10px 20px;
                margin: 5px;
                border-radius: 25px;
                cursor: pointer;
                font-size: 1rem;
                transition: all 0.3s ease;
            }
            .control-button:hover {
                background: rgba(255, 255, 255, 0.3);
                transform: translateY(-2px);
            }
            .control-button:active {
                background: rgba(255, 255, 255, 0.4);
                transform: translateY(0);
            }
            #tapButton.active {
                background: rgba(78, 205, 196, 0.3);
                border-color: #4ecdc4;
            }
            .bpm-controls {
                display: flex;
                justify-content: center;
                align-items: center;
                margin: 20px 0;
            }
            .bpm-slider {
                width: 100%;
                height: 8px;
                border-radius: 4px;
                background: rgba(255, 255, 255, 0.2);
                outline: none;
                -webkit-appearance: none;
                appearance: none;
                cursor: pointer;
            }
            .bpm-slider::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 24px;
                height: 24px;
                border-radius: 50%;
                background: #4ecdc4;
                cursor: pointer;
                box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
                transition: all 0.3s ease;
            }
            .bpm-slider::-webkit-slider-thumb:hover {
                background: #45b7aa;
                transform: scale(1.1);
            }
            .bpm-slider::-moz-range-thumb {
                width: 24px;
                height: 24px;
                border-radius: 50%;
                background: #4ecdc4;
                cursor: pointer;
                border: none;
                box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
            }
        </style>
    </head>
    <body>
        <div class="metronome-container">
            <div class="bpm-display" id="bpmDisplay">120</div>
            <select class="time-signature-dropdown" id="timeSignatureDropdown" onchange="changeTimeSignatureFromDropdown(this.value)">
                <option value="4/4">4/4</option>
                <option value="3/4">3/4</option>
                <option value="2/4">2/4</option>
                <option value="6/8">6/8</option>
                <option value="12/8">12/8</option>
                <option value="5/4">5/4</option>
            </select>
            
            <div class="beat-indicators" id="beatIndicators">
                <div class="beat-rect" data-beat="1"></div>
                <div class="beat-rect" data-beat="2"></div>
                <div class="beat-rect" data-beat="3"></div>
                <div class="beat-rect" data-beat="4"></div>
                <div class="beat-rect" data-beat="5"></div>
                <div class="beat-rect" data-beat="6"></div>
                <div class="beat-rect" data-beat="7"></div>
                <div class="beat-rect" data-beat="8"></div>
                <div class="beat-rect" data-beat="9"></div>
                <div class="beat-rect" data-beat="10"></div>
                <div class="beat-rect" data-beat="11"></div>
                <div class="beat-rect" data-beat="12"></div>
            </div>
            
            <div class="bpm-controls">
                <input type="range" id="bpmSlider" min="30" max="300" value="120" class="bpm-slider" oninput="changeBPMFromSlider(this.value)">
            </div>
            
            <div class="controls">
                <button class="control-button" id="playButton" onclick="toggleMetronome()">Play</button>
                <button class="control-button" id="tapButton" onclick="tapTempo()">Tap Tempo</button>
            </div>
        </div>

        <script>
            let isPlaying = false;
            let bpm = 120;
            let timeSignature = '4/4';
            let currentBeat = 1;
            let intervalId = null;
            let audioContext = null;
            let oscillator = null;
            let gainNode = null;
            
            // Tap tempo variables
            let tapTimes = [];
            let tapTimeout = null;
            
            // Beat sound states: 0 = no sound, 1 = low sound, 2 = high sound
            let beatSounds = [2, 1, 1, 1]; // Default: first beat high, others low

            // Initialize audio context
            function initAudio() {
                if (!audioContext) {
                    audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    gainNode = audioContext.createGain();
                    gainNode.connect(audioContext.destination);
                    gainNode.gain.value = 0.3;
                }
            }

            function playClick() {
                initAudio();
                
                // Get sound state for current beat (0-based index)
                const soundState = beatSounds[currentBeat - 1] || 0;
                
                // Don't play sound if state is 0 (no sound)
                if (soundState === 0) return;
                
                if (oscillator) {
                    oscillator.stop();
                }
                
                oscillator = audioContext.createOscillator();
                oscillator.connect(gainNode);
                
                // Different frequencies based on sound state
                if (soundState === 2) {
                    oscillator.frequency.value = 1000; // High sound
                } else if (soundState === 1) {
                    oscillator.frequency.value = 800; // Low sound
                }
                
                oscillator.type = 'sine';
                oscillator.start();
                oscillator.stop(audioContext.currentTime + 0.1);
            }

            function updateDisplay() {
                document.getElementById('bpmDisplay').textContent = bpm;
                document.getElementById('timeSignatureDropdown').value = timeSignature;
                document.getElementById('bpmSlider').value = bpm;
                
                // Update beat indicators based on time signature
                const beatsPerMeasure = parseInt(timeSignature.split('/')[0]);
                updateBeatIndicators(beatsPerMeasure);
            }

            function changeBPM(delta) {
                bpm = Math.max(30, Math.min(300, bpm + delta));
                updateDisplay();
                if (isPlaying) {
                    stopMetronome();
                    startMetronome();
                }
            }

            function changeBPMFromSlider(newBPM) {
                bpm = parseInt(newBPM);
                updateDisplay();
                if (isPlaying) {
                    stopMetronome();
                    startMetronome();
                }
            }

            function changeTimeSignature() {
                const signatures = ['4/4', '3/4', '2/4', '6/8', '12/8', '5/4'];
                const currentIndex = signatures.indexOf(timeSignature);
                timeSignature = signatures[(currentIndex + 1) % signatures.length];
                updateDisplay();
                if (isPlaying) {
                    stopMetronome();
                    startMetronome();
                }
            }

            function changeTimeSignatureFromDropdown(newSignature) {
                timeSignature = newSignature;
                updateDisplay();
                if (isPlaying) {
                    stopMetronome();
                    startMetronome();
                }
            }

            function startMetronome() {
                isPlaying = true;
                document.getElementById('playButton').textContent = 'Stop';
                
                const beatsPerMeasure = parseInt(timeSignature.split('/')[0]);
                const interval = 60000 / bpm; // Convert BPM to milliseconds
                
                // Update visible beat indicators
                updateBeatIndicators(beatsPerMeasure);
                
                intervalId = setInterval(() => {
                    playClick();
                    
                    // Remove active class from all beat indicators
                    const beatRects = document.querySelectorAll('.beat-rect');
                    beatRects.forEach(rect => rect.classList.remove('active'));
                    
                    // Add active class to current beat
                    const currentBeatRect = document.querySelector('[data-beat="' + currentBeat + '"]');
                    if (currentBeatRect) {
                        currentBeatRect.classList.add('active');
                    }
                    
                    currentBeat++;
                    if (currentBeat > beatsPerMeasure) {
                        currentBeat = 1;
                    }
                }, interval);
            }

            function updateBeatIndicators(beatsPerMeasure) {
                // Ensure beatSounds array has enough elements
                while (beatSounds.length < beatsPerMeasure) {
                    beatSounds.push(1); // Default to low sound for new beats
                }
                
                const beatRects = document.querySelectorAll('.beat-rect');
                beatRects.forEach((rect, index) => {
                    if (index < beatsPerMeasure) {
                        rect.classList.remove('hidden');
                        // Remove any existing sound state classes
                        rect.classList.remove('half-filled', 'full-filled');
                        // Add appropriate class based on sound state
                        const soundState = beatSounds[index] || 0;
                        if (soundState === 1) {
                            rect.classList.add('half-filled');
                        } else if (soundState === 2) {
                            rect.classList.add('full-filled');
                        }
                        // Add click handler
                        rect.onclick = () => toggleBeatSound(index);
                    } else {
                        rect.classList.add('hidden');
                    }
                });
            }

            function toggleBeatSound(beatIndex) {
                // Cycle through states: 0 -> 1 -> 2 -> 0
                beatSounds[beatIndex] = (beatSounds[beatIndex] + 1) % 3;
                
                // Update visual state
                const rect = document.querySelector('[data-beat="' + (beatIndex + 1) + '"]');
                if (rect) {
                    rect.classList.remove('half-filled', 'full-filled');
                    if (beatSounds[beatIndex] === 1) {
                        rect.classList.add('half-filled');
                    } else if (beatSounds[beatIndex] === 2) {
                        rect.classList.add('full-filled');
                    }
                }
            }

            function stopMetronome() {
                isPlaying = false;
                document.getElementById('playButton').textContent = 'Play';
                if (intervalId) {
                    clearInterval(intervalId);
                    intervalId = null;
                }
                currentBeat = 1;
                
                // Remove active class from all beat indicators
                const beatRects = document.querySelectorAll('.beat-rect');
                beatRects.forEach(rect => rect.classList.remove('active'));
            }

            function toggleMetronome() {
                if (isPlaying) {
                    stopMetronome();
                } else {
                    startMetronome();
                }
            }

            function tapTempo() {
                const now = Date.now();
                tapTimes.push(now);
                
                // Visual feedback
                const tapButton = document.getElementById('tapButton');
                tapButton.classList.add('active');
                setTimeout(() => {
                    tapButton.classList.remove('active');
                }, 150);
                
                // Keep only the last 4 taps
                if (tapTimes.length > 4) {
                    tapTimes.shift();
                }
                
                // Need at least 2 taps to calculate tempo
                if (tapTimes.length >= 2) {
                    const intervals = [];
                    for (let i = 1; i < tapTimes.length; i++) {
                        intervals.push(tapTimes[i] - tapTimes[i - 1]);
                    }
                    
                    // Calculate average interval
                    const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
                    
                    // Convert to BPM (60000ms per minute / interval in ms)
                    const newBPM = Math.round(60000 / avgInterval);
                    
                    // Clamp to reasonable range
                    const clampedBPM = Math.max(30, Math.min(300, newBPM));
                    
                    // Update BPM
                    bpm = clampedBPM;
                    updateDisplay();
                    
                    // Restart metronome if playing
                    if (isPlaying) {
                        stopMetronome();
                        startMetronome();
                    }
                }
                
                // Clear taps after 3 seconds of inactivity
                clearTimeout(tapTimeout);
                tapTimeout = setTimeout(() => {
                    tapTimes = [];
                }, 3000);
            }

            // Initialize display
            updateDisplay();

            // Listen for messages from React Native
            window.addEventListener('message', function(event) {
                const data = JSON.parse(event.data);
                if (data.type === 'setBPM') {
                    bpm = data.bpm;
                    updateDisplay();
                    if (isPlaying) {
                        stopMetronome();
                        startMetronome();
                    }
                } else if (data.type === 'setTimeSignature') {
                    timeSignature = data.timeSignature;
                    updateDisplay();
                    if (isPlaying) {
                        stopMetronome();
                        startMetronome();
                    }
                } else if (data.type === 'toggle') {
                    toggleMetronome();
                }
            });
        </script>
    </body>
    </html>
  `;

  
  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{html: metronomeHTML}}
        style={styles.webview}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        mixedContentMode="compatibility"
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        scrollEnabled={false}
        bounces={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        scalesPageToFit={false}
        allowsBackForwardNavigationGestures={false}
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
      />
      
      
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  webview: {
    flex: 1,
  },
});

export default MetronomeScreen;
