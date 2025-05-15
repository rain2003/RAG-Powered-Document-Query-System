const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const cors = require("cors");
const fs = require("fs");
const { MongoClient } = require("mongodb");
const math = require("mathjs");
const { split } = require("sentence-splitter");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const app = express();
const port = process.env.PORT || 3001;

// Enhanced configuration
const config = {
    mongoUri: process.env.MONGO_URI || "mongodb://localhost:27017",
    dbName: "embedding_db",
    collectionName: "document_embeddings",
    ollamaEmbeddingModel: "mxbai-embed-large",
    geminiModel: "gemini-2.0-flash", // or "gemini-2.0-flash" when available
    chunkSize: 200,
    similarityThreshold: 0.4,
    topKResults: 5,
    uploadDir: "uploads"
};

// Middleware setup
app.use(express.json());
app.use(cors());
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: "Internal server error" });
});

const chatSchema = {
  chatId: { type: String, required: true },
  title: { type: String, required: true },
  fileId: { type: String }, // Reference to file embeddings if needed
  messages: [{
    id: { type: String, required: true },
    content: { type: String, required: true },
    isUser: { type: Boolean, required: true },
    timestamp: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
};


async function setupChatCollection() {
  const db = client.db(config.dbName);
  try {
    await db.createCollection("chat_histories");
    await db.collection("chat_histories").createIndex({ chatId: 1 }, { unique: true });
    console.log("Chat histories collection ready");
  } catch (error) {
    if (error.codeName === 'NamespaceExists') {
      console.log("Chat histories collection already exists");
    } else {
      throw error;
    }
  }
}

// Initialize Gemini
const genAI = new GoogleGenerativeAI("AIzaSyAUkHSHhDnbN-X-yK0AAAMgJ_0_xIkhDlI"); // Use environment variable in production

// Ensure upload directory exists
if (!fs.existsSync(config.uploadDir)) {
    fs.mkdirSync(config.uploadDir, { recursive: true });
}

const upload = multer({ 
    dest: config.uploadDir,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
        files: 1
    },
    fileFilter: (req, file, cb) => {
        if (path.extname(file.originalname).toLowerCase() !== '.pdf') {
            return cb(new Error('Only PDF files are allowed'));
        }
        cb(null, true);
    }
});

// MongoDB connection with retry logic
const client = new MongoClient(config.mongoUri, {
    connectTimeoutMS: 5000,
    socketTimeoutMS: 30000,
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: 50
});

async function connectToMongo() {
    try {
        await client.connect();
        console.log("Connected to MongoDB");
        // Create index for faster similarity searches
        await client.db(config.dbName)
            .collection(config.collectionName)
            .createIndex({ embedding: "2dsphere" });
    } catch (error) {
        console.error("Error connecting to MongoDB:", error);
        // Implement retry logic or exit process in production
        process.exit(1);
    }
}

// Enhanced cosine similarity with validation
function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) {
        throw new Error("Vectors must be of equal length");
    }

    const dotProduct = math.dot(vecA, vecB);
    const magnitudeA = math.norm(vecA);
    const magnitudeB = math.norm(vecB);

    if (magnitudeA === 0 || magnitudeB === 0) {
        return 0; // Avoid division by zero
    }

    return dotProduct / (magnitudeA * magnitudeB);
}

// Improved text chunking with sentence boundaries
function splitTextIntoChunks(text, maxTokens = config.chunkSize) {
    try {
        const sentences = split(text)
            .filter(e => e.type === "Sentence")
            .map(s => s.raw.trim())
            .filter(s => s.length > 0);

        const chunks = [];
        let currentChunk = "";

        for (const sentence of sentences) {
            if ((currentChunk.length + sentence.length) > maxTokens && currentChunk.length > 0) {
                chunks.push(currentChunk);
                currentChunk = sentence;
            } else {
                currentChunk += (currentChunk.length > 0 ? " " : "") + sentence;
            }
        }

        if (currentChunk.length > 0) {
            chunks.push(currentChunk);
        }

        return chunks;
    } catch (error) {
        console.error("Error splitting text:", error);
        // Fallback to simple splitting if sentence parsing fails
        return text.match(new RegExp(`.{1,${maxTokens}}`, "g")) || [];
    }
}

// Enhanced embedding generation with retries
async function generateEmbedding(text, retries = 3) {
    if (!text || typeof text !== "string") {
        throw new Error("Invalid text input");
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await fetch("http://localhost:11434/api/embeddings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: config.ollamaEmbeddingModel,
                    prompt: text
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            if (!data.embedding || !Array.isArray(data.embedding)) {
                throw new Error("Invalid embedding received");
            }

            return data.embedding;
        } catch (error) {
            if (attempt === retries) {
                console.error(`Embedding generation failed after ${retries} attempts:`, error);
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
    }
}

// Improved document processing with cleanup
async function processDocument(filePath) {
    try {
        const fileBuffer = fs.readFileSync(filePath);
        const pdfData = await pdfParse(fileBuffer);
        return pdfData.text;
    } finally {
        try {
            fs.unlinkSync(filePath);
        } catch (cleanupError) {
            console.error("Error cleaning up file:", cleanupError);
        }
    }
}

// Enhanced storage with bulk operations
async function storeEmbeddings(chunks, embeddings) {
    if (chunks.length !== embeddings.length) {
        throw new Error("Chunks and embeddings must be of equal length");
    }

    const db = client.db(config.dbName);
    const collection = db.collection(config.collectionName);

    const operations = chunks.map((chunk, index) => ({
        text_chunk: chunk,
        embedding: embeddings[index],
        timestamp: new Date()
    }));

    try {
        const result = await collection.insertMany(operations);
        console.log(`Stored ${result.insertedCount} embeddings`);
        return result;
    } catch (error) {
        console.error("Error storing embeddings:", error);
        throw error;
    }
}

async function findRelevantTextChunks(questionEmbedding, threshold = config.similarityThreshold, topK = config.topKResults) {
    const db = client.db(config.dbName);
    const collection = db.collection(config.collectionName);

    try {
        const cursor = collection.find();
        const scoredChunks = [];

        await cursor.forEach(doc => {
            try {
                if (!doc.embedding || !Array.isArray(doc.embedding)) {
                    console.warn("Document missing valid embedding array");
                    return;
                }

                const similarity = cosineSimilarity(questionEmbedding, doc.embedding);
                if (similarity > threshold) {
                    scoredChunks.push({
                        text: doc.text_chunk,
                        similarity: similarity,
                        chunkId: doc._id
                    });
                }
            } catch (e) {
                console.error("Error processing document:", e);
            }
        });

        // Sort by similarity (descending) and return top K results
        scoredChunks.sort((a, b) => b.similarity - a.similarity);
        
        return scoredChunks.slice(0, topK).map(item => item.text);
    } catch (error) {
        console.error("Error in findRelevantTextChunks:", error);
        throw error;
    }
}

async function askGemini(prompt, model = config.geminiModel) {
    try {
        const genModel = genAI.getGenerativeModel({ 
            model: model,
            generationConfig: {
                temperature: 0.7,
                topP: 0.9,
                maxOutputTokens: 2000
            }
        });

        const result = await genModel.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error("Error asking Gemini:", error);
        throw error;
    }
}

app.post("/upload", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        const text = await processDocument(req.file.path);
        const chunks = splitTextIntoChunks(text);
        
        // Generate embeddings in parallel with rate limiting
        const embeddingPromises = chunks.map(chunk => generateEmbedding(chunk));
        const embeddings = await Promise.all(embeddingPromises);

        await storeEmbeddings(chunks, embeddings.filter(e => e !== null));

        res.json({ 
            message: "File processed successfully",
            chunksProcessed: chunks.length,
            embeddingsStored: embeddings.filter(e => e !== null).length
        });
    } catch (error) {
        console.error("Upload error:", error);
        res.status(500).json({ 
            error: "Error processing file",
            details: error.message 
        });
    }
});

app.post("/ask", async (req, res) => {
    try {
        const { question } = req.body;
        
        if (!question || typeof question !== "string" || question.trim().length === 0) {
            return res.status(400).json({ error: "Invalid question" });
        }

        const questionEmbedding = await generateEmbedding(question);
        const relevantChunks = await findRelevantTextChunks(
            questionEmbedding, 
            config.similarityThreshold, 
            config.topKResults
        );

        if (relevantChunks.length === 0) {
            return res.status(404).json({ 
                error: "No relevant information found",
                suggestion: "Try rephrasing your question or upload more documents"
            });
        }
        console.log(relevantChunks);
        const context = relevantChunks.join("\n\n");
        const prompt = `
            Context:
            ${context}

            Instruction: Provide a detailed, comprehensive answer to the question below. 
            Include relevant examples from the context when possible. 
            Break down complex concepts into simpler terms.
            Aim for 7-8 sentences minimum.

            Question: ${question}

            If the question is not clearly related to the context or cannot be answered using the given information, 
            respond with: "The question appears to be irrelevant or unrelated to the provided context."

            Answer in paragraph form:`;
        
        const answer = await askGemini(prompt);

        res.json({ 
            answer,
            relevantChunks: relevantChunks.length,
            contextLength: context.length
        });
    } catch (error) {
        console.error("Ask error:", error);
        res.status(500).json({ 
            error: "Error processing question",
            details: error.message 
        });
    }
});

app.post("/ask-filter", async (req, res) => {
    try {
        const { question, filterQuestion } = req.body;
        
        if (!question || typeof question !== "string" || question.trim().length === 0) {
            return res.status(400).json({ error: "Invalid question" });
        }

        const questionEmbedding = await generateEmbedding(question);
        const relevantChunks = await findRelevantTextChunks(
            questionEmbedding, 
            config.similarityThreshold, 
            config.topKResults
        );

        if (relevantChunks.length === 0) {
            return res.status(404).json({ 
                error: "No relevant information found",
                suggestion: "Try rephrasing your question or upload more documents"
            });
        }

        const context = relevantChunks.join("\n\n");
        const prompt = `
            Specialization Filters:
            ${filterQuestion}

            Context:
            ${context}

            Instruction: 
            You are operating under specific specialization filters. 
            Provide a detailed analysis that strictly adheres to these filters.
            Use domain-specific terminology and examples where appropriate.
            If the question cannot be answered within these filters, explain why.

            Question: ${question}

            Filtered Analysis:`;
        
        const answer = await askGemini(prompt);

        res.json({ 
            answer,
            relevantChunks: relevantChunks.length,
            contextLength: context.length
        });
    } catch (error) {
        console.error("Ask-filter error:", error);
        res.status(500).json({ 
            error: "Error processing filtered question",
            details: error.message 
        });
    }
});


app.post("/api/chats", async (req, res) => {
  try {
    const { title } = req.body;
    const chatId = Date.now().toString();
    const db = client.db(config.dbName);
    
    const newChat = {
      chatId,
      title: title || `Document Chat ${chatId}`,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await db.collection("chat_histories").insertOne(newChat);
    res.status(201).json(newChat);
  } catch (error) {
    console.error("Error creating chat:", error);
    res.status(500).json({ error: "Failed to create chat" });
  }
});

app.get("/api/chats", async (req, res) => {
  try {
    const db = client.db(config.dbName);
    const chats = await db.collection("chat_histories")
      .find({}, { projection: { chatId: 1, title: 1, createdAt: 1, updatedAt: 1 } })
      .sort({ updatedAt: -1 })
      .toArray();
    res.json(chats);
  } catch (error) {
    console.error("Error fetching chats:", error);
    res.status(500).json({ error: "Failed to fetch chats" });
  }
});

app.get("/api/chats/:chatId", async (req, res) => {
  try {
    const { chatId } = req.params;
    const db = client.db(config.dbName);
    const chat = await db.collection("chat_histories").findOne({ chatId });
    
    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }
    
    res.json(chat);
  } catch (error) {
    console.error("Error fetching chat:", error);
    res.status(500).json({ error: "Failed to fetch chat" });
  }
});

app.post("/api/chats/:chatId/messages", async (req, res) => {
  try {
    const { chatId } = req.params;
    const { id, content, isUser } = req.body;
    
    if (!id || !content || typeof isUser !== 'boolean') {
      return res.status(400).json({ error: "Invalid message data" });
    }

    const db = client.db(config.dbName);
    const message = {
      id,
      content,
      isUser,
      timestamp: new Date()
    };

    const result = await db.collection("chat_histories").updateOne(
      { chatId },
      { 
        $push: { messages: message },
        $set: { updatedAt: new Date() }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Chat not found" });
    }

    res.status(201).json(message);
  } catch (error) {
    console.error("Error adding message:", error);
    res.status(500).json({ error: "Failed to add message" });
  }
});

app.delete("/api/chats/:chatId", async (req, res) => {
  try {
    const { chatId } = req.params;
    const db = client.db(config.dbName);
    const result = await db.collection("chat_histories").deleteOne({ chatId });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Chat not found" });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting chat:", error);
    res.status(500).json({ error: "Failed to delete chat" });
  }
});

// Update server startup to include chat collection setup
const server = app.listen(port, async () => {
  await connectToMongo();
  await setupChatCollection();
  console.log(`Server running at http://localhost:${port}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
    console.log("SIGTERM received. Shutting down gracefully...");
    server.close(() => {
        client.close().then(() => {
            console.log("Server and MongoDB connection closed");
            process.exit(0);
        });
    });
});

process.on("SIGINT", () => {
    console.log("SIGINT received. Shutting down gracefully...");
    server.close(() => {
        client.close().then(() => {
            console.log("Server and MongoDB connection closed");
            process.exit(0);
        });
    });
});