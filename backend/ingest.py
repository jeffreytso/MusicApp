# ingest.py
import os
import re
import mido
from database import collection_compositions

SOURCE_DIR = "mutopia_files"
# -----------------------------

COMPOSERS = {
    "Johann Sebastian Bach",
    "Béla Bartók",
    "Johannes Brahms",
    "Max Bruch",
    "Anton Bruckner",
    "Ludwig van Beethoven",
    "Frédéric Chopin",
    "Carl Czerny",
    "Claude Debussy",
    "Antonín Dvořák",
    "Gabriel Fauré",
    "César Franck",
    "Edvard Grieg",
    "Joseph Haydn",
    "George Frideric Handel",
    "Franz Liszt",
    "Wolfgang Amadeus Mozart",
    "Felix Mendelssohn",
    "Modest Mussorgsky",
    "Niccolò Paganini",
    "Sergei Rachmaninoff",
    "Jean-Philippe Rameau",
    "Nikolai Rimsky-Korsakov",
    "Camille Saint-Saëns",
    "Franz Schubert",
    "Erik Satie",
    "Domenico Scarlatti",
    "Robert Schumann",
    "Alexander Scriabin",
    "Richard Strauss",
    "Pyotr Ilyich Tchaikovsky",
    "Tomaso Antonio Vitali",
    "Antonio Vivaldi",
}

def parse_ly_header(ly_path):
    """
    Reads a .ly file and uses regex to extract metadata from the header.
    Returns a dictionary with the found metadata.
    """
    try:
        with open(ly_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()

            def pick_first(pattern):
                m = re.search(pattern, content, re.IGNORECASE | re.DOTALL)
                return m.group(1).strip() if m else None

            # allow '...' or "..."
            q = r'(?:"([^"]*)"|\'([^\']*)\')'  # capture either quotes; pick whichever group matched later

            metadata = {}

            # Check mutopia fields first, then fall back to regular fields
            title = pick_first(rf'\bmutopiatitle\s*=\s*{q}')
            if not title:
                title = pick_first(rf'\btitle\s*=\s*{q}')
            if title:
                metadata['title'] = title

            # Check mutopiacomposer first, then fall back to composer
            composer = pick_first(rf'\bmutopiacomposer\s*=\s*{q}')
            if not composer:
                composer = pick_first(rf'\bcomposer\s*=\s*{q}')
            if composer:
                # strip dates/parentheses and excessive whitespace, e.g. "Franz Abt (1819-1885)" -> "Franz Abt"
                composer = re.sub(r'\s*\([^)]*\)\s*', '', composer).strip()
                metadata['composer'] = {"name": composer}

            # Check mutopiaopus first, then fall back to opus
            opus = pick_first(rf'\bmutopiaopus\s*=\s*{q}')
            if not opus:
                opus = pick_first(rf'\bopus\s*=\s*{q}')
            if opus and opus != "":
                metadata['opus'] = opus

            piece = pick_first(rf'\bpiece\s*=\s*{q}')
            if piece:
                metadata['piece'] = piece  # can be useful as subtitle/part name

            date = pick_first(rf'\b(date|mutopiadate)\s*=\s*{q}')
            if date:
                # extract 4-digit year if present
                year = re.search(r'\b(1[5-9]\d{2}|20\d{2})\b', date)
                if year:
                    metadata['year'] = year.group(1)

    except Exception as e:
        print(f"    - Could not parse header from {ly_path}: {e}")
        
    print(f"Metadata: {metadata}")
    return metadata

def midi_to_contour(midi_path):
    """
    Parses a MIDI file to extract the main melody and converts it 
    to a melodic contour string (Parsons code).
    """
    try:
        mid = mido.MidiFile(midi_path)
        notes = []

        # Find the track with the most note_on events (likely the melody)
        melody_track = max(mid.tracks, key=lambda t: len([msg for msg in t if msg.type == 'note_on']))

        for msg in melody_track:
            if msg.type == 'note_on' and msg.velocity > 0:
                notes.append(msg.note)

        if len(notes) < 2:
            return None

        # Convert the list of notes to a contour string
        contour = ["*"]
        for i in range(1, len(notes)):
            if notes[i] > notes[i-1]:
                contour.append("U") # Up
            elif notes[i] < notes[i-1]:
                contour.append("D") # Down
            else:
                contour.append("R") # Repeat
        
        return "".join(contour)

    except Exception as e:
        print(f"    - Could not process MIDI {midi_path}: {e}")
        return None

def resolve_composer_only(composer: str | None) -> str | None:
    """Resolve composer:
    - Only if the provided string contains the LAST NAME of a composer in COMPOSERS
    - Returns the full canonical name from COMPOSERS, else None
    """
    if not composer:
        return None

    # 1) Allowlist match → return canonical form
    lc = composer.lower()
    for c in COMPOSERS:
        last = c.split()[-1].lower()
        if last in lc:
            return c
    return None

def populate_database():
    """
    Walks the local directory, parses files, enriches with MusicBrainz data,
    and inserts the final documents into MongoDB.
    """

    print("Starting database population...")
    collection_compositions.delete_many({})

    for dirpath, _, filenames in os.walk(SOURCE_DIR):
        ly_files = [f for f in filenames if f.endswith('.ly')]
        mid_files = [f for f in filenames if f.endswith('.mid')]
        
        if ly_files and mid_files:
            ly_path = os.path.join(dirpath, ly_files[0])
            mid_path = os.path.join(dirpath, mid_files[0])
            
            print(f"Processing pair in {dirpath}")

            header = parse_ly_header(ly_path)
            title = header.get('title')
            header_composer = header.get('composer', {}).get('name')
            year = header.get('year')
            work_type_hint = header.get('piece')  # sometimes “Andante”, “Pavan”, etc.

            # Resolve composer only (allowlist → MB artists), keep raw mutopia-first title
            resolved_composer = resolve_composer_only(header_composer)
            if not resolved_composer:
                print("    -> Skipping: could not resolve composer for", dirpath)
                continue

            final_metadata = {
                "title": title or "Unknown Title",
                "composer": {"name": resolved_composer}
            }

            contour = midi_to_contour(mid_path)
            if not contour:
                print("    -> Could not generate contour. Skipping.")
                continue

            document = {
                "title": final_metadata.get('title', 'Unknown Title'),
                "composer": final_metadata.get('composer', {"name": "Unknown Composer"}),
                "melodic_contour": contour,
                "lilypond_path": os.path.relpath(ly_path, SOURCE_DIR).replace('\\', '/')
            }
            collection_compositions.insert_one(document)
            print(f"    > Inserted '{document['title']}'")
            
    print("\nDatabase population complete!")

if __name__ == "__main__":
    populate_database()