// ui_options.js
export class UIOptions {
  constructor() {
    this.invertY = true;
    this.gizmoMode = "translate";

    // callbacks (assigned from outside)
    this.onAddShape = null;
    this.onUpdateBoxRounding = null; //box rounding updates
    this.onDeleteShape = null;
    this.onGizmoModeChange = null;
    this.onLightRotate = null;

    this._buildUI();
  }

  _buildUI() {
    const leftPanel  = document.createElement("div");
    const rightPanel = document.createElement("div");

    leftPanel.className = "ui-panel";
    leftPanel.style.position = "fixed";
    leftPanel.style.top = "10px";
    leftPanel.style.left = "10px";

    rightPanel.className = "ui-panel";
    rightPanel.style.position = "fixed";
    rightPanel.style.top = "10px";
    rightPanel.style.right = "10px";
    rightPanel.style.width = "auto";
    rightPanel.style.maxWidth = "260px";

    // ---- Invert Y ----
    const invertLabel = document.createElement("label");
    const invertCheckbox = document.createElement("input");
    invertCheckbox.type = "checkbox";

    invertCheckbox.addEventListener("change", () => {
      this.invertY = invertCheckbox.checked;
    });

    invertLabel.append(invertCheckbox, " Invert Y rotation");

    // ---- Gizmo Mode ----
    const gizmoLabel = document.createElement("label");
    gizmoLabel.textContent = "Gizmo mode:";
    gizmoLabel.style.display = "flex";
    gizmoLabel.style.flexDirection = "column";
    gizmoLabel.style.gap = "0.25rem";

    const gizmoSelect = document.createElement("select");
    [
      ["select", "Select"],
      ["translate", "Translate"],
      ["rotate", "Rotate"],
      ["scale", "Scale"],
    ].forEach(([val, text]) => {
      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = text;
      gizmoSelect.appendChild(opt);
    });
    gizmoSelect.value = this.gizmoMode;

    gizmoSelect.addEventListener("change", () => {
      this.gizmoMode = gizmoSelect.value;
      if (this.onGizmoModeChange) {
        this.onGizmoModeChange(this.gizmoMode);
      }
    });
    gizmoLabel.appendChild(gizmoSelect);

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

    const deleteShapeBtn = document.createElement("button");
    deleteShapeBtn.textContent = "Delete";
    deleteShapeBtn.disabled = true; // disabled by default

    deleteShapeBtn.addEventListener("click", () => {
      if (this.onDeleteShape) {
        this.onDeleteShape();
      }
    });
    addRow.append(addShapeBtn, shapeSelect, deleteShapeBtn);

    //light control
    // ---- Light Rotation ----
    const lightLabel = document.createElement("label");
    lightLabel.textContent = "Light rotation";
    lightLabel.style.display = "flex";
    lightLabel.style.flexDirection = "column";
    lightLabel.style.gap = "0.25rem";

    const lightSlider = document.createElement("input");
    lightSlider.type = "range";
    lightSlider.min = "0";
    lightSlider.max = "360";
    lightSlider.step = "1";
    lightSlider.value = "0";

    lightSlider.addEventListener("input", (e) => {
      const deg = parseFloat(e.target.value);
      if (this.onLightRotate) {
        this.onLightRotate(deg);
      }
    });

    lightLabel.appendChild(lightSlider);
    rightPanel.append(lightLabel);


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
    
    this.deleteShapeBtn = deleteShapeBtn;

    leftPanel.append(
      invertLabel,
      gizmoLabel,
      document.createElement("hr"),
      addRow,
      roundingContainer
    );

    document.body.appendChild(leftPanel);
    document.body.appendChild(rightPanel);

  }

  // Method to update rounding control visibility and value
  updateRoundingControl(selectedShape, shape) {
    // Enable delete button only when a shape is selected!
    //NOTE!!! This is here, as this is called whenever selection changes. Might have rename updateRoundingControl later to something more generic.
    if (this.deleteShapeBtn) {
      this.deleteShapeBtn.disabled = (selectedShape === -1);
    }
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
