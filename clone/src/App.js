import React, { useState, useRef, useEffect } from 'react';
import Sidebar from './Sidebar';
import './App.css';
import './Sidebar.css';

function App() {
  const [chatHistories, setChatHistories] = useState({
    [Date.now()]: [{ id: 1, content: 'Upload a document to begin chatting', isUser: false }]
  });
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [chats, setChats] = useState([
    { id: Object.keys(chatHistories)[0], title: 'New Document Chat', isActive: true, hasFile: false }
  ]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileView, setIsMobileView] = useState(false);
  const [currentFile, setCurrentFile] = useState(null);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const handleResize = () => {
      setIsMobileView(window.innerWidth < 768);
      if (window.innerWidth >= 768) {
        setIsSidebarOpen(true);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const getCurrentMessages = () => {
    const activeChat = chats.find(chat => chat.isActive);
    return activeChat ? chatHistories[activeChat.id] || [] : [];
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistories, chats]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputValue.trim() || !currentFile) return;

    const activeChat = chats.find(chat => chat.isActive);
    if (!activeChat) return;

    const newUserMessage = { 
      id: Date.now(), 
      content: inputValue, 
      isUser: true 
    };

    // Update messages for current chat
    setChatHistories(prev => ({
      ...prev,
      [activeChat.id]: [...(prev[activeChat.id] || []), newUserMessage]
    }));
    
    setInputValue('');
    setIsLoading(true);

    try {
      // Call your /ask API endpoint
      const response = await fetch('http://localhost:3001/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ question: inputValue })
      });

      if (!response.ok) {
        throw new Error('Failed to get answer');
      }

      const data = await response.json();
      
      const botMessage = { 
        id: Date.now() + 1, 
        content: data.answer || "I couldn't find an answer to that question.", 
        isUser: false 
      };
      
      setChatHistories(prev => ({
        ...prev,
        [activeChat.id]: [...(prev[activeChat.id] || []), botMessage]
      }));
    } catch (error) {
      const errorMessage = { 
        id: Date.now() + 1, 
        content: "Sorry, there was an error processing your question.", 
        isUser: false 
      };
      
      setChatHistories(prev => ({
        ...prev,
        [activeChat.id]: [...(prev[activeChat.id] || []), errorMessage]
      }));
    } finally {
      setIsLoading(false);
    }
  };

  const createNewChat = () => {
    const newChatId = Date.now();
    const newChat = {
      id: newChatId,
      title: `Document Chat ${chats.length + 1}`,
      isActive: true,
      hasFile: false
    };
    
    setChats(chats.map(chat => ({ ...chat, isActive: false })).concat(newChat));
    setChatHistories(prev => ({
      ...prev,
      [newChatId]: [{ id: 1, content: 'Upload a document to begin chatting', isUser: false }]
    }));
    setCurrentFile(null);
    if (isMobileView) setIsSidebarOpen(false);
  };

  const switchChat = (chatId) => {
    setChats(chats.map(chat => ({
      ...chat,
      isActive: chat.id === chatId
    })));
    
    const newActiveChat = chats.find(chat => chat.id === chatId);
    setCurrentFile(newActiveChat?.hasFile ? currentFile : null);
    
    if (isMobileView) setIsSidebarOpen(false);
  };

  const deleteChat = (chatId) => {
    if (chats.length <= 1) return;
    
    const newChats = chats.filter(chat => chat.id !== chatId);
    const wasActive = chats.find(chat => chat.id === chatId)?.isActive;
    
    setChats(newChats.map((chat, index) => ({
      ...chat,
      isActive: wasActive ? (index === 0 ? true : false) : chat.isActive
    })));
    
    setChatHistories(prev => {
      const newHistories = {...prev};
      delete newHistories[chatId];
      return newHistories;
    });
    
    if (wasActive) {
      setCurrentFile(null);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsProcessingFile(true);
    setCurrentFile(file);
    
    const activeChat = chats.find(chat => chat.isActive);
    if (!activeChat) return;

    try {
      const formData = new FormData();
      formData.append('file', file);

      // Call your /upload API endpoint
      const response = await fetch('http://localhost:3001/upload', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('File processing failed');
      }

      const data = await response.json();
      
      // Update chat title and state
      setChats(chats.map(chat => 
        chat.id === activeChat.id 
          ? { ...chat, title: `Document: ${file.name}`, hasFile: true } 
          : chat
      ));
      
      // Add success message
      setChatHistories(prev => ({
        ...prev,
        [activeChat.id]: [
          { 
            id: Date.now(), 
            content: `Document "${file.name}" has been successfully processed. You can now ask questions about it.`, 
            isUser: false 
          }
        ]
      }));
    } catch (error) {
      setChatHistories(prev => ({
        ...prev,
        [activeChat.id]: [
          { 
            id: Date.now(), 
            content: `Error processing document: ${error.message}`, 
            isUser: false 
          }
        ]
      }));
      setCurrentFile(null);
    } finally {
      setIsProcessingFile(false);
    }
  };

  const activeChat = chats.find(chat => chat.isActive);
  const activeChatHasFile = activeChat?.hasFile || currentFile;
  const currentMessages = getCurrentMessages();

  return (
    <div className="app">
      <Sidebar
        chats={chats}
        activeChatId={activeChat?.id}
        onCreateNewChat={createNewChat}
        onSelectChat={switchChat}
        onDeleteChat={deleteChat}
        isSidebarOpen={isSidebarOpen}
        onCloseSidebar={() => setIsSidebarOpen(false)}
        isMobileView={isMobileView}
      />

      <div className="main-content">
        <header className="header">
          {!isSidebarOpen && (
            <button className="menu-btn" onClick={() => setIsSidebarOpen(true)}>
              <svg viewBox="0 0 24 24" width="24" height="24">
                <path fill="currentColor" d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"></path>
              </svg>
            </button>
          )}
          <div className="header-title">Document Query System</div>
          <div className="header-subtitle">Upload and analyze your documents</div>
        </header>

        <div className="chat-container">
          {!activeChatHasFile ? (
            <div className="upload-container">
              <div className="upload-box" onClick={() => !isProcessingFile && fileInputRef.current.click()}>
                {isProcessingFile ? (
                  <>
                    <div className="processing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                    <h3>Processing Document...</h3>
                    <p>Please wait while we analyze your file</p>
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" width="48" height="48">
                      <path fill="#4a6fa5" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"></path>
                    </svg>
                    <h3>Upload a Document</h3>
                    <p>Drag & drop a file here, or click to browse</p>
                  </>
                )}
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload}
                  style={{ display: 'none' }} 
                  disabled={isProcessingFile}
                />
              </div>
            </div>
          ) : (
            <>
              <div className="messages">
                {currentMessages.map((message) => (
                  <div 
                    key={message.id} 
                    className={`message ${message.isUser ? 'user-message' : 'bot-message'}`}
                  >
                    <div className="message-content">
                      {message.content}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="message bot-message">
                    <div className="message-content typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <form className="input-area" onSubmit={handleSubmit}>
                <div className="input-container">
                  <button 
                    type="button" 
                    className="file-upload-btn"
                    onClick={() => fileInputRef.current.click()}
                  >
                    <svg viewBox="0 0 24 24" width="24" height="24">
                      <path fill="currentColor" d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"></path>
                    </svg>
                  </button>
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Ask about your document..."
                    disabled={isLoading || isProcessingFile}
                  />
                  <button type="submit" disabled={isLoading || !inputValue.trim() || isProcessingFile}>
                    <svg viewBox="0 0 24 24" width="24" height="24">
                      <path fill="currentColor" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path>
                    </svg>
                  </button>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileUpload}
                    style={{ display: 'none' }} 
                    disabled={isProcessingFile}
                  />
                </div>
                <div className="disclaimer">
                  Document analysis may contain errors. Verify important information.
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;