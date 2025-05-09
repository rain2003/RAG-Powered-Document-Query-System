const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const cors = require("cors");
const fs = require("fs");
const { MongoClient } = require("mongodb");
const math = require("mathjs");
const { split } = require("sentence-splitter");
const path = require("path");

const app = express();
const port = process.env.PORT || 3001;

// Enhanced configuration
const config = {
  mongoUri: process.env.MONGO_URI || "mongodb+srv://fakerk23:gJVVTk4MduBfwWES@cluster0.9prcksg.mongodb.net/",
  dbName: "embedding_db",
  collectionName: "document_embeddings",
  ollamaEmbeddingModel: "mxbai-embed-large",
  ollamaLLMModel: "llama3.1",
  chunkSize: 200,
  similarityThreshold: 0.5,
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
    // await client.db(config.dbName)
    //   .collection(config.collectionName)
    //   .createIndex({ embedding: "2dsphere" });
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

// Route handlers with better validation and error handling
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

// Add this function right after the cosineSimilarity function
async function findRelevantTextChunks(questionEmbedding, threshold = config.similarityThreshold, topK = config.topKResults) {
  const collection = client.db(config.dbName).collection(config.collectionName);
  
  try {
      // First get more candidates than we need to account for threshold filtering
      const numCandidates = Math.max(100, topK * 5);  // Dynamic candidate count
      
      const pipeline = [
          {
              $vectorSearch: {
                  index: "vector_index",
                  path: "embedding",
                  queryVector: questionEmbedding,
                  numCandidates: numCandidates,
                  limit: numCandidates  // Get all candidates first
              }
          },
          {
              $project: {
                  text_chunk: 1,
                  similarity: { $meta: "vectorSearchScore" },
                  embedding: 1  // Keep embedding for optional verification
              }
          },
          {
              $match: {
                  similarity: { $gte: threshold }
              }
          },
          {
              $addFields: {
                  // Optional: Calculate exact cosine similarity for verification
                  exactSimilarity: {
                      $let: {
                          vars: {
                              dotProduct: { $reduce: {
                                  input: { $range: [0, { $size: "$embedding" }] },
                                  initialValue: 0,
                                  in: {
                                      $add: [
                                          "$$value",
                                          {
                                              $multiply: [
                                                  { $arrayElemAt: ["$embedding", "$$this"] },
                                                  { $arrayElemAt: [questionEmbedding, "$$this"] }
                                              ]
                                          }
                                      ]
                                  }
                              }},
                              normA: { $sqrt: { $reduce: {
                                  input: "$embedding",
                                  initialValue: 0,
                                  in: { $add: ["$$value", { $pow: ["$$this", 2] }] }
                              }}},
                              normB: { $sqrt: { $reduce: {
                                  input: questionEmbedding,
                                  initialValue: 0,
                                  in: { $add: ["$$value", { $pow: ["$$this", 2] }] }
                              }}}
                          },
                          in: {
                              $divide: [
                                  "$$dotProduct",
                                  { $multiply: ["$$normA", "$$normB"] }
                              ]
                          }
                      }
                  }
              }
          },
          {
              $sort: { similarity: -1 }  // Sort by similarity score descending
          },
          {
              $limit: topK  // Apply final limit after threshold filtering
          },
          {
              $project: {
                  text_chunk: 1,
                  similarity: 1,
                  // Include exactSimilarity in output if you want to verify
                  // scoreDiff: { $subtract: ["$exactSimilarity", "$similarity"] }
              }
          }
      ];

      const results = await collection.aggregate(pipeline).toArray();
      
      // Optional: Log if we're getting significantly fewer results than requested
      if (results.length < topK) {
          console.warn(`Only found ${results.length} chunks meeting similarity threshold (requested ${topK})`);
      }
      
      return results;
  } catch (error) {
      console.error("Vector search error:", error);
      throw error;
  }
}
// Also make sure the askOllama function is properly defined
async function askOllama(prompt, model = config.ollamaLLMModel) {
    try {
        const response = await fetch("http://localhost:11434/api/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: model,
                prompt: prompt,
                stream: false,
                options: {
                    temperature: 0.7,
                    top_p: 0.9
                }
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama API error: ${response.statusText}`);
        }

        const data = await response.json();
        return data.response;
    } catch (error) {
        console.error("Error asking Ollama:", error);
        throw error;
    }
}


app.post("/ask", async (req, res) => {
  try {
    const { question } = req.body;
    
    if (!question || typeof question !== "string" || question.trim().length === 0) {
      return res.status(400).json({ error: "Invalid question" });
    }

    const questionEmbedding = await generateEmbedding(question);
    const searchResults = await findRelevantTextChunks(
      questionEmbedding, 
      config.similarityThreshold, 
      config.topKResults
    );

    console.log("Search results:", searchResults);
    
    // If no results found at all
    if (searchResults.length === 0) {
      return res.json({ 
        answer: "I don't have any information about this.",
        relevantChunks: 0
      });
    }

    // Extract just the text chunks for the context
    const relevantChunks = searchResults.map(item => item.text_chunk);
    const averageSimilarity = searchResults.reduce((sum, item) => sum + item.similarity, 0) / searchResults.length;
    
    // If the average similarity is too low (even if some chunks were returned)
    if (averageSimilarity < config.similarityThreshold + 0.1) {
      return res.json({ 
        answer: "I don't have have any information about this.",
        relevantChunks: searchResults.length,
        averageSimilarity: averageSimilarity
      });
    }

    const context = relevantChunks.join("\n\n");
    const prompt = `Based on the following context, answer the question. If you can't answer from the context, say "I don't have information about this."\n\nContext:\n${context}\n\nQuestion: ${question}\n\nAnswer:`;
    
    const answer = await askOllama(prompt);

    res.json({ 
      answer,
      relevantChunks: searchResults.length,
      averageSimilarity: averageSimilarity
    });
  } catch (error) {
    console.error("Ask error:", error);
    res.status(500).json({ 
      error: "Error processing question",
      details: error.message 
    });
  }
});

// Start the server with proper shutdown handling
const server = app.listen(port, async () => {
  await connectToMongo();
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