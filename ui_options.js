// ui_options.js
import { ShortcutsPanel } from "./shortcuts_panel.js";

export class UIOptions {
  constructor() {
    this.invertY = true;
    this.gizmoMode = "select";
    this.shapeSelect = null;
    this.gizmoSelect = null;
    this.sceneTextarea = null;
    this.lightSlider = null;

    // PBR settings
    this.aoIntensity = 1.0;

    // Procedural texture settings
    this.textureType = "none";
    this.textureScale = 5.0;
    this.textureDisplacement = 0.15;

    // Point lights
    this.pointLights = [
      { enabled: false, position: [3, 4, 2], color: [1, 0.9, 0.8], intensity: 15.0, radius: 0.0 },
      { enabled: false, position: [-3, 3, -2], color: [0.8, 0.9, 1], intensity: 10.0, radius: 0.0 },
    ];

    // Area light
    this.areaLight = {
      enabled: false,
      position: [0, 5, 0],
      color: [1, 1, 1],
      intensity: 5.0,
      size: [3, 3],
    };

    // callbacks (assigned from outside)
    this.onAddShape = null;
    this.onUpdateBoxRounding = null;
    this.onUpdateShapeColor = null;
    this.onUpdateShapeParams = null;
    this.onDeleteShape = null;
    this.onGizmoModeChange = null;
    this.onLightRotate = null;
    this.onExportScene = null;
    this.onImportScene = null;
    this.onApplyBoolean = null;
    
    // PBR callbacks
    this.onPBRUpdate = null;
    this.onPointLightUpdate = null;
    this.onAreaLightUpdate = null;

    // Procedural texture callback
    this.onTextureUpdate = null;

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
      ["octahedron", "Octahedron"],
      ["cone", "Cone"],
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

    // ---- Morph Slider ---- <--- 0116 8PM
    const morphContainer = document.createElement("div");
    morphContainer.style.marginBottom = "10px";
    morphContainer.style.marginTop = "10px";
    
    const morphLabel = document.createElement("label");
    morphLabel.style.display = "flex";
    morphLabel.style.flexDirection = "column";
    morphLabel.style.gap = "0.25rem";
    morphLabel.innerHTML = 'Morph Factor: <span id="morphVal">0.00</span>';
    
    const morphSlider = document.createElement("input");
    morphSlider.type = "range";
    morphSlider.min = "0";
    morphSlider.max = "1";
    morphSlider.step = "0.01";
    morphSlider.value = "0";
    
    morphSlider.addEventListener("input", (e) => {
        const val = parseFloat(e.target.value);
        morphContainer.querySelector("#morphVal").textContent = val.toFixed(2);
        window.morphFactor = val; // Global variable
    });
    
    morphLabel.appendChild(morphSlider);
    morphContainer.appendChild(morphLabel);

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
      ["smoothUnion", "Smooth Union"],
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

    // ===============================
    // PBR LIGHTING CONTROLS
    // ===============================
    
    const pbrSection = document.createElement("div");
    pbrSection.style.marginTop = "1rem";
    pbrSection.style.borderTop = "1px solid rgba(255,255,255,0.2)";
    pbrSection.style.paddingTop = "0.75rem";

    const pbrTitle = document.createElement("div");
    pbrTitle.textContent = "PBR Lighting";
    pbrTitle.style.fontWeight = "bold";
    pbrTitle.style.marginBottom = "0.5rem";
    pbrTitle.style.color = "#ffe18f";
    pbrSection.appendChild(pbrTitle);

    // AO Intensity
    pbrSection.appendChild(this._createSlider("AO Intensity", 0, 2, 0.05, this.aoIntensity, (val) => {
      this.aoIntensity = val;
      this._emitPBRUpdate();
    }));

    // ---- Point Lights Section ----
    const pointLightsTitle = document.createElement("div");
    pointLightsTitle.textContent = "Point Lights";
    pointLightsTitle.style.fontWeight = "bold";
    pointLightsTitle.style.marginTop = "0.75rem";
    pointLightsTitle.style.marginBottom = "0.5rem";
    pointLightsTitle.style.color = "#ffe18f";
    pbrSection.appendChild(pointLightsTitle);

    for (let i = 0; i < 2; i++) {
      pbrSection.appendChild(this._createPointLightPanel(i));
    }

    // ---- Area Light Section ----
    const areaLightTitle = document.createElement("div");
    areaLightTitle.textContent = "Area Light";
    areaLightTitle.style.fontWeight = "bold";
    areaLightTitle.style.marginTop = "0.75rem";
    areaLightTitle.style.marginBottom = "0.5rem";
    areaLightTitle.style.color = "#ffe18f";
    pbrSection.appendChild(areaLightTitle);

    pbrSection.appendChild(this._createAreaLightPanel());

    rightPanel.appendChild(pbrSection);
    rightPanel.style.maxHeight = "calc(100vh - 40px)";
    rightPanel.style.overflowY = "auto";

    // ===============================
    // Procedural Texture Controls
    // ===============================
    const textureSection = document.createElement("div");
    textureSection.style.marginTop = "1rem";
    textureSection.style.borderTop = "1px solid rgba(255,255,255,0.2)";
    textureSection.style.paddingTop = "0.75rem";

    const textureTitle = document.createElement("div");
    textureTitle.textContent = "Procedural Texture";
    textureTitle.style.fontWeight = "bold";
    textureTitle.style.marginBottom = "0.5rem";
    textureTitle.style.color = "#ffe18f";
    textureSection.appendChild(textureTitle);

    const textureLabel = document.createElement("label");
    textureLabel.textContent = "Texture Type:";
    textureLabel.style.display = "flex";
    textureLabel.style.flexDirection = "column";
    textureLabel.style.gap = "0.25rem";
    textureLabel.style.fontSize = "0.85rem";

    const textureSelect = document.createElement("select");
    [
      ["none", "None"],
      ["voronoi", "Voronoi (Cells)"],
      ["fbm", "FBM (Clouds)"],
      ["cellular", "Cellular (Bubbles)"],
      ["noise", "Basic Noise"],
    ].forEach(([value, label]) => {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      textureSelect.appendChild(opt);
    });
    textureSelect.value = this.textureType;
    textureSelect.addEventListener("change", () => {
      this.textureType = textureSelect.value;
      this._emitTextureUpdate();
    });
    textureLabel.appendChild(textureSelect);
    textureSection.appendChild(textureLabel);

    textureSection.appendChild(this._createSlider("Texture Scale", 1, 15, 0.5, this.textureScale, (val) => {
      this.textureScale = val;
      this._emitTextureUpdate();
    }));

    textureSection.appendChild(this._createSlider("Displacement", 0, 0.5, 0.01, this.textureDisplacement, (val) => {
      this.textureDisplacement = val;
      this._emitTextureUpdate();
    }));

    rightPanel.appendChild(textureSection);

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

    // ---- Shape Parameter Controls ----
    const paramContainer = document.createElement("div");
    paramContainer.style.display = "none"; // Hidden by default, shown when shape supports params
    paramContainer.style.marginTop = "10px";

    const paramTitle = document.createElement("div");
    paramTitle.textContent = "Shape Parameters";
    paramTitle.style.fontWeight = "bold";
    paramTitle.style.marginBottom = "6px";
    paramContainer.appendChild(paramTitle);

    // Torus thickness
    const torusThicknessLabel = document.createElement("label");
    torusThicknessLabel.textContent = "Torus Thickness:";
    torusThicknessLabel.style.display = "block";
    torusThicknessLabel.style.marginBottom = "4px";

    const torusThickness = document.createElement("input");
    torusThickness.type = "range";
    torusThickness.min = "0.05";
    torusThickness.max = "1.5";
    torusThickness.step = "0.01";
    torusThickness.value = "0.25";
    torusThickness.style.width = "150px";

    const torusThicknessValue = document.createElement("span");
    torusThicknessValue.textContent = "0.25";
    torusThicknessValue.style.marginLeft = "8px";

    torusThickness.addEventListener("input", (e) => {
      const v = parseFloat(e.target.value);
      const maxThickness = parseFloat(this.torusThickness.max);
      // Clamp to max value (range input should handle this, but add safeguard)
      const clampedV = Math.min(v, maxThickness);
      torusThicknessValue.textContent = clampedV.toFixed(2);
      if (this.onUpdateShapeParams) {
        this.onUpdateShapeParams({ torusThickness: clampedV });
      }
    });

    torusThicknessLabel.appendChild(torusThickness);
    torusThicknessLabel.appendChild(torusThicknessValue);
    paramContainer.appendChild(torusThicknessLabel);

    // Capsule radius
    const capsuleRadiusLabel = document.createElement("label");
    capsuleRadiusLabel.textContent = "Capsule Radius:";
    capsuleRadiusLabel.style.display = "block";
    capsuleRadiusLabel.style.marginTop = "8px";
    capsuleRadiusLabel.style.marginBottom = "4px";

    const capsuleRadius = document.createElement("input");
    capsuleRadius.type = "range";
    capsuleRadius.min = "0.05";
    capsuleRadius.max = "2.0";
    capsuleRadius.step = "0.01";
    capsuleRadius.value = "0.4";
    capsuleRadius.style.width = "150px";

    const capsuleRadiusValue = document.createElement("span");
    capsuleRadiusValue.textContent = "0.40";
    capsuleRadiusValue.style.marginLeft = "8px";

    capsuleRadius.addEventListener("input", (e) => {
      const v = parseFloat(e.target.value);
      capsuleRadiusValue.textContent = v.toFixed(2);
      if (this.onUpdateShapeParams) {
        this.onUpdateShapeParams({ capsuleRadius: v });
      }
    });

    capsuleRadiusLabel.appendChild(capsuleRadius);
    capsuleRadiusLabel.appendChild(capsuleRadiusValue);
    paramContainer.appendChild(capsuleRadiusLabel);

    // Capsule half-height
    const capsuleLenLabel = document.createElement("label");
    capsuleLenLabel.textContent = "Capsule Half-Height:";
    capsuleLenLabel.style.display = "block";
    capsuleLenLabel.style.marginTop = "8px";
    capsuleLenLabel.style.marginBottom = "4px";

    const capsuleLen = document.createElement("input");
    capsuleLen.type = "range";
    capsuleLen.min = "0.05";
    capsuleLen.max = "3.0";
    capsuleLen.step = "0.01";
    capsuleLen.value = "1.0"; // Half-height default
    capsuleLen.style.width = "150px";

    const capsuleLenValue = document.createElement("span");
    capsuleLenValue.textContent = "1.00";
    capsuleLenValue.style.marginLeft = "8px";

    capsuleLen.addEventListener("input", (e) => {
      const v = parseFloat(e.target.value);
      capsuleLenValue.textContent = v.toFixed(2);
      if (this.onUpdateShapeParams) {
        this.onUpdateShapeParams({ capsuleHeight: v });
      }
    });

    capsuleLenLabel.appendChild(capsuleLen);
    capsuleLenLabel.appendChild(capsuleLenValue);
    paramContainer.appendChild(capsuleLenLabel);

    // Store parameter refs
    this.paramContainer = paramContainer;
    this.torusThickness = torusThickness;
    this.torusThicknessValue = torusThicknessValue;
    this.capsuleRadius = capsuleRadius;
    this.capsuleRadiusValue = capsuleRadiusValue;
    this.capsuleLen = capsuleLen;
    this.capsuleLenValue = capsuleLenValue;

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
      morphContainer, // <--- 0116 8PM
      booleanContainer,
      roundingContainer,
      paramContainer,
      colorContainer
    );

    document.body.appendChild(leftPanel);
    document.body.appendChild(rightPanel);

    // ---- Shortcuts Panel ----
    this.shortcutsPanel = new ShortcutsPanel();
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
    if (selectedShape !== -1 && shape && (shape.type === 1 || shape.type === 2 || shape.type === 6)) { // SHAPE_BOX = 1, SHAPE_CYL = 2, SHAPE_OCTAHEDRON = 6
      this.roundingContainer.style.display = "block";
      
      // Calculate max rounding based on shape dimensions (dynamic, start here if needed)
      let maxRounding = 0.5; // default fallback
      if (shape.type === 1) { // SHAPE_BOX
        // Max rounding = smallest half-extent (to prevent rounding from exceeding dimensions)
        maxRounding = Math.min(shape.params[0], shape.params[1], shape.params[2]);
      } else if (shape.type === 2) { // SHAPE_CYL
        // Max rounding = smaller of radius or half-height
        maxRounding = Math.min(shape.params[0], shape.params[1]);
      } else if (shape.type === 6) { // SHAPE_OCTAHEDRON
        // Max rounding based on size (scaled by sqrt(3) for plane offset)
        maxRounding = shape.params[0]/ 1.73205081; // size / sqrt(3)
      }
      
      // Set max value (with small epsilon to prevent edge cases)
      this.roundingInput.max = (maxRounding * 0.99).toFixed(2);
      
      // Box uses params[3], Cylinder uses params[2], Octahedron uses params[1]
      let rounding = 0;
      if (shape.type === 1) rounding = shape.params[3] || 0;        // SHAPE_BOX
      else if (shape.type === 2) rounding = shape.params[2] || 0;   // SHAPE_CYL
      else if (shape.type === 6) rounding = shape.params[1] || 0;   // SHAPE_OCTAHEDRON
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

    // Update shape parameter controls (torus, capsule)
    this.updateShapeParamControls(selectedShape, shape);
  }

  updateShapeParamControls(selectedShape, shape) {
    if (selectedShape !== -1 && shape) {
      if (shape.type === 4) { // SHAPE_TORUS
        this.paramContainer.style.display = "block";
        this.torusThickness.parentElement.style.display = "block";
        this.capsuleRadius.parentElement.style.display = "none";
        this.capsuleLen.parentElement.style.display = "none";
        
        // Dynamic max thickness based on major radius
        const majorRadius = shape.params[0] || 1.0;
        const maxThickness = majorRadius * 0.99; // Prevent thickness from exceeding major radius
        this.torusThickness.max = maxThickness.toFixed(2);
        
        const t = shape.params[1] || 0.25;
        // Clamp thickness to max if it exceeds
        const clampedT = Math.min(t, maxThickness);
        if (clampedT !== t && this.onUpdateShapeParams) {
          this.onUpdateShapeParams({ torusThickness: clampedT });
        }
        
        this.torusThickness.value = clampedT;
        this.torusThicknessValue.textContent = clampedT.toFixed(2);
      } else if (shape.type === 3) { // SHAPE_CAPSULE
        this.paramContainer.style.display = "block";
        this.torusThickness.parentElement.style.display = "none";
        this.capsuleRadius.parentElement.style.display = "block";
        this.capsuleLen.parentElement.style.display = "block";
        const r = shape.params[0] || 0.4;
        const h = shape.params[1] || 1.0; // Half-height
        this.capsuleRadius.value = r;
        this.capsuleRadiusValue.textContent = r.toFixed(2);
        this.capsuleLen.value = h;
        this.capsuleLenValue.textContent = h.toFixed(2);
      } else {
        this.paramContainer.style.display = "none";
      }
    } else {
      this.paramContainer.style.display = "none";
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

  // Helper: Create slider control
  _createSlider(label, min, max, step, defaultValue, onChange) {
    const container = document.createElement("div");
    container.style.marginBottom = "0.5rem";
    container.style.fontSize = "0.85rem";

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.justifyContent = "space-between";

    const labelText = document.createElement("span");
    labelText.textContent = label;

    const valueText = document.createElement("span");
    valueText.textContent = defaultValue.toFixed(2);
    valueText.style.color = "#aaa";

    row.append(labelText, valueText);

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(defaultValue);
    slider.style.width = "100%";

    slider.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      valueText.textContent = val.toFixed(2);
      onChange(val);
    });

    container.append(row, slider);
    return container;
  }

  // Helper: Create point light panel
  _createPointLightPanel(index) {
    const panel = document.createElement("div");
    panel.style.marginBottom = "0.5rem";
    panel.style.padding = "0.4rem";
    panel.style.background = "rgba(0,0,0,0.2)";
    panel.style.borderRadius = "4px";
    panel.style.fontSize = "0.8rem";

    const light = this.pointLights[index];

    const enableLabel = document.createElement("label");
    enableLabel.style.display = "flex";
    enableLabel.style.alignItems = "center";
    enableLabel.style.gap = "0.5rem";

    const enableCheck = document.createElement("input");
    enableCheck.type = "checkbox";
    enableCheck.checked = light.enabled;
    enableCheck.addEventListener("change", () => {
      light.enabled = enableCheck.checked;
      this._emitPointLightUpdate();
    });
    enableLabel.append(enableCheck, `Light ${index + 1}`);
    panel.appendChild(enableLabel);

    // Position inputs
    const posRow = document.createElement("div");
    posRow.style.display = "flex";
    posRow.style.gap = "0.25rem";
    posRow.style.marginTop = "0.3rem";
    ["X", "Y", "Z"].forEach((axis, i) => {
      const input = document.createElement("input");
      input.type = "number";
      input.value = light.position[i];
      input.style.width = "50px";
      input.style.fontSize = "0.75rem";
      input.addEventListener("change", (e) => {
        light.position[i] = parseFloat(e.target.value) || 0;
        this._emitPointLightUpdate();
      });
      posRow.appendChild(input);
    });
    panel.appendChild(posRow);

    // Intensity
    const intRow = document.createElement("div");
    intRow.style.marginTop = "0.3rem";
    intRow.innerHTML = `<span>Intensity:</span>`;
    const intInput = document.createElement("input");
    intInput.type = "range";
    intInput.min = "0";
    intInput.max = "50";
    intInput.step = "0.5";
    intInput.value = light.intensity;
    intInput.style.width = "100px";
    intInput.addEventListener("input", (e) => {
      light.intensity = parseFloat(e.target.value);
      this._emitPointLightUpdate();
    });
    intRow.appendChild(intInput);
    panel.appendChild(intRow);

    // Color
    const colorRow = document.createElement("div");
    colorRow.style.marginTop = "0.3rem";
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = this._rgbToHex(light.color);
    colorInput.addEventListener("input", (e) => {
      light.color = this._hexToRgb(e.target.value);
      this._emitPointLightUpdate();
    });
    colorRow.append("Color: ", colorInput);
    panel.appendChild(colorRow);

    return panel;
  }

  // Helper: Create area light panel
  _createAreaLightPanel() {
    const panel = document.createElement("div");
    panel.style.padding = "0.4rem";
    panel.style.background = "rgba(0,0,0,0.2)";
    panel.style.borderRadius = "4px";
    panel.style.fontSize = "0.8rem";

    const light = this.areaLight;

    const enableLabel = document.createElement("label");
    enableLabel.style.display = "flex";
    enableLabel.style.alignItems = "center";
    enableLabel.style.gap = "0.5rem";

    const enableCheck = document.createElement("input");
    enableCheck.type = "checkbox";
    enableCheck.checked = light.enabled;
    enableCheck.addEventListener("change", () => {
      light.enabled = enableCheck.checked;
      this._emitAreaLightUpdate();
    });
    enableLabel.append(enableCheck, "Enable");
    panel.appendChild(enableLabel);

    // Position
    const posRow = document.createElement("div");
    posRow.style.display = "flex";
    posRow.style.gap = "0.25rem";
    posRow.style.marginTop = "0.3rem";
    ["X", "Y", "Z"].forEach((axis, i) => {
      const input = document.createElement("input");
      input.type = "number";
      input.value = light.position[i];
      input.style.width = "50px";
      input.style.fontSize = "0.75rem";
      input.addEventListener("change", (e) => {
        light.position[i] = parseFloat(e.target.value) || 0;
        this._emitAreaLightUpdate();
      });
      posRow.appendChild(input);
    });
    panel.appendChild(posRow);

    // Intensity
    const intRow = document.createElement("div");
    intRow.style.marginTop = "0.3rem";
    intRow.innerHTML = `<span>Intensity:</span>`;
    const intInput = document.createElement("input");
    intInput.type = "range";
    intInput.min = "0";
    intInput.max = "30";
    intInput.step = "0.5";
    intInput.value = light.intensity;
    intInput.style.width = "100px";
    intInput.addEventListener("input", (e) => {
      light.intensity = parseFloat(e.target.value);
      this._emitAreaLightUpdate();
    });
    intRow.appendChild(intInput);
    panel.appendChild(intRow);

    // Size
    const sizeRow = document.createElement("div");
    sizeRow.style.marginTop = "0.3rem";
    sizeRow.innerHTML = `<span>Size: </span>`;
    ["W", "H"].forEach((axis, i) => {
      const input = document.createElement("input");
      input.type = "number";
      input.value = light.size[i];
      input.style.width = "45px";
      input.style.fontSize = "0.75rem";
      input.addEventListener("change", (e) => {
        light.size[i] = parseFloat(e.target.value) || 1;
        this._emitAreaLightUpdate();
      });
      sizeRow.appendChild(input);
    });
    panel.appendChild(sizeRow);

    // Color
    const colorRow = document.createElement("div");
    colorRow.style.marginTop = "0.3rem";
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = this._rgbToHex(light.color);
    colorInput.addEventListener("input", (e) => {
      light.color = this._hexToRgb(e.target.value);
      this._emitAreaLightUpdate();
    });
    colorRow.append("Color: ", colorInput);
    panel.appendChild(colorRow);

    return panel;
  }

  _emitPBRUpdate() {
    if (this.onPBRUpdate) {
      this.onPBRUpdate({
        aoIntensity: this.aoIntensity,
      });
    }
  }

  _emitPointLightUpdate() {
    if (this.onPointLightUpdate) {
      this.onPointLightUpdate(this.pointLights.filter(l => l.enabled));
    }
  }

  _emitAreaLightUpdate() {
    if (this.onAreaLightUpdate) {
      this.onAreaLightUpdate(this.areaLight);
    }
  }

  _emitTextureUpdate() {
    if (this.onTextureUpdate) {
      this.onTextureUpdate({
        type: this.textureType,
        scale: this.textureScale,
        displacement: this.textureDisplacement,
      });
    }
  }

  _hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return [r, g, b];
  }

  _rgbToHex(rgb) {
    const r = Math.round(rgb[0] * 255).toString(16).padStart(2, '0');
    const g = Math.round(rgb[1] * 255).toString(16).padStart(2, '0');
    const b = Math.round(rgb[2] * 255).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }

  getPBRSettings() {
    return {
      aoIntensity: this.aoIntensity,
    };
  }

  getPointLights() {
    return this.pointLights.filter(l => l.enabled);
  }

  getAreaLight() {
    return this.areaLight;
  }
}
