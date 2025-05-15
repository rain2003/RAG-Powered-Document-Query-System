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
  const [chats, setChats] = useState([
    {
      id: Object.keys(chatHistories)[0],
      title: 'New Document Chat',
      isActive: true,
      file: null,
      isProcessingFile: false,
      isFiltered: false,
      filters: []
    }
  ]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileView, setIsMobileView] = useState(false);
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
    const activeChat = chats.find(chat => chat.isActive);
    if (!inputValue.trim() || !activeChat?.file || activeChat?.isFiltered) return;

    const newUserMessage = {
      id: Date.now(),
      content: inputValue,
      isUser: true
    };

    setChatHistories(prev => ({
      ...prev,
      [activeChat.id]: [...(prev[activeChat.id] || []), newUserMessage]
    }));

    setInputValue('');
    setIsLoading(true);

    try {
      const response = await fetch('http://localhost:3001/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ question: inputValue })
      });

      if (!response.ok) {
        const errorData = await response.json();
        let errorMessageContent = "Sorry, there was an error processing your question.";
        if (response.status === 404 && errorData.error === "No relevant information found") {
          errorMessageContent = `No relevant information found. Try rephrasing your question or upload more documents.`;
        }

        const errorMessage = {
          id: Date.now() + 1,
          content: errorMessageContent,
          isUser: false
        };

        setChatHistories(prev => ({
          ...prev,
          [activeChat.id]: [...(prev[activeChat.id] || []), errorMessage]
        }));
      } else {
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
      }
    } catch (error) {
      console.error("Error fetching answer:", error);
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

  const createNewChat = (filteredChat = null) => {
    const newChatId = Date.now();
    const newChat = filteredChat || {
      id: newChatId,
      title: `Document Chat ${chats.length + 1}`,
      isActive: true,
      file: null,
      isFiltered: false,
      filters: []
    };
    
    if (filteredChat) {
      setChats([newChat, ...chats.map(chat => ({ ...chat, isActive: false }))]);
    } else {
      setChats([...chats.map(chat => ({ ...chat, isActive: false })), newChat]);
    }
    
    setChatHistories(prev => ({
      ...prev,
      [newChat.id]: [{ 
        id: 1, 
        content: filteredChat ? 
          `This is a filtered chat. Upload a document to analyze with these specific filters:\n\n${filteredChat.filters.join('\n')}\n\nOnly document uploads are allowed in this chat.` : 
          'Upload a document to begin chatting', 
        isUser: false 
      }]
    }));
    
    if (isMobileView) setIsSidebarOpen(false);
  };

  const switchChat = (chatId) => {
    setChats(chats.map(chat => ({
      ...chat,
      isActive: chat.id === chatId
    })));
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
      const newHistories = { ...prev };
      delete newHistories[chatId];
      return newHistories;
    });
  };

  const handleFileUpload = async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const activeChat = chats.find(chat => chat.isActive);
  if (!activeChat) {
    return;
  }

  // Set isProcessingFile true for the current active chat
  setChats(prevChats =>
    prevChats.map(chat =>
      chat.id === activeChat.id ? { ...chat, isProcessingFile: true } : chat
    )
  );

  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('http://localhost:3001/upload', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error('File processing failed');
    }

    const data = await response.json();

    // Update the chat with the file information
    setChats(prevChats =>
      prevChats.map(chat =>
        chat.id === activeChat.id
          ? { ...chat, title: `Document: ${file.name}`, file: file, isProcessingFile: true }
          : chat
      )
    );

    let prompt;
    if (activeChat.isFiltered && activeChat.filters?.length > 0) {
      // Use the filters as the prompt for filtered chats
      prompt = `Please process this document with the following filters:\n${activeChat.filters.join('\n')}\n\nProvide a detailed analysis.`;
      
      // Call the ask-filter endpoint for filtered chats
      const summaryResponse = await fetch('http://localhost:3001/ask-filter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: prompt,
          filterQuestion: activeChat.filters.join('\n') // Pass filters separately
        })
      });

      if (!summaryResponse.ok) {
        throw new Error('Failed to generate filtered analysis');
      }

      const summaryData = await summaryResponse.json();

      const summaryMessage = {
        id: Date.now(),
        content: `Filtered Document Analysis:\n\n${summaryData.answer || "No analysis could be generated."}`,
        isUser: false
      };
      setChatHistories(prev => ({
        ...prev,
        [activeChat.id]: [...(prev[activeChat.id] || []).filter(msg =>
          !msg.content.includes('Upload a document to')
        ), summaryMessage]
      }));

    } else {
      // Default prompt for regular chats
      prompt = `Please provide a detailed summary of the document`;
      
      // Call the regular ask endpoint for non-filtered chats
      const summaryResponse = await fetch('http://localhost:3001/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: prompt
        })
      });

      if (!summaryResponse.ok) {
        throw new Error('Failed to generate summary');
      }

      const summaryData = await summaryResponse.json();

      const summaryMessage = {
        id: Date.now(),
        content: `Document Summary:\n\n${summaryData.answer || "No summary could be generated."}`,
        isUser: false
      };
      setChatHistories(prev => ({
        ...prev,
        [activeChat.id]: [...(prev[activeChat.id] || []).filter(msg =>
          !msg.content.includes('Upload a document to')
        ), summaryMessage]
      }));
    }

  } catch (error) {
    const errorMessage = {
      id: Date.now(),
      content: `Error: ${error.message}`,
      isUser: false
    };
    setChatHistories(prev => ({
      ...prev,
      [activeChat.id]: [...(prev[activeChat.id] || []).filter(msg =>
        !msg.content.includes('Upload a document to')
      ), errorMessage]
    }));
  } finally {
    // Set isProcessingFile false for the current active chat
    setChats(prevChats =>
      prevChats.map(chat =>
        chat.id === activeChat.id ? { ...chat, isProcessingFile: false } : chat
      )
    );
    // Reset file input to allow re-uploading the same file
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }
};

  const activeChat = chats.find(chat => chat.isActive);
  const activeChatHasFile = activeChat?.file !== null;
  const currentMessages = getCurrentMessages();
  const isCurrentChatProcessingFile = activeChat?.isProcessingFile || false;

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
              <div className="upload-box" onClick={() => !isCurrentChatProcessingFile && fileInputRef.current.click()}>
                {isCurrentChatProcessingFile ? (
                  <>
                    <div className="processing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                    <h3>Processing Document...</h3>
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
                  disabled={isCurrentChatProcessingFile}
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
                      {message.content.split('\n').map((line, index) => (
                        <React.Fragment key={index}>
                          {line}
                          <br />
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
                {(isLoading || isCurrentChatProcessingFile) && (
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

              {activeChat?.isFiltered ? (
                <div className="input-area">
                  <div className="input-container filtered">
                    <button
                      type="button"
                      className="file-upload-btn"
                      onClick={() => fileInputRef.current.click()}
                      disabled={isCurrentChatProcessingFile}
                    >
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <path fill="currentColor" d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"></path>
                      </svg>
                    </button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      style={{ display: 'none' }}
                      disabled={isCurrentChatProcessingFile}
                    />
                  </div>
                </div>
              ) : (
                <form className="input-area" onSubmit={handleSubmit}>
                  <div className="input-container">
                    <button
                      type="button"
                      className="file-upload-btn"
                      onClick={() => fileInputRef.current.click()}
                      disabled={isCurrentChatProcessingFile || isLoading}
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
                      disabled={isLoading || isCurrentChatProcessingFile}
                    />
                    <button type="submit" disabled={isLoading || !inputValue.trim() || isCurrentChatProcessingFile}>
                      <svg viewBox="0 0 24 24" width="24" height="24">
                        <path fill="currentColor" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path>
                      </svg>
                    </button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      style={{ display: 'none' }}
                      disabled={isCurrentChatProcessingFile}
                    />
                  </div>
                  <div className="disclaimer">
                    Document analysis may contain errors. Verify important information.
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;