// ui_options.js

export class UIOptions {
  constructor() {
    this.darkMode = false;
    this.invertY = false;

    this._buildUI();
  }

  _buildUI() {
    const panel = document.createElement("div");
    panel.className = "ui-panel";

    // Dark mode
    const darkLabel = document.createElement("label");
    const darkCheckbox = document.createElement("input");
    darkCheckbox.type = "checkbox";

    darkCheckbox.addEventListener("change", () => {
      this.darkMode = darkCheckbox.checked;
      document.body.classList.toggle("dark", this.darkMode);
    });

    darkLabel.append(darkCheckbox, " Dark mode");

    // Invert Y
    const invertLabel = document.createElement("label");
    const invertCheckbox = document.createElement("input");
    invertCheckbox.type = "checkbox";

    invertCheckbox.addEventListener("change", () => {
      this.invertY = invertCheckbox.checked;
    });

    invertLabel.append(invertCheckbox, " Invert Y rotation");

    panel.append(darkLabel, invertLabel);
    document.body.appendChild(panel);
  }
}
