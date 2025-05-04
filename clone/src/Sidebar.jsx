import React from 'react';

const Sidebar = ({ 
  chats, 
  activeChatId,
  onCreateNewChat, 
  onSelectChat, 
  onDeleteChat,
  isSidebarOpen,
  onCloseSidebar,
  isMobileView
}) => {
  return (
    <div className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
      <div className="sidebar-header">
        <button className="new-chat-btn" onClick={onCreateNewChat}>
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"></path>
          </svg>
          <span>New Chat</span>
        </button>
        {isMobileView && (
          <button className="close-sidebar" onClick={onCloseSidebar}>
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"></path>
            </svg>
          </button>
        )}
      </div>
      <div className="chat-history">
        {chats.map(chat => (
          <div 
            key={chat.id} 
            className={`chat-item ${chat.id === activeChatId ? 'active' : ''}`}
            onClick={() => onSelectChat(chat.id)}
          >
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path fill="currentColor" d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"></path>
            </svg>
            <span className="chat-title">{chat.title}</span>
            <button 
              className="delete-chat-btn"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteChat(chat.id);
              }}
            >
              <svg viewBox="0 0 24 24" width="16" height="16">
                <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"></path>
              </svg>
            </button>
          </div>
        ))}
      </div>
      <div className="sidebar-footer">
        <div className="user-profile">
          <div className="avatar">U</div>
          <span>User</span>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;