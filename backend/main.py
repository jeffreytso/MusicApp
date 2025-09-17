

from fastapi import FastAPI, UploadFile
from database import collection_compositions
from bson import ObjectId
import re
import librosa
import numpy as np
import os
import shutil
import traceback

app = FastAPI()

# --- Helper Functions ---
def serialize_doc(doc):
    doc["_id"] = str(doc["_id"])
    return doc

def notes_to_contour(notes):
    """Converts a list of MIDI notes to a Parsons code contour."""
    if len(notes) < 2:
        return None
    contour = ["*"]
    for i in range(1, len(notes)):
        if notes[i] > notes[i-1]:
            contour.append("U")
        elif notes[i] < notes[i-1]:
            contour.append("D")
        else:
            contour.append("R")
    return "".join(contour)

def audio_to_contour(file_path: str):
    """Processes an audio file to extract a melodic contour."""
    try:
        # Basic sanity checks
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")
        try:
            file_size = os.path.getsize(file_path)
        except OSError:
            file_size = 0
        if not file_size:
            raise ValueError("Uploaded file is empty or unreadable")

        # Load the audio file
        # Use deterministic params; mono to simplify pitch tracking
        # If resampling fails with native backends, librosa will raise; we catch below
        y, sr = librosa.load(file_path, sr=22050, mono=True)
        
        # Get pitches and magnitudes
        pitches, magnitudes = librosa.piptrack(y=y, sr=sr)
        
        # Select the dominant pitch in each time frame
        notes = []
        for t in range(pitches.shape[1]):
            index = magnitudes[:, t].argmax()
            pitch = pitches[index, t]
            if pitch > 0:
                # Convert frequency to MIDI note number
                midi_note = librosa.hz_to_midi(pitch)
                # Add the note if it's different from the last one (simple note segmentation)
                if not notes or abs(midi_note - notes[-1]) > 0.5:
                    notes.append(midi_note)
        
        # Convert the sequence of notes to a contour
        return notes_to_contour(notes)
    except Exception as e:
        # Print full traceback for visibility in logs
        print(f"Error processing audio: {e}")
        traceback.print_exc()
        return None


@app.get("/")
async def root():
    count = collection_compositions.count_documents({})
    return {
        "message": "Music Search Engine is running!",
        "database_connection": "successful",
        "composition_count": count
    }

@app.post("/search/parsons")
async def search_by_parsons(query: str):
    print(f"Received Parsons query: {query}")
    
    # 2. Escape any special regex characters in the user's input
    escaped_query = re.escape(query)
    
    # 3. Find documents where the contour STARTS WITH the user's query
    #    This is more flexible and handles the '*' correctly.
    results_cursor = collection_compositions.find(
        {"melodic_contour": {"$regex": f"{escaped_query}", "$options": "i"}}
    ).limit(20)
    
    results_list = [serialize_doc(doc) for doc in results_cursor]
    
    return {"query": query, "results": results_list}

@app.post("/search/audio")
async def search_by_audio(file: UploadFile):
    # Save the uploaded audio file temporarily
    temp_dir = "temp_audio"
    os.makedirs(temp_dir, exist_ok=True)
    file_path = os.path.join(temp_dir, file.filename)
    
    try:
        # --- MODIFIED FILE SAVING LOGIC ---
        # Read the file's contents into memory
        contents = await file.read()
        
        # Write the contents to a temporary file
        with open(file_path, "wb") as buffer:
            buffer.write(contents)
        # --- END OF MODIFICATION ---

        # Process the audio file to get a contour
        contour = audio_to_contour(file_path)
    
    finally:
        # Ensure the temporary file is always cleaned up
        if os.path.exists(file_path):
            os.remove(file_path)

    print(f"Generated Contour from Audio: {contour}")

    if not contour:
        return {"generated_contour": None, "results": []}

    # Search the database with the generated contour
    results_cursor = collection_compositions.find(
        {"melodic_contour": {"$regex": re.escape(contour), "$options": "i"}}
    ).limit(10)
    
    results_list = [serialize_doc(doc) for doc in results_cursor]
    
    return {"generated_contour": contour, "results": results_list}