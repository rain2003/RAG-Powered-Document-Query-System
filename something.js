const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const cors = require("cors");
const fs = require("fs");
const { MongoClient } = require("mongodb");
const math = require("mathjs");

const app = express();
const port = 3000;

app.use(express.json());
app.use(cors());

let extracted;
const upload = multer({ dest: "uploads/" });

// MongoDB connection URI
const mongoUri = "mongodb://localhost:27017"; // Replace with your MongoDB URI
const client = new MongoClient(mongoUri);

// Connect to MongoDB
async function connectToMongo() {
    try {
        await client.connect();
        console.log("Connected to MongoDB");
    } catch (error) {
        console.error("Error connecting to MongoDB:", error);
    }
}

// Function to insert embeddings and text chunks into MongoDB
async function storeEmbedding(textChunk, embedding) {
    const db = client.db("embedding_db");
    const collection = db.collection("document_embeddings");

    try {
        const result = await collection.insertOne({
            text_chunk: textChunk,
            embedding: embedding,
            timestamp: new Date()
        });
        console.log("Embedding stored in MongoDB with ID:", result.insertedId);
    } catch (error) {
        console.error("Error storing embedding in MongoDB:", error);
    }
}

// Function to generate embeddings
async function generateEmbedding(text) {
    try {
        const response = await fetch("http://localhost:11434/api/embeddings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "mxbai-embed-large",
                prompt: text
            })
        });

        const data = await response.json();
        return data.embedding;
    } catch (error) {
        console.error("Error generating embedding:", error.message);
        return null;
    }
}

// Function to ask Ollama a question
async function askOllama(prompt) {
    try {
        const response = await fetch("http://localhost:11434/api/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "tinyllama",
                prompt: prompt,
                stream: false
            })
        });

        const data = await response.json();
        return data.response;
    } catch (error) {
        console.error("Error communicating with Ollama:", error.message);
        return "Failed to get response from Ollama.";
    }
}

// Function to split text into chunks
const chunkSize = 200; // Number of characters per chunk
function splitTextIntoChunks(text, chunkSize) {
    const chunks = [];
    for (let i = 0; i < text.length; i += chunkSize) {
        chunks.push(text.slice(i, i + chunkSize));
    }
    return chunks;
}

// Route to upload a PDF and extract text
app.post("/upload", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        const fileBuffer = fs.readFileSync(req.file.path);
        const pdfData = await pdfParse(fileBuffer);
        const extractedText = pdfData.text;

        // Split text into chunks
        const textChunks = splitTextIntoChunks(extractedText, chunkSize);

        // Generate embeddings for each chunk
        for (const chunk of textChunks) {
            const embedding = await generateEmbedding(chunk);
            if (embedding) {
                await storeEmbedding(chunk, embedding);
            }
        }

        res.json({ message: "File processed successfully" });
        fs.unlinkSync(req.file.path);
    } catch (error) {
        res.status(500).json({ error: "Error processing file" });
    }
});

// Function to generate embedding for the question
async function generateQuestionEmbedding(question) {
    try {
        const response = await fetch("http://localhost:11434/api/embeddings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "mxbai-embed-large",
                prompt: question
            })
        });

        const data = await response.json();
        return data.embedding;
    } catch (error) {
        console.error("Error generating question embedding:", error.message);
        return null;
    }
}

// Function to calculate cosine similarity
function cosineSimilarity(vecA, vecB) {
    const dotProduct = math.dot(vecA, vecB);
    const magnitudeA = math.norm(vecA);
    const magnitudeB = math.norm(vecB);
    return dotProduct / (magnitudeA * magnitudeB);
}

// Function to find the most relevant text chunks
async function findRelevantTextChunks(questionEmbedding, threshold = 0.5) {
    const db = client.db("embedding_db");
    const collection = db.collection("document_embeddings");

    try {
        const cursor = collection.find();
        const relevantChunks = [];

        await cursor.forEach(doc => {
            const similarity = cosineSimilarity(questionEmbedding, doc.embedding);
            if (similarity > threshold) {
                relevantChunks.push(doc.text_chunk);
            }
        });

        return relevantChunks;
    } catch (error) {
        console.error("Error finding relevant text chunks:", error);
        return [];
    }
}

// Route to ask questions using stored embeddings
app.post("/ask", async (req, res) => {
    const { question } = req.body;

    if (!question) {
        return res.status(400).json({ error: "Missing question" });
    }

    try {
        // Generate embedding for the question
        const questionEmbedding = await generateQuestionEmbedding(question);
        console.log("Question embedding:", questionEmbedding);

        if (!questionEmbedding) {
            return res.status(500).json({ error: "Failed to generate question embedding" });
        }

        // Find relevant text chunks from MongoDB
        const relevantChunks = await findRelevantTextChunks(questionEmbedding);
        console.log("Relevant chunks:", relevantChunks);

        if (relevantChunks.length === 0) {
            return res.status(404).json({ error: "No relevant information found" });
        }

        // Combine relevant chunks into a single context
        const context = relevantChunks.join("\n\n");
        console.log("Context:", context);

        // Ask Ollama the question with the context
        const prompt = `Based on the following context, answer the question: \n\n Context: ${context} \n\n Question: ${question}`;
        const answer = await askOllama(prompt);

        res.json({ answer });
    } catch (error) {
        res.status(500).json({ error: "Error processing question" });
    }
});

// Start the server and connect to MongoDB
app.listen(port, async () => {
    await connectToMongo();
    console.log(`Server running at http://localhost:${port}`);
});