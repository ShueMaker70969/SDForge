// shortcuts_panel.js
// Handles the collapsible shortcuts panel UI

export class ShortcutsPanel {
  constructor() {
    this.panel = null;
    this._buildPanel();
  }

  _buildPanel() {
    const shortcutsPanel = document.createElement("div");
    shortcutsPanel.className = "shortcuts-panel";
    shortcutsPanel.style.position = "fixed";
    shortcutsPanel.style.bottom = "20px";
    shortcutsPanel.style.left = "20px";
    shortcutsPanel.style.minWidth = "200px";
    shortcutsPanel.style.maxWidth = "400px";
    shortcutsPanel.style.zIndex = "10000";
    shortcutsPanel.style.pointerEvents = "auto";
    shortcutsPanel.style.minHeight = "40px"; // Ensure header is always visible
    shortcutsPanel.style.color = "white"; 
    shortcutsPanel.style.fontFamily = "sans-serif"; 
    shortcutsPanel.style.background = "rgba(0, 0, 0, 0.2)"; 
    shortcutsPanel.style.backdropFilter = "blur(5px)"; 
    shortcutsPanel.style.borderRadius = "8px";
    shortcutsPanel.style.border = "1px solid rgba(255, 255, 255, 0.2)"; 

    // Header (clickable to toggle)
    const header = document.createElement("div");
    header.className = "shortcuts-header";
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";
    header.style.cursor = "pointer";
    header.style.padding = "14px 24px";
    header.style.borderBottom = "1px solid rgba(255, 255, 255, 0.2)";
    header.style.userSelect = "none";
    header.style.color = "white"; 
    header.style.fontFamily = "sans-serif"; 

    const headerText = document.createElement("span");
    headerText.textContent = "Shortcuts";
    headerText.style.fontWeight = "600";
    headerText.style.fontSize = "13px";
    headerText.style.color = "white"; 
    headerText.style.fontFamily = "sans-serif"; 

    const toggleIcon = document.createElement("span");
    toggleIcon.textContent = "▲";
    toggleIcon.style.transition = "transform 0.2s";
    toggleIcon.style.fontSize = "12px";
    toggleIcon.style.color = "white"; 

    header.appendChild(headerText);
    header.appendChild(toggleIcon);

    // Content (collapsible)
    const content = document.createElement("div");
    content.className = "shortcuts-content";
    content.style.display = "none"; // Start collapsed
    content.style.padding = "8px 12px";
    content.style.maxHeight = "400px";
    content.style.overflowY = "auto";
    content.style.color = "white"; 
    content.style.fontFamily = "sans-serif"; 

    // Shortcuts data
    const shortcuts = {
      "Interaction": [
        { key: "Left click", action: "Select shape" },
        { key: "Shift + Left click", action: "Select multiple shapes" }
      ],
      "Shortcut Keys": [
        { key: "Shift + A", action: "Add shape to scene" },
        { key: "X", action: "Delete selected shape" },
        { key: "Shift + D", action: "Duplicate active shape" },
        { key: "G", action: "Enter translation mode" },
        { key: "R", action: "Enter rotation mode" },
        { key: "S", action: "Enter scale mode" },
        { key: "X, Y, Z", action: "Transform in selected axis", note: "(During transformation mode)" },
        { key: "Escape", action: "Exit transformation mode" }
      ]
    };

    // Build shortcut sections
    Object.entries(shortcuts).forEach(([sectionTitle, items]) => {
      const section = document.createElement("div");
      section.style.marginBottom = "12px";
      section.style.color = "white"; // Ensure section container has white text

      const sectionTitleEl = document.createElement("div");
      sectionTitleEl.textContent = sectionTitle;
      sectionTitleEl.style.fontWeight = "600";
      sectionTitleEl.style.fontSize = "12px";
      sectionTitleEl.style.marginBottom = "6px";
      sectionTitleEl.style.opacity = "0.9";
      sectionTitleEl.style.color = "white";
      sectionTitleEl.style.fontFamily = "sans-serif"; 
      section.appendChild(sectionTitleEl);

      items.forEach(item => {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "flex-start";
        row.style.marginBottom = "4px";
        row.style.fontSize = "11px";
        row.style.lineHeight = "1.4";
        row.style.color = "white"; // Ensure row container has white text

        const keyCol = document.createElement("div");
        keyCol.style.flexShrink = "0";
        keyCol.style.minWidth = "120px";
        keyCol.style.fontFamily = "monospace";
        keyCol.style.fontSize = "10px";
        keyCol.style.padding = "2px 6px";
        keyCol.style.backgroundColor = "rgba(255, 255, 255, 0.15)";
        keyCol.style.borderRadius = "3px";
        keyCol.style.marginRight = "18px";
        keyCol.style.color = "white"; 
        keyCol.textContent = item.key;

        const actionCol = document.createElement("div");
        actionCol.style.flex = "1";
        actionCol.style.opacity = "0.9";
        actionCol.style.color = "white"; 
        actionCol.style.fontFamily = "sans-serif"; 
        actionCol.innerHTML = item.action + (item.note ? `<br><span style="opacity:0.7;font-size:10px;color:white;font-family:sans-serif;">${item.note}</span>` : "");

        row.appendChild(keyCol);
        row.appendChild(actionCol);
        section.appendChild(row);
      });

      content.appendChild(section);
    });

    // Toggle functionality
    let isExpanded = false;
    header.addEventListener("click", () => {
      isExpanded = !isExpanded;
      content.style.display = isExpanded ? "block" : "none";
      toggleIcon.style.transform = isExpanded ? "rotate(180deg)" : "rotate(0deg)";
    });

    shortcutsPanel.appendChild(header);
    shortcutsPanel.appendChild(content);

    this.panel = shortcutsPanel;
    document.body.appendChild(shortcutsPanel);
  }
}
