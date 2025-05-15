import React, { useState } from 'react';
import './Sidebar.css'; // Make sure to add the new CSS for the filter components

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
  const [showFilterPopup, setShowFilterPopup] = useState(false);
  const [showAddFilter, setShowAddFilter] = useState(false);
  const [filterInput, setFilterInput] = useState('');
  const [filters, setFilters] = useState([]);

  const handleAddFilterClick = () => {
    setShowAddFilter(true);
  };

  const handleSaveFilter = () => {
    if (filterInput.trim()) {
      setFilters([...filters, filterInput]);
      setFilterInput('');
      setShowAddFilter(false);
    }
  };

  const handleCreateFilteredChat = () => {
    if (filters.length > 0) {
      // Create a new filtered chat
      const newChat = {
        id: Date.now(),
        title: 'Filtered Chat',
        isActive: true,
        file: null,
        isFiltered: true,
        filters: [...filters]
      };
      
      // Call the onCreateNewChat function with the filtered chat
      onCreateNewChat(newChat);
      
      // Reset the filter state
      setFilters([]);
      setShowFilterPopup(false);
    }
  };

  const removeFilter = (index) => {
    setFilters(filters.filter((_, i) => i !== index));
  };

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
      
      {/* Add Filter Button */}
      <div className="filter-section">
        <button 
          className="add-filter-btn"
          onClick={() => setShowFilterPopup(true)}
        >
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path fill="currentColor" d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"/>
          </svg>
          <span>Add Filter</span>
        </button>
      </div>

      {/* Filter Popup */}
      {showFilterPopup && (
        <div className="filter-popup">
          <div className="filter-popup-header">
            <h3>Document Filters</h3>
            <button 
              className="close-popup"
              onClick={() => {
                setShowFilterPopup(false);
                setShowAddFilter(false);
                setFilters([]);
              }}
            >
              <svg viewBox="0 0 24 24" width="16" height="16">
                <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"></path>
              </svg>
            </button>
          </div>
          
          <div className="filters-list">
            {filters.length === 0 && !showAddFilter ? (
              <p className="no-filters">No current filters</p>
            ) : (
              filters.map((filter, index) => (
                <div key={index} className="filter-item">
                  <span>{filter}</span>
                  <button 
                    className="remove-filter"
                    onClick={() => removeFilter(index)}
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14">
                      <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"></path>
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>

          {showAddFilter ? (
            <div className="add-filter-form">
              <input
                type="text"
                value={filterInput}
                onChange={(e) => setFilterInput(e.target.value)}
                placeholder="Enter filter text..."
                autoFocus
              />
              <div className="filter-form-buttons">
                <button 
                  className="cancel-filter"
                  onClick={() => {
                    setShowAddFilter(false);
                    setFilterInput('');
                  }}
                >
                  Cancel
                </button>
                <button 
                  className="save-filter"
                  onClick={handleSaveFilter}
                  disabled={!filterInput.trim()}
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <button 
              className="add-filter-in-popup"
              onClick={handleAddFilterClick}
            >
              <svg viewBox="0 0 24 24" width="16" height="16">
                <path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"></path>
              </svg>
              Add Filter
            </button>
          )}

          {filters.length > 0 && (
            <button 
              className="create-filtered-chat"
              onClick={handleCreateFilteredChat}
            >
              Create Filtered Chat
            </button>
          )}
        </div>
      )}

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