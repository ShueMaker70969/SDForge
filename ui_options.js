// ui_options.js
export class UIOptions {
  constructor() {
    this.darkMode = false;
    this.invertY = false;

    // callbacks (assigned from outside)
    this.onAddShape = null;
    this.onUpdateBoxRounding = null; //box rounding updates

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

    // ----  Rounding Control ----
    const roundingContainer = document.createElement("div");
    roundingContainer.style.display = "none"; // Hidden by default, shown when shape is selected
    roundingContainer.style.marginTop = "10px";

    const roundingLabel = document.createElement("label");
    roundingLabel.textContent = "Rounding: ";
    roundingLabel.style.display = "block";
    roundingLabel.style.marginBottom = "5px";

    const roundingInput = document.createElement("input");
    roundingInput.type = "range";
    roundingInput.min = "0";
    roundingInput.max = "0.5";
    roundingInput.step = "0.01";
    roundingInput.value = "0";
    roundingInput.style.width = "150px";

    const roundingValue = document.createElement("span");
    roundingValue.textContent = "0.00";
    roundingValue.style.marginLeft = "10px";

    roundingInput.addEventListener("input", (e) => {
      const rounding = parseFloat(e.target.value);
     
      //static 
      //roundingValue.textContent = rounding.toFixed(2);

      const maxRounding = parseFloat(this.roundingInput.max);
      // Clamp to max value (range input should handle this, but add safeguard)
      const clampedRounding = Math.min(rounding, maxRounding);
      roundingValue.textContent = clampedRounding.toFixed(2);
      
      // Call callback to update shape parameter
      if (this.onUpdateBoxRounding) {
        //static 
        //this.onUpdateBoxRounding(rounding);

        this.onUpdateBoxRounding(clampedRounding);
      }
    });

    roundingLabel.appendChild(roundingInput);
    roundingLabel.appendChild(roundingValue);
    roundingContainer.appendChild(roundingLabel);

    // Store references for external updates
    this.roundingContainer = roundingContainer;
    this.roundingInput = roundingInput;
    this.roundingValue = roundingValue;

    panel.append(
      darkLabel,
      invertLabel,
      document.createElement("hr"),
      addRow,
      roundingContainer
    );

    document.body.appendChild(panel);
  }

  // Method to update rounding control visibility and value
  updateRoundingControl(selectedShape, shape) {
    if (selectedShape !== -1 && shape && (shape.type === 1 || shape.type === 2)) { // SHAPE_BOX = 1, SHAPE_CYL = 2
      this.roundingContainer.style.display = "block";
      
      // Calculate max rounding based on shape dimensions (dynamic, start here if needed)
      let maxRounding = 0.5; // default fallback
      if (shape.type === 1) { // SHAPE_BOX
        // Max rounding = smallest half-extent (to prevent rounding from exceeding dimensions)
        maxRounding = Math.min(shape.params[0], shape.params[1], shape.params[2]);
      } else if (shape.type === 2) { // SHAPE_CYL
        // Max rounding = smaller of radius or half-height
        maxRounding = Math.min(shape.params[0], shape.params[1]);
      }
      
      // Set max value (with small epsilon to prevent edge cases)
      this.roundingInput.max = (maxRounding * 0.99).toFixed(2);
      
      // Box uses params[3], Cylinder uses params[2]
      const rounding = shape.type === 1 ? (shape.params[3] || 0) : (shape.params[2] || 0);
      //static 
      //this.roundingInput.value = rounding;
      //this.roundingValue.textContent = rounding.toFixed(2);
      
      // Clamp rounding value to max if it exceeds
      const clampedRounding = Math.min(rounding, maxRounding);
      if (clampedRounding !== rounding) {
        if (this.onUpdateBoxRounding) {
          this.onUpdateBoxRounding(clampedRounding);
        }
      }
      
      this.roundingInput.value = clampedRounding;
      this.roundingValue.textContent = clampedRounding.toFixed(2);
      //dynamic (end, delete if needed)
    } else {
      this.roundingContainer.style.display = "none";
    }
  }
}
