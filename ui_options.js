// ui_options.js
export class UIOptions {
  constructor() {
    this.invertY = true;
    this.gizmoMode = "select";
    this.shapeSelect = null;
    this.gizmoSelect = null;
    this.sceneTextarea = null;
    this.lightSlider = null;

    // callbacks (assigned from outside)
    this.onAddShape = null;
    this.onUpdateBoxRounding = null; //box rounding updates
    this.onUpdateShapeColor = null; //shape color updates
    this.onDeleteShape = null;
    this.onGizmoModeChange = null;
    this.onLightRotate = null;
    this.onExportScene = null;
    this.onImportScene = null;
    this.onApplyBoolean = null;

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
    invertCheckbox.checked = this.invertY;

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
    this.gizmoSelect = gizmoSelect;

    gizmoSelect.addEventListener("change", () => {
      this.setGizmoMode(gizmoSelect.value);
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
    this.shapeSelect = shapeSelect;

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

    // ---- Boolean operations ----
    const booleanContainer = document.createElement("div");
    booleanContainer.style.display = "flex";
    booleanContainer.style.flexDirection = "column";
    booleanContainer.style.gap = "0.25rem";
    booleanContainer.style.marginTop = "0.5rem";

    const booleanLabel = document.createElement("span");
    booleanLabel.textContent = "Boolean operation";

    const booleanRow = document.createElement("div");
    booleanRow.style.display = "flex";
    booleanRow.style.gap = "0.5rem";
    booleanRow.style.alignItems = "center";

    const booleanSelect = document.createElement("select");
    [
      ["union", "Union"],
      ["difference", "Difference"],
      ["intersect", "Intersect"],
    ].forEach(([value, label]) => {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      booleanSelect.appendChild(opt);
    });
    this.booleanSelect = booleanSelect;

    const booleanBtn = document.createElement("button");
    booleanBtn.textContent = "Modify";
    booleanBtn.disabled = true;
    booleanBtn.addEventListener("click", () => {
      if (this.onApplyBoolean) {
        this.onApplyBoolean(booleanSelect.value);
      }
    });
    this.booleanApplyBtn = booleanBtn;

    booleanRow.append(booleanSelect, booleanBtn);
    booleanContainer.append(booleanLabel, booleanRow);

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
    this.lightSlider = lightSlider;

    // ---- Scene import/export ----
    const sceneIO = document.createElement("div");
    sceneIO.style.marginTop = "1rem";
    sceneIO.style.display = "flex";
    sceneIO.style.flexDirection = "column";
    sceneIO.style.gap = "0.5rem";

    const sceneLabel = document.createElement("div");
    sceneLabel.textContent = "Scene data:";

    const sceneTextarea = document.createElement("textarea");
    sceneTextarea.rows = 4;
    sceneTextarea.placeholder = "Scene JSON";
    sceneTextarea.style.width = "240px";
    sceneTextarea.style.resize = "vertical";
    this.sceneTextarea = sceneTextarea;

    const sceneButtons = document.createElement("div");
    sceneButtons.style.display = "flex";
    sceneButtons.style.gap = "0.5rem";

    const exportBtn = document.createElement("button");
    exportBtn.textContent = "Export";
    exportBtn.addEventListener("click", () => {
      if (this.onExportScene) {
        const text = this.onExportScene();
        if (typeof text === "string") {
          this.setSceneText(text);
        }
      }
    });

    const importBtn = document.createElement("button");
    importBtn.textContent = "Import";
    importBtn.addEventListener("click", () => {
      if (this.onImportScene) {
        this.onImportScene(sceneTextarea.value);
      }
    });

    sceneButtons.append(exportBtn, importBtn);
    sceneIO.append(sceneLabel, sceneTextarea, sceneButtons);
    rightPanel.append(sceneIO);


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

    // ---- Color Picker Control ----
    const colorContainer = document.createElement("div");
    colorContainer.style.display = "none"; // Hidden by default, shown when shape is selected
    colorContainer.style.marginTop = "10px";

    const colorLabel = document.createElement("label");
    colorLabel.textContent = "Color: ";
    colorLabel.style.display = "block";
    colorLabel.style.marginBottom = "8px";

    // Color input - HTML5 color picker
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = "#cccccc"; // Default light grey
    colorInput.style.width = "60px";
    colorInput.style.height = "30px";
    colorInput.style.border = "1px solid #ccc";
    colorInput.style.borderRadius = "4px";
    colorInput.style.cursor = "pointer";

    // Helper function to convert hex to RGB [0-1]
    function hexToRgb(hex) {
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      return [r, g, b];
    }

    colorInput.addEventListener("input", (e) => {
      const rgb = hexToRgb(e.target.value);
      if (this.onUpdateShapeColor) {
        this.onUpdateShapeColor(rgb);
      }
    });

    colorLabel.appendChild(colorInput);
    colorContainer.appendChild(colorLabel);

    // Store references
    this.colorContainer = colorContainer;
    this.colorInput = colorInput;

    leftPanel.append(
      invertLabel,
      gizmoLabel,
      document.createElement("hr"),
      addRow,
      booleanContainer,
      roundingContainer,
      colorContainer
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
    
    // Update color picker
    if (selectedShape !== -1 && shape && shape.color) {
      this.colorContainer.style.display = "block";
      const rgb = shape.color;
      const hex = `#${Math.round(rgb[0] * 255).toString(16).padStart(2, '0')}${Math.round(rgb[1] * 255).toString(16).padStart(2, '0')}${Math.round(rgb[2] * 255).toString(16).padStart(2, '0')}`;
      this.colorInput.value = hex;
    } else {
      this.colorContainer.style.display = "none";
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

  setGizmoMode(mode) {
    this.gizmoMode = mode;
    if (this.gizmoSelect && this.gizmoSelect.value !== mode) {
      this.gizmoSelect.value = mode;
    }
  }

  updateBooleanControls(selectionCount, canApply = false) {
    if (!this.booleanApplyBtn) return;
    this.booleanApplyBtn.disabled = !(selectionCount >= 2 && canApply);
  }

  getSelectedShapeType() {
    return this.shapeSelect ? this.shapeSelect.value : "sphere";
  }

  setSceneText(text) {
    if (this.sceneTextarea) {
      this.sceneTextarea.value = text || "";
    }
  }

  setLightSlider(degrees) {
    if (this.lightSlider) {
      this.lightSlider.value = String(degrees);
    }
  }
}
