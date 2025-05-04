const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const cors = require("cors");
const fs = require("fs");

const app = express();
const port = 3000;

app.use(express.json());
app.use(cors());


let extracted;
const upload = multer({ dest: "uploads/" });

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

// Route to upload a PDF and extract text
app.post("/upload", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        const fileBuffer = fs.readFileSync(req.file.path);
        const pdfData = await pdfParse(fileBuffer);
        const extractedText = pdfData.text;
        const ollamaResponse = await askOllama(`Summarize this document:\n\n${extractedText}`);
        extracted = extractedText;
        res.json({
            message: "File processed successfully",
            summary: ollamaResponse
        });
        fs.unlinkSync(req.file.path);
    } catch (error) {
        res.status(500).json({ error: "Error processing file" });
    }
});

// Route to ask questions on extracted text
app.post("/ask", async (req, res) => {
    const { question } = req.body;

    if (!question || !extracted) {
        return res.status(400).json({ error: "Missing question or document text" });
    }

    const prompt = `Based on the following document, answer the question: \n\n Document: ${extracted} \n\n Question: ${question}`;
    const answer = await askOllama(prompt);

    res.json({ answer });
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
