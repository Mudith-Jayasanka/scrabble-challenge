require('dotenv').config();
const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// MongoDB Connection
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

let db;

async function connectToMongo() {
  try {
    await client.connect();
    db = client.db(); // The database name is already in the connection string
    console.log('Successfully connected to MongoDB');
    
    // Initialize database (create collections if they don't exist)
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);

    if (!collectionNames.includes('games')) {
      await db.createCollection('games');
      console.log('Created "games" collection.');
    }
    if (!collectionNames.includes('players')) {
      await db.createCollection('players');
      console.log('Created "players" collection.');
    }
    if (!collectionNames.includes('moves')) {
      await db.createCollection('moves');
      console.log('Created "moves" collection.');
    }

  } catch (error) {
    console.error('Error connecting to MongoDB', error);
    process.exit(1);
  }
}

// API Endpoints
app.get('/api', (req, res) => {
  res.send('Hello from the Scrabble server!');
});

app.post('/api/submit-move', async (req, res) => {
  if (!db) {
    return res.status(500).send({ message: 'Database not initialized' });
  }

  const move = req.body;
  if (!move || !move.placements || !move.gameId || !move.playerId) {
    return res.status(400).send({ message: 'Invalid move data' });
  }

  try {
    const movesCollection = db.collection('moves');
    const result = await movesCollection.insertOne(move);
    res.status(201).send({ message: 'Move submitted successfully', moveId: result.insertedId });
  } catch (error) {
    console.error('Error submitting move', error);
    res.status(500).send({ message: 'Error submitting move' });
  }
});

// Start the server
connectToMongo().then(() => {
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
});
