import { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, FlatList, StyleSheet, ActivityIndicator, Alert, Pressable } from 'react-native';
// Correct imports from expo-audio based on the documentation
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';

const API_BASE_URL = 'http://192.168.1.22:8000'; // Replace with your IP

interface SearchResult {
  _id: string;
  title: string;
  composer: { name: string; };
}

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Use the new hooks to manage the recorder
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  // Request permissions once when the component loads
  useEffect(() => {
    (async () => {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert('Permission Required', 'Microphone access is needed to search by humming.');
      }

      setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      });
    })();
  }, []);

  // --- Parsons Code Search ---
  const handleParsonsSearch = async () => {
    if (!query) return;
    setIsLoading(true);
    setResults([]);
    try {
      // Construct the URL with query parameters
      const url = new URL(`${API_BASE_URL}/search/parsons`);
      url.searchParams.append('query', query);

      // Use the built-in fetch API
      const response = await fetch(url.toString(), {
        method: 'POST',
      });
      
      // fetch doesn't throw an error for HTTP statuses like 404 or 500
      // so we need to check the 'ok' status manually.
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      // We need to manually parse the JSON response
      const data = await response.json();
      setResults(data.results);

    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Could not connect to the server.');
    } finally {
      setIsLoading(false);
    }
  };

  // --- Audio Recording Functions (Rewritten) ---
  async function startRecording() {
    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (err) {
      console.error('Failed to start recording', err);
      Alert.alert('Error', 'Failed to start recording.');
    }
  }

  async function stopRecordingAndSearch() {
    if (!recorderState.isRecording) return;
    setIsLoading(true);
    setResults([]);
    
    try {
      // --- THIS IS THE FIX ---
      // Stop the recording first
      await recorder.stop();
      // THEN, get the final status directly from the recorder
      const status = await recorder.getStatus();
      const uri = status.url; // Use status.url instead of recorder.uri
      // ----------------------

      console.log('Recording stopped and stored at', uri);
      
      if (uri) {
        const formData = new FormData();
        formData.append('file', {
          uri: uri,
          name: `recording-${Date.now()}.m4a`,
          type: 'audio/m4a',
        } as any);

        const response = await fetch(`${API_BASE_URL}/search/audio`, {
          method: 'POST',
          body: formData,
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        if (!response.ok) throw new Error('Server error');
        const data = await response.json();
        setResults(data.results);
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to search by audio.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      {/* --- Parsons Search UI --- */}
      <TextInput
        style={styles.input}
        placeholder="Enter Parsons Code (e.g., *UDDRU)"
        value={query}
        onChangeText={setQuery}
      />
      <Button title="Search Parsons Code" onPress={handleParsonsSearch} disabled={isLoading || recorderState.isRecording} />
      
      <View style={styles.separator} />

      {/* --- Audio Search UI --- */}
      <Pressable 
        style={[styles.recordButton, recorderState.isRecording && styles.recordingButton]}
        onPress={recorderState.isRecording ? stopRecordingAndSearch : startRecording}
        disabled={isLoading}
      >
        <Text style={styles.recordButtonText}>{recorderState.isRecording ? 'Stop & Search' : 'Search by Humming'}</Text>
      </Pressable>

      {/* --- Results Display --- */}
      {isLoading ? ( <ActivityIndicator size="large" style={styles.loader} /> ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => (
            <View style={styles.resultItem}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.composer}>{item.composer.name}</Text>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>No results found.</Text>}
        />
      )}
    </View>
  );
}

// --- Styles (Same as before) ---
const styles = StyleSheet.create({
  separator: { marginVertical: 20, height: 1, width: '80%', backgroundColor: '#ccc' },
  recordButton: { backgroundColor: '#3498db', padding: 15, borderRadius: 10, alignItems: 'center' },
  recordingButton: { backgroundColor: '#e74c3c' },
  recordButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  container: { flex: 1, padding: 20, paddingTop: 80, backgroundColor: '#fff' },
  input: { height: 40, borderColor: 'gray', borderWidth: 1, marginBottom: 12, paddingHorizontal: 10, borderRadius: 5 },
  loader: { marginTop: 20 },
  resultItem: { paddingVertical: 10, borderBottomColor: '#eee', borderBottomWidth: 1 },
  title: { fontSize: 16, fontWeight: 'bold' },
  composer: { fontSize: 14, color: 'gray' },
  emptyText: { textAlign: 'center', marginTop: 20, color: 'gray' },
});