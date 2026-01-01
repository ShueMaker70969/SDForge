// ui_options.js
export class UIOptions {
  constructor() {
    this.darkMode = false;
    this.invertY = false;

    // callbacks (assigned from outside)
    this.onAddShape = null;

    this._buildUI();
  }

  _buildUI() {
    const panel = document.createElement("div");
    panel.className = "ui-panel";

    // ---- Dark mode ----
    const darkLabel = document.createElement("label");
    const darkCheckbox = document.createElement("input");
    darkCheckbox.type = "checkbox";

    darkCheckbox.addEventListener("change", () => {
      this.darkMode = darkCheckbox.checked;
      document.body.classList.toggle("dark", this.darkMode);
    });

    darkLabel.append(darkCheckbox, " Dark mode");

    // ---- Invert Y ----
    const invertLabel = document.createElement("label");
    const invertCheckbox = document.createElement("input");
    invertCheckbox.type = "checkbox";

    invertCheckbox.addEventListener("change", () => {
      this.invertY = invertCheckbox.checked;
    });

    invertLabel.append(invertCheckbox, " Invert Y rotation");

    // ---- Primitive picker ----
    const addRow = document.createElement("div");
    addRow.style.display = "flex";
    addRow.style.gap = "0.5rem";
    addRow.style.alignItems = "center";

    const shapeSelect = document.createElement("select");
    const options = [
      ["sphere", "Sphere"],
      ["box", "Box"],
      ["cylinder", "Cylinder"],
      ["capsule", "Capsule"],
      ["torus", "Torus"],
    ];
    options.forEach(([val, label]) => {
      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = label;
      shapeSelect.appendChild(opt);
    });

    const addShapeBtn = document.createElement("button");
    addShapeBtn.textContent = "Add";

    addShapeBtn.addEventListener("click", () => {
      if (this.onAddShape) {
        this.onAddShape(shapeSelect.value);
      }
    });

    addRow.append(addShapeBtn, shapeSelect);

    panel.append(
      darkLabel,
      invertLabel,
      document.createElement("hr"),
      addRow
    );

    document.body.appendChild(panel);
  }
}
