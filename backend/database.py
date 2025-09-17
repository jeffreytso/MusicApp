import os
from dotenv import load_dotenv
from pymongo import MongoClient

# Load environment variables from .env file
load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")

# Create a MongoDB client
client = MongoClient(MONGO_URI)

# Get a reference to the database and collection
db = client.music_db
collection_compositions = db.compositions