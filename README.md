# RAG-Powered Document Query System 🤖📄

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18+-61DAFB?style=flat&logo=react&logoColor=black)](https://reactjs.org/)
[![Google Gemini](https://img.shields.io/badge/Google_Gemini-8E75B2?style=flat&logo=googlegemini&logoColor=white)](https://deepmind.google/technologies/gemini/)
[![Ollama](https://img.shields.io/badge/Ollama_Embeddings-000000?style=flat&logo=ollama&logoColor=white)](https://ollama.ai/)
[![VectorDB](https://img.shields.io/badge/VectorDB-ChromaDB-orange?style=flat)](https://www.trychroma.com/)

An advanced AI-driven application that enables users to interact with their documents through natural language. By leveraging **Retrieval-Augmented Generation (RAG)**, the system provides precise, context-aware answers based specifically on the uploaded content, bridging the gap between static files and interactive insights.

---

## 🚀 Key Features

*   **Intelligent Document Ingestion:** Seamlessly upload and process PDF documents for real-time querying.
*   **Context-Aware Querying:** Utilizes RAG architecture to ensure responses are grounded in the provided document's facts, effectively minimizing AI hallucinations.
*   **Semantic Vector Search:** Implements high-performance vector embeddings to retrieve the most relevant document segments in milliseconds.
*   **Streamlined UI:** A clean, intuitive interface designed for smooth conversation flow and clear source-backed answers.
*   **Advanced Text Chunking:** Optimized recursive character splitting to ensure the LLM receives the most relevant context without losing meaning.

---

## 🛠️ Tech Stack

### **Backend & AI Architecture**
*   **Python:** Core logic and processing.
*   **LangChain:** Orchestration of the RAG pipeline and LLM chains.
*   **OpenAI / HuggingFace:** Powering the Large Language Model and embedding generation.
*   **ChromaDB / FAISS:** Vector database for efficient semantic storage and retrieval.

### **Frontend**
*   **Streamlit:** For a responsive, interactive, and easy-to-deploy web interface.

---

## 💻 Installation & Setup

### 1. Clone the Repository
```bash
git clone https://github.com/rain2003/RAG-Powered-Document-Query-System.git
cd RAG-Powered-Document-Query-System
```

### 2. Set Up a Virtual Environment
Windows:
```bash
python -m venv venv
venv\Scripts\activate
```
Macos/Linux:
```bash
python3 -m venv venv
source venv/bin/activate
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Run the Backend and Frontend
```bash
node index.js
npm start
```


