import { requestRecordingPermissionsAsync } from 'expo-audio';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Pitchy, { PitchyConfig, PitchyEventCallback } from 'react-native-pitchy';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

interface PitchData {
  frequency: number;
  note: string;
  octave: number;
  cents: number;
}

const TunerScreen: React.FC = () => {
  const [isListening, setIsListening] = useState(false);
  const [pitchData, setPitchData] = useState<PitchData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tuningColor, setTuningColor] = useState('#666');
  const [needleRotation] = useState(new Animated.Value(0));
  const [isInitialized, setIsInitialized] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [hasSufficientVolume, setHasSufficientVolume] = useState(false);
  const subscriptionRef = useRef<any>(null);
  const volumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check permissions and initialize Pitchy
  useEffect(() => {
    const initializePitchy = async () => {
      try {
        // Request audio permissions
        const { status } = await requestRecordingPermissionsAsync();
        if (status !== 'granted') {
          setError('Audio permission is required to use the tuner');
          setHasPermission(false);
          return;
        }
        setHasPermission(true);

        // Initialize Pitchy with more conservative settings
        const config: PitchyConfig = {
          bufferSize: 4096, // Smaller buffer size for better compatibility
          minVolume: -50,   // Lower threshold to allow normal audio detection
        };
        
        await Pitchy.init(config);
        setIsInitialized(true);
        setError(null);
      } catch (e) {
        console.error('Failed to initialize Pitchy:', e);
        setError('Failed to initialize audio system');
        setIsInitialized(false);
      }
    };

    initializePitchy();
    
    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
        subscriptionRef.current = null;
      }
      if (volumeTimeoutRef.current) {
        clearTimeout(volumeTimeoutRef.current);
        volumeTimeoutRef.current = null;
      }
      if (isInitialized) {
        Pitchy.stop().catch(console.error);
      }
    };
  }, []);

  // Convert frequency to note and cents
  const frequencyToNote = (frequency: number): PitchData => {
    const A4 = 440;
    const semitoneRatio = Math.pow(2, 1/12);
    
    // Calculate semitones from A4
    const semitones = Math.round(12 * Math.log2(frequency / A4));
    const noteIndex = (9 + semitones) % 12; // A is index 9
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const note = noteNames[noteIndex < 0 ? noteIndex + 12 : noteIndex];
    
    // Calculate octave
    const octave = Math.floor(4 + semitones / 12);
    
    // Calculate cents (100 cents = 1 semitone)
    const exactSemitones = 12 * Math.log2(frequency / A4);
    const cents = Math.round((exactSemitones - semitones) * 100);
    
    return { frequency, note, octave, cents };
  };

  // This function will start the detector
  const handleStart = async () => {
    if (!hasPermission) {
      setError('Audio permission is required');
      return;
    }

    try {
      setError(null);
      
      // Always stop first if listening
      if (isListening) {
        await handleStop();
        // Wait a bit for cleanup
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Always reinitialize for a fresh start - this is the key fix
      console.log('Reinitializing audio system for fresh start...');
      setIsInitialized(false);
      await reinitializeAudio();
      
      if (!isInitialized) {
        setError('Failed to initialize audio system');
        return;
      }

      // Start pitch detection
      console.log('Starting pitch detection...');
      await Pitchy.start();
      setIsListening(true);

      // Listen to pitch events
      const handlePitchDetected: PitchyEventCallback = (data) => {
        console.log('Pitch detected:', data);
        
        // Clear any existing volume timeout
        if (volumeTimeoutRef.current) {
          clearTimeout(volumeTimeoutRef.current);
        }
        
        if (data.pitch && data.pitch > 0) {
          // We have a valid pitch, so we have sufficient volume
          setHasSufficientVolume(true);
          const pitchInfo = frequencyToNote(data.pitch);
          setPitchData(pitchInfo);
          console.log('Setting pitch data:', pitchInfo);
          
          // Set a timeout to clear the volume state if no more pitch is detected
          volumeTimeoutRef.current = setTimeout(() => {
            console.log('Clearing pitch data due to timeout');
            setHasSufficientVolume(false);
            setPitchData(null);
          }, 1000); // Increased to 1000ms for more stability
        } else {
          // No pitch detected - this is normal, don't clear immediately
          console.log('No pitch detected, but keeping current state');
        }
      };

      subscriptionRef.current = Pitchy.addListener(handlePitchDetected);
      console.log('Pitch detection started successfully');
    } catch (e) {
      console.error('Error starting pitch detection:', e);
      setError(`Failed to start pitch detection: ${e instanceof Error ? e.message : String(e)}`);
      setIsListening(false);
      setIsInitialized(false);
    }
  };

  const handleStop = async () => {
    try {
      console.log('Stopping pitch detection...');
      
      // Remove listener first
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
        subscriptionRef.current = null;
      }
      
      // Stop pitch detection
      if (isListening) {
        await Pitchy.stop();
        console.log('Pitch detection stopped');
      }
      
      // Clear volume timeout
      if (volumeTimeoutRef.current) {
        clearTimeout(volumeTimeoutRef.current);
        volumeTimeoutRef.current = null;
      }
      
      // Reset state but keep system initialized
      setIsListening(false);
      setPitchData(null);
      setHasSufficientVolume(false);
      
      console.log('Stop completed successfully');
    } catch (e) {
      console.error('Error stopping pitch detection:', e);
      setError('Failed to stop pitch detection');
      // Force reset state even if stop fails
      setIsListening(false);
      setPitchData(null);
      // Only mark as uninitialized if there was an error
      setIsInitialized(false);
    }
  };

  // Reinitialize audio system when needed
  const reinitializeAudio = async () => {
    try {
      setError(null);
      console.log('Initializing audio system...');
      
      // Try to stop any existing instance first
      try {
        await Pitchy.stop();
      } catch (e) {
        // Ignore errors when stopping - it might not be running
        console.log('No existing instance to stop');
      }
      
      // Wait a bit before reinitializing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Reinitialize Pitchy with more conservative config
      const config: PitchyConfig = {
        bufferSize: 4096, // Smaller buffer size for better compatibility
        minVolume: -40,   // Higher minimum volume threshold
      };
      
      await Pitchy.init(config);
      // Longer delay to ensure system is ready
      await new Promise(resolve => setTimeout(resolve, 200));
      setIsInitialized(true);
      console.log('Audio system initialized successfully');
    } catch (e) {
      console.error('Failed to reinitialize Pitchy:', e);
      setError(`Failed to initialize audio system: ${e instanceof Error ? e.message : String(e)}`);
      setIsInitialized(false);
    }
  };

  // Update tuning color and needle position based on cents
  useEffect(() => {
    if (pitchData && hasSufficientVolume) {
      const cents = pitchData.cents;
      const absCents = Math.abs(cents);
      
      // Determine color based on tuning accuracy
      let color = '#666';
      if (absCents < 5) {
        color = '#4CAF50'; // Green - in tune
      } else if (absCents < 15) {
        color = '#FFC107'; // Yellow - close
      } else {
        color = '#F44336'; // Red - out of tune
      }
      setTuningColor(color);

      // Animate needle position (-50 to +50 degrees for -50 to +50 cents)
      const rotation = Math.max(-50, Math.min(50, cents));
      Animated.timing(needleRotation, {
        toValue: rotation,
        duration: 200,
        useNativeDriver: true,
      }).start();
    } else if (!hasSufficientVolume) {
      // Reset needle to center when no sufficient volume
      Animated.timing(needleRotation, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
      setTuningColor('#666');
    }
  }, [pitchData, hasSufficientVolume]);

  const getTuningStatus = () => {
    if (!pitchData) return 'Ready';
    const absCents = Math.abs(pitchData.cents);
    if (absCents < 5) return 'In Tune';
    if (absCents < 15) return 'Close';
    return 'Out of Tune';
  };

  const getFrequencyText = () => {
    if (!pitchData) return '-- Hz';
    return `${pitchData.frequency.toFixed(1)} Hz`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>

        {/* Frequency Display */}
        <Text style={[styles.frequencyText, { opacity: hasSufficientVolume ? 1 : 0.3 }]}>
          {getFrequencyText()}
        </Text>

        {/* Note Display */}
        <View style={styles.noteContainer}>
          <Text style={[styles.noteText, { color: tuningColor, opacity: hasSufficientVolume ? 1 : 0.3 }]}>
            {pitchData?.note ?? '-'}
          </Text>
          <Text style={[styles.octaveText, { opacity: hasSufficientVolume ? 1 : 0.3 }]}>
            {pitchData?.octave ?? ''}
          </Text>
        </View>

        {/* Tuning Meter */}
        <View style={styles.meterContainer}>
          <View style={styles.meterBackground}>
            <View style={styles.meterCenter} />
            <View style={styles.meterLeft} />
            <View style={styles.meterRight} />
            
            {/* Needle */}
            <Animated.View
              style={[
                styles.needle,
                {
                  transform: [
                    {
                      rotate: needleRotation.interpolate({
                        inputRange: [-50, 50],
                        outputRange: ['-50deg', '50deg'],
                      }),
                    },
                  ],
                },
              ]}
            />
          </View>
          
          {/* Cents Display */}
          <Text style={[styles.centsText, { color: tuningColor, opacity: hasSufficientVolume ? 1 : 0.3 }]}>
            {pitchData?.cents.toFixed(1) ?? '0.0'} cents
          </Text>
        </View>

        {/* Error Display */}
        {error && (
          <Text style={styles.errorText}>
            {error}
          </Text>
        )}

        {/* Control Button */}
        <TouchableOpacity
          style={[
            styles.controlButton, 
            { 
              backgroundColor: !hasPermission || !isInitialized ? '#666' :
                              isListening ? '#F44336' : '#4CAF50' 
            }
          ]}
          onPress={isListening ? handleStop : handleStart}
          disabled={!hasPermission || !isInitialized}
        >
          <Text style={styles.controlButtonText}>
            {!hasPermission ? 'No Permission' :
             !isInitialized ? 'Initializing...' :
             isListening ? 'Stop' : 'Start'}
          </Text>
        </TouchableOpacity>
      </View>

      <StatusBar style="light" />
    </SafeAreaView>
  );  
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#667eea',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 100, // Add bottom padding to prevent overlap with tab bar
  },
  statusText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 18,
    marginBottom: 20,
    textAlign: 'center',
  },
  frequencyText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 24,
    marginTop: 20,
    marginBottom: 30,
    fontWeight: '600',
  },
  noteContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 40,
  },
  noteText: {
    color: '#fff',
    fontSize: 120,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  octaveText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 60,
    marginLeft: 10,
    marginBottom: 10,
  },
  meterContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  meterBackground: {
    width: width * 0.7,
    height: width * 0.7,
    borderRadius: width * 0.35,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  meterCenter: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
    position: 'absolute',
    zIndex: 3,
  },
  meterLeft: {
    position: 'absolute',
    left: 20,
    top: '50%',
    width: 2,
    height: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    transform: [{ translateY: -10 }],
  },
  meterRight: {
    position: 'absolute',
    right: 20,
    top: '50%',
    width: 2,
    height: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    transform: [{ translateY: -10 }],
  },
  needle: {
    position: 'absolute',
    width: 2,
    height: width * 0.25,
    backgroundColor: '#fff',
    top: '50%',
    left: '50%',
    transformOrigin: 'bottom center',
    transform: [{ translateX: -1 }],
    zIndex: 2,
  },
  centsText: {
    fontSize: 28,
    fontWeight: '600',
    marginTop: 20,
    textAlign: 'center',
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 16,
    marginTop: 20,
    textAlign: 'center',
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    padding: 10,
    borderRadius: 8,
  },
  controlButton: {
    paddingHorizontal: 40,
    paddingVertical: 15,
    borderRadius: 25,
    minWidth: 120,
    alignItems: 'center',
    marginTop: 20, // Add margin to ensure spacing from content above
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  controlButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default TunerScreen;
