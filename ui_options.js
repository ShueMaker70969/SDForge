import { ShortcutsPanel } from "./shortcuts_panel.js";
// Notification Box: A red/green text box to warn the user.
// Helper Text: "Hold Shift + Click to select multiple."
// Unmorph Button: A "Reset" button to stop morphing.
// Status Sign: Displays exactly which shapes are currently morphing (e.g., "Active: Shape 0 & Shape 2").
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

    this.pointLights = [
      { enabled: false, position: [3, 4, 2], color: [1, 0.9, 0.8], intensity: 15.0, radius: 0.0 },
      { enabled: false, position: [-3, 3, -2], color: [0.8, 0.9, 1], intensity: 10.0, radius: 0.0 },
    ];

    this.areaLight = {
      enabled: false,
      position: [0, 5, 0],
      color: [1, 1, 1],
      intensity: 5.0,
      size: [3, 3],
    };

    // callbacks
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
    
    // Morph callbacks
    this.onSetMorphTargets = null;
    this.onUnmorph = null; // [NEW]
    
    // PBR callbacks
    this.onPBRUpdate = null;
    this.onPointLightUpdate = null;
    this.onAreaLightUpdate = null;

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
      if (this.onAddShape) this.onAddShape(shapeSelect.value);
    });

    const deleteShapeBtn = document.createElement("button");
    deleteShapeBtn.textContent = "Delete";
    deleteShapeBtn.disabled = true;
    deleteShapeBtn.addEventListener("click", () => {
      if (this.onDeleteShape) this.onDeleteShape();
    });
    addRow.append(addShapeBtn, shapeSelect, deleteShapeBtn);

    // ============================================
    // [UPDATED] Morph UI Section
    // ============================================
    const morphContainer = document.createElement("div");
    morphContainer.style.marginBottom = "10px";
    morphContainer.style.marginTop = "10px";
    morphContainer.style.borderTop = "1px solid #555";
    morphContainer.style.paddingTop = "10px";
    
    // 1. Slider
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
        window.morphFactor = val; 
    });
    morphLabel.appendChild(morphSlider);

    // ---- Slider 2 (Morph Result -> Shape C) ----
    const morphLabel2 = document.createElement("label");
    morphLabel2.style.display = "flex";
    morphLabel2.style.flexDirection = "column";
    morphLabel2.style.gap = "0.25rem";
    morphLabel2.style.marginTop = "5px";
    morphLabel2.innerHTML = 'Morph Stage 2 (-> C): <span id="morphVal2">0.00</span>';

    const morphSlider2 = document.createElement("input");
    morphSlider2.type = "range";
    morphSlider2.min = "0";
    morphSlider2.max = "1";
    morphSlider2.step = "0.01";
    morphSlider2.value = "0";
    morphSlider2.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    morphContainer.querySelector("#morphVal2").textContent = val.toFixed(2);
    window.morphFactor2 = val; // NEW GLOBAL
    });
    morphLabel2.appendChild(morphSlider2);
    morphContainer.appendChild(morphLabel2);

    // 2. Control Buttons Row
    const btnRow = document.createElement("div");
    btnRow.style.display = "flex";
    btnRow.style.gap = "5px";
    btnRow.style.marginTop = "5px";

    const setMorphBtn = document.createElement("button");
    setMorphBtn.textContent = "Set Morph Targets";
    setMorphBtn.style.flex = "1";
    setMorphBtn.style.fontSize = "0.8rem";
    setMorphBtn.title = "Select exactly 2 shapes (Shift+Click) and press this.";
    setMorphBtn.addEventListener("click", () => {
        if (this.onSetMorphTargets) this.onSetMorphTargets();
    });

    const unmorphBtn = document.createElement("button");
    unmorphBtn.textContent = "Reset";
    unmorphBtn.style.width = "50px";
    unmorphBtn.style.fontSize = "0.8rem";
    unmorphBtn.title = "Stop morphing";
    unmorphBtn.addEventListener("click", () => {
        if (this.onUnmorph) this.onUnmorph();
    });

    btnRow.appendChild(setMorphBtn);
    btnRow.appendChild(unmorphBtn);

    // 3. Status Box & Signs
    const statusBox = document.createElement("div");
    statusBox.id = "morphStatus";
    statusBox.style.marginTop = "8px";
    statusBox.style.padding = "6px";
    statusBox.style.borderRadius = "4px";
    statusBox.style.fontSize = "0.75rem";
    statusBox.style.background = "rgba(0,0,0,0.3)";
    statusBox.style.border = "1px solid #444";
    statusBox.innerHTML = `
      <div style="color: #ccc; margin-bottom:4px;"><b>Status:</b> No targets set</div>
      <div style="color: #aaa; font-style: italic;">Tip: Hold Shift + Click to select 2 shapes.</div>
    `;
    this.statusBox = statusBox;

    morphContainer.appendChild(morphLabel);
    morphContainer.appendChild(btnRow);
    morphContainer.appendChild(statusBox);

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

    // ---- Light Controls ----
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
      if (this.onLightRotate) this.onLightRotate(deg);
    });
    lightLabel.appendChild(lightSlider);
    rightPanel.append(lightLabel);
    this.lightSlider = lightSlider;

    // ---- PBR Section ----
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

    pbrSection.appendChild(this._createSlider("AO Intensity", 0, 2, 0.05, this.aoIntensity, (val) => {
      this.aoIntensity = val;
      this._emitPBRUpdate();
    }));

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

    // ---- Scene IO ----
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
        if (typeof text === "string") this.setSceneText(text);
      }
    });

    const importBtn = document.createElement("button");
    importBtn.textContent = "Import";
    importBtn.addEventListener("click", () => {
      if (this.onImportScene) this.onImportScene(sceneTextarea.value);
    });

    sceneButtons.append(exportBtn, importBtn);
    sceneIO.append(sceneLabel, sceneTextarea, sceneButtons);
    rightPanel.append(sceneIO);

    // ---- Rounding ----
    const roundingContainer = document.createElement("div");
    roundingContainer.style.display = "none"; 
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
      const maxRounding = parseFloat(this.roundingInput.max);
      const clampedRounding = Math.min(rounding, maxRounding);
      roundingValue.textContent = clampedRounding.toFixed(2);
      if (this.onUpdateBoxRounding) this.onUpdateBoxRounding(clampedRounding);
    });

    roundingLabel.appendChild(roundingInput);
    roundingLabel.appendChild(roundingValue);
    roundingContainer.appendChild(roundingLabel);

    this.roundingContainer = roundingContainer;
    this.roundingInput = roundingInput;
    this.roundingValue = roundingValue;
    this.deleteShapeBtn = deleteShapeBtn;

    // ---- Params ----
    const paramContainer = document.createElement("div");
    paramContainer.style.display = "none";
    paramContainer.style.marginTop = "10px";
    const paramTitle = document.createElement("div");
    paramTitle.textContent = "Shape Parameters";
    paramTitle.style.fontWeight = "bold";
    paramTitle.style.marginBottom = "6px";
    paramContainer.appendChild(paramTitle);

    // Torus
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
      const clampedV = Math.min(v, maxThickness);
      torusThicknessValue.textContent = clampedV.toFixed(2);
      if (this.onUpdateShapeParams) this.onUpdateShapeParams({ torusThickness: clampedV });
    });
    torusThicknessLabel.appendChild(torusThickness);
    torusThicknessLabel.appendChild(torusThicknessValue);
    paramContainer.appendChild(torusThicknessLabel);

    // Capsule Radius
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
      if (this.onUpdateShapeParams) this.onUpdateShapeParams({ capsuleRadius: v });
    });
    capsuleRadiusLabel.appendChild(capsuleRadius);
    capsuleRadiusLabel.appendChild(capsuleRadiusValue);
    paramContainer.appendChild(capsuleRadiusLabel);

    // Capsule Height
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
    capsuleLen.value = "1.0";
    capsuleLen.style.width = "150px";
    const capsuleLenValue = document.createElement("span");
    capsuleLenValue.textContent = "1.00";
    capsuleLenValue.style.marginLeft = "8px";
    capsuleLen.addEventListener("input", (e) => {
      const v = parseFloat(e.target.value);
      capsuleLenValue.textContent = v.toFixed(2);
      if (this.onUpdateShapeParams) this.onUpdateShapeParams({ capsuleHeight: v });
    });
    capsuleLenLabel.appendChild(capsuleLen);
    capsuleLenLabel.appendChild(capsuleLenValue);
    paramContainer.appendChild(capsuleLenLabel);

    this.paramContainer = paramContainer;
    this.torusThickness = torusThickness;
    this.torusThicknessValue = torusThicknessValue;
    this.capsuleRadius = capsuleRadius;
    this.capsuleRadiusValue = capsuleRadiusValue;
    this.capsuleLen = capsuleLen;
    this.capsuleLenValue = capsuleLenValue;

    // ---- Color ----
    const colorContainer = document.createElement("div");
    colorContainer.style.display = "none";
    colorContainer.style.marginTop = "10px";
    const colorLabel = document.createElement("label");
    colorLabel.textContent = "Color: ";
    colorLabel.style.display = "block";
    colorLabel.style.marginBottom = "8px";
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = "#cccccc"; 
    colorInput.style.width = "60px";
    colorInput.style.height = "30px";
    colorInput.style.border = "1px solid #ccc";
    colorInput.style.borderRadius = "4px";
    colorInput.style.cursor = "pointer";

    function hexToRgb(hex) {
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      return [r, g, b];
    }
    colorInput.addEventListener("input", (e) => {
      const rgb = hexToRgb(e.target.value);
      if (this.onUpdateShapeColor) this.onUpdateShapeColor(rgb);
    });
    colorLabel.appendChild(colorInput);
    colorContainer.appendChild(colorLabel);

    this.colorContainer = colorContainer;
    this.colorInput = colorInput;

    leftPanel.append(
      invertLabel,
      gizmoLabel,
      document.createElement("hr"),
      addRow,
      morphContainer, 
      booleanContainer,
      roundingContainer,
      paramContainer,
      colorContainer
    );

    document.body.appendChild(leftPanel);
    document.body.appendChild(rightPanel);

    this.shortcutsPanel = new ShortcutsPanel();
  }

  // [NEW] Method to update the status text box
  updateMorphStatus(msg, type = "info") {
    if (!this.statusBox) return;
    
    let color = "#ccc";
    if (type === "error") color = "#ff6b6b"; // Red
    if (type === "success") color = "#51cf66"; // Green

    this.statusBox.innerHTML = `
      <div style="color: ${color}; margin-bottom:4px;"><b>Status:</b> ${msg}</div>
      <div style="color: #aaa; font-style: italic;">Tip: Hold Shift + Click to select 2 shapes.</div>
    `;
  }

  updateRoundingControl(selectedShape, shape) {
    if (this.deleteShapeBtn) {
      this.deleteShapeBtn.disabled = (selectedShape === -1);
    }
    
    if (selectedShape !== -1 && shape && shape.color) {
      this.colorContainer.style.display = "block";
      const rgb = shape.color;
      const hex = `#${Math.round(rgb[0] * 255).toString(16).padStart(2, '0')}${Math.round(rgb[1] * 255).toString(16).padStart(2, '0')}${Math.round(rgb[2] * 255).toString(16).padStart(2, '0')}`;
      this.colorInput.value = hex;
    } else {
      this.colorContainer.style.display = "none";
    }
    if (selectedShape !== -1 && shape && (shape.type === 1 || shape.type === 2 || shape.type === 6)) { 
      this.roundingContainer.style.display = "block";
      
      let maxRounding = 0.5; 
      if (shape.type === 1) maxRounding = Math.min(shape.params[0], shape.params[1], shape.params[2]);
      else if (shape.type === 2) maxRounding = Math.min(shape.params[0], shape.params[1]);
      else if (shape.type === 6) maxRounding = shape.params[0]/ 1.73205081; 
      
      this.roundingInput.max = (maxRounding * 0.99).toFixed(2);
      
      let rounding = 0;
      if (shape.type === 1) rounding = shape.params[3] || 0;        
      else if (shape.type === 2) rounding = shape.params[2] || 0;   
      else if (shape.type === 6) rounding = shape.params[1] || 0;   
      
      const clampedRounding = Math.min(rounding, maxRounding);
      if (clampedRounding !== rounding) {
        if (this.onUpdateBoxRounding) this.onUpdateBoxRounding(clampedRounding);
      }
      this.roundingInput.value = clampedRounding;
      this.roundingValue.textContent = clampedRounding.toFixed(2);
    } else {
      this.roundingContainer.style.display = "none";
    }
    this.updateShapeParamControls(selectedShape, shape);
  }

  updateShapeParamControls(selectedShape, shape) {
    if (selectedShape !== -1 && shape) {
      if (shape.type === 4) { 
        this.paramContainer.style.display = "block";
        this.torusThickness.parentElement.style.display = "block";
        this.capsuleRadius.parentElement.style.display = "none";
        this.capsuleLen.parentElement.style.display = "none";
        
        const majorRadius = shape.params[0] || 1.0;
        const maxThickness = majorRadius * 0.99; 
        this.torusThickness.max = maxThickness.toFixed(2);
        
        const t = shape.params[1] || 0.25;
        const clampedT = Math.min(t, maxThickness);
        if (clampedT !== t && this.onUpdateShapeParams) this.onUpdateShapeParams({ torusThickness: clampedT });
        
        this.torusThickness.value = clampedT;
        this.torusThicknessValue.textContent = clampedT.toFixed(2);
      } else if (shape.type === 3) { 
        this.paramContainer.style.display = "block";
        this.torusThickness.parentElement.style.display = "none";
        this.capsuleRadius.parentElement.style.display = "block";
        this.capsuleLen.parentElement.style.display = "block";
        const r = shape.params[0] || 0.4;
        const h = shape.params[1] || 1.0; 
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
    if (this.onPBRUpdate) this.onPBRUpdate({ aoIntensity: this.aoIntensity });
  }

  _emitPointLightUpdate() {
    if (this.onPointLightUpdate) this.onPointLightUpdate(this.pointLights.filter(l => l.enabled));
  }

  _emitAreaLightUpdate() {
    if (this.onAreaLightUpdate) this.onAreaLightUpdate(this.areaLight);
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

  getPBRSettings() { return { aoIntensity: this.aoIntensity }; }
  getPointLights() { return this.pointLights.filter(l => l.enabled); }
  getAreaLight() { return this.areaLight; }
}