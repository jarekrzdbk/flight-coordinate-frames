"use strict";

const DEFAULT_ANGLE_SETS = Object.freeze({
    attitude: [30, 20, 25],
    trajectory: [30, 20, 0],
    airDirection: [30, 20, 0],
    airBank: [25, 0, 0],
    airVelocity: [30, 20, 25],
    airBody: [5, 8, 0]
});

const angleControls = ["yaw", "pitch", "roll"].map(name => ({
    input: $(name),
    output: $(`${name}-value`),
    row: $(name).closest(".control")
}));

const ui = {
    convention: $("frame-mode"),
    transformation: $("transformation"),
    mode: $("sequence-mode"),
    labels: $("label-mode"),
    previous: $("previous"),
    next: $("next"),
    animate: $("animate"),
    reset: $("reset"),
    stage: $("stage-label"),
    sequence: $("sequence-text"),
    note: $("label-note"),
    formula: $("formula"),
    frameDescription: $("frame-description"),
    angleNote: $("angle-note"),
    yawLabel: $("yaw-label"),
    pitchLabel: $("pitch-label"),
    rollLabel: $("roll-label"),
    angleLegend: $("angle-legend"),
    gimbalPanel: $("gimbal-panel"),
    gimbalStatus: $("gimbal-status"),
    gimbalDistance: $("gimbal-distance"),
    gimbalNote: $("gimbal-note"),
    gimbalAxes: $("gimbal-axes-value"),
    gimbalFirst: $("gimbal-first"),
    gimbalSecond: $("gimbal-second"),
    dcmToggle: $("toggle-dcm"),
    dcmPanel: $("dcm-panel"),
    dcmDisplay: $("dcm-display"),
    dcmGrid: $("dcm-grid")
};

let dcmVisible=false;

function updateGimbalPanel(info) {
    ui.gimbalPanel.hidden = !info.enabled;
    if (!info.enabled) return;

    ui.gimbalStatus.textContent = info.status === "locked" ? "Gimbal lock"
        : info.status === "near" ? "Near gimbal lock"
        : "Normal";
    ui.gimbalStatus.className = `gimbal-${info.status}`;
    ui.gimbalDistance.textContent = `Δ ${Math.abs(info.distance / D2R).toFixed(1)}°`;
    ui.gimbalAxes.textContent = info.status === "normal"
        ? `${info.axisNames[0]} / ${info.axisNames[1]} · separate`
        : `${info.axisNames[0]} / ${info.axisNames[1]} · ${info.relation}`;
    ui.gimbalNote.textContent = info.properEuler
        ? "ϑ = 0° or 180°: first and final axes coincide."
        : "ϑ = ±90°: yaw and roll axes coincide.";
    [ui.gimbalFirst, ui.gimbalSecond].forEach((button, index) => {
        const angle = info.lockAngles[index];
        button.textContent = `${angle < 0 ? "−" : ""}${Math.abs(angle)}°`;
        button.title = `Set middle angle to ${angle}° gimbal lock`;
        button.setAttribute("aria-label", button.title);
    });
}

function setGimbalAngle(angle) {
    const info = gimbalInfo();
    if (!info.enabled) return;
    state.target[1] = angle;
    state.angleSets[state.transformation] = [...state.target];
    state.shown = [...state.target];
    angleControls[1].input.value = angle;
    state.step = maximumStep();
    update();
}

function matrixRows(matrix) {
    const e=matrix.elements;
    return [
        [e[0],e[4],e[8]],
        [e[1],e[5],e[9]],
        [e[2],e[6],e[10]]
    ];
}

function symbolicIdentity() {
    return [0,1,2].map(row=>[0,1,2].map(column=>
        row===column?[{coefficient:1,factors:[]}]:[]
    ));
}

function symbolicCombine(terms) {
    const combined=new Map();
    for(const term of terms) {
        const factors=[...term.factors].sort((a,b)=>a.stage-b.stage||a.kind.localeCompare(b.kind));
        const key=factors.map(factor=>`${factor.kind}${factor.stage}`).join(",");
        const previous=combined.get(key);
        if(previous)previous.coefficient+=term.coefficient;
        else combined.set(key,{coefficient:term.coefficient,factors});
    }
    return [...combined.values()].filter(term=>term.coefficient!==0);
}

function symbolicFactor(axis,stage) {
    const c=[{coefficient:1,factors:[{kind:"cos",stage}]}];
    const s=[{coefficient:1,factors:[{kind:"sin",stage}]}];
    const ns=[{coefficient:-1,factors:[{kind:"sin",stage}]}];
    const one=[{coefficient:1,factors:[]}],zero=[];
    if(axis==="x")return [[one,zero,zero],[zero,c,ns],[zero,s,c]];
    if(axis==="y")return [[c,zero,s],[zero,one,zero],[ns,zero,c]];
    return [[c,ns,zero],[s,c,zero],[zero,zero,one]];
}

function symbolicMultiply(left,right) {
    return [0,1,2].map(row=>[0,1,2].map(column=>{
        const terms=[];
        for(let inner=0;inner<3;inner++)
            for(const a of left[row][inner])
                for(const b of right[inner][column])
                    terms.push({
                        coefficient:a.coefficient*b.coefficient,
                        factors:[...a.factors,...b.factors]
                    });
        return symbolicCombine(terms);
    }));
}

function angleHtml(stage) {
    return `<span class="angle-token stage-${stage}">${activeAngleSymbols()[stage]}</span>`;
}

function factorAxisText(stage) {
    const axis=activeAxes()[stage];
    return `about +${plainLabels(stage)[AXIS_INDEX[axis]]}`;
}

function symbolicEntryHtml(terms) {
    if(!terms.length)return "0";
    return terms.map((term,index)=>{
        const sign=term.coefficient<0?"−":index?"+":"";
        const magnitude=Math.abs(term.coefficient);
        const factors=term.factors.map(factor=>
            `${factor.kind}(${angleHtml(factor.stage)})`
        ).join(" ");
        const coefficient=magnitude===1&&factors?"":String(magnitude);
        return `${index?" ":""}${sign}${coefficient}${factors}`;
    }).join("");
}

function matrixSection(titleText) {
    const section=document.createElement("section");
    section.className="dcm-section";
    const title=document.createElement("h3");
    title.textContent=titleText;
    const row=document.createElement("div");
    row.className="dcm-row";
    section.append(title,row);
    ui.dcmGrid.appendChild(section);
    return row;
}

function matrixElement(rows) {
    const matrix=document.createElement("div");
    matrix.className="matrix";
    for(const row of rows)for(const entry of row){
        const cell=document.createElement("div");
        cell.className="matrix-cell";
        cell.innerHTML=entry;
        matrix.appendChild(cell);
    }
    return matrix;
}

function appendMatrixCard(container,titleHtml,rows,stage=null) {
    const card=document.createElement("article");
    card.className="matrix-card";
    if(stage!==null)card.style.setProperty("--stage-color",stageColor(stage));

    const title=document.createElement("div");
    title.className="matrix-title";
    title.innerHTML=titleHtml;
    card.appendChild(title);

    card.appendChild(matrixElement(rows));
    container.appendChild(card);
}

function appendMatrixOperand(container,labelHtml,rows) {
    const operand=document.createElement("div");
    operand.className="matrix-operand";
    const label=document.createElement("div");
    label.className="matrix-operand-label";
    label.innerHTML=labelHtml;
    operand.append(label,matrixElement(rows));
    container.appendChild(operand);
}

function appendCurrentMultiplication(container,cumulative,factors,rowsFor,stage) {
    const card=document.createElement("article");
    card.className="matrix-equation-card";
    const title=document.createElement("div");
    title.className="matrix-title";

    if(stage===0) {
        title.innerHTML='Current position · no rotation applied<span class="current-badge">current</span>';
        const equation=document.createElement("div");
        equation.className="matrix-equation";
        appendMatrixOperand(equation,"C0 = I",rowsFor(cumulative[0]));
        card.append(title,equation);
        container.appendChild(card);
        return;
    }

    const factorIndex=stage-1;
    const resultName=stage===factors.length?"M":`C${stage}`;
    title.innerHTML=`Stage ${stage} · previous × next rotation`
        +'<span class="current-badge">current</span>';
    card.style.setProperty("--stage-color",stageColor(factorIndex));

    const equation=document.createElement("div");
    equation.className="matrix-equation";
    appendMatrixOperand(equation,`C${stage-1}`,rowsFor(cumulative[stage-1]));
    const multiply=document.createElement("div");
    multiply.className="matrix-operator";
    multiply.textContent="×";
    equation.appendChild(multiply);
    appendMatrixOperand(
        equation,
        `R${stage}(${angleHtml(factorIndex)}) · ${factorAxisText(factorIndex)}`,
        rowsFor(factors[factorIndex])
    );
    const equals=document.createElement("div");
    equals.className="matrix-operator";
    equals.textContent="=";
    equation.appendChild(equals);
    appendMatrixOperand(equation,resultName,rowsFor(cumulative[stage]));

    card.append(title,equation);
    container.appendChild(card);
}

function updateDcmPanel() {
    if(!dcmVisible)return;
    const axes=activeAxes();
    const symbolic=ui.dcmDisplay.value==="symbolic";
    ui.dcmGrid.replaceChildren();
    const currentRow=matrixSection("Current multiplication · full matrices");
    const factorRow=matrixSection("Factor matrices");

    if(symbolic) {
        const factors=axes.map((axis,stage)=>symbolicFactor(axis,stage));
        const cumulative=[symbolicIdentity()];
        factors.forEach(factor=>
            cumulative.push(symbolicMultiply(cumulative.at(-1),factor))
        );
        const rowsFor=matrix=>matrix.map(row=>row.map(symbolicEntryHtml));
        appendCurrentMultiplication(
            currentRow,cumulative,factors,rowsFor,
            Math.min(state.step,axes.length)
        );
        factors.forEach((factor,stage)=>{
            appendMatrixCard(
                factorRow,
                `R${stage+1}(${angleHtml(stage)}) · ${factorAxisText(stage)}`,
                rowsFor(factor),
                stage
            );
        });
        return;
    }

    const factors=axes.map((axis,stage)=>
        rotationMatrix(axis,state.target[stage]*D2R)
    );
    const cumulative=[identity()];
    factors.forEach(factor=>
        cumulative.push(cumulative.at(-1).clone().multiply(factor))
    );
    const rowsFor=matrix=>matrixRows(matrix).map(row=>row.map(value=>
        (Math.abs(value)<5e-12?0:value).toFixed(4)
    ));
    appendCurrentMultiplication(
        currentRow,cumulative,factors,rowsFor,
        Math.min(state.step,axes.length)
    );
    factors.forEach((factor,stage)=>{
        appendMatrixCard(
            factorRow,
            `R${stage+1}(${angleHtml(stage)} = ${Math.round(state.target[stage])}°) · ${factorAxisText(stage)}`,
            rowsFor(factor),
            stage
        );
    });
}

function angleRanges() {
    if (state.transformation === "airBody") return [[-45, 45], [-20, 90], [0, 0]];
    if (state.transformation === "airBank") return [[-180, 180], [0, 0], [0, 0]];
    const middle = isAttitudeTransformation() && state.mode === "euler"
        ? [0, 180]
        : [-90, 90];
    return [[-180, 180], middle, [-180, 180]];
}

function configureAngles() {
    angleRanges().forEach(([min, max], index) => {
        const control = angleControls[index];
        control.input.min = min;
        control.input.max = max;
        state.target[index] = clamp(state.target[index], min, max);
        control.input.value = state.target[index];
    });
    state.shown = [...state.target];
    state.angleSets[state.transformation] = [...state.target];
}

function angleUi() {
    if (state.transformation === "trajectory") return {
        labels: ["&Psi;", "&Theta;"],
        note: "Trajectory frame k: Xk follows the ground-velocity vector Vₖ.",
        legend: '<span class="swatch yaw"></span>Ψ <span class="swatch pitch"></span>Θ'
    };
    if (state.transformation === "airDirection") return {
        labels: ["&psi;<sub>a</sub>", "&#x03D1;<sub>a</sub>"],
        note: "Normal coordinate system → air coordinate system OX1aY1aZ1a.",
        legend: '<span class="swatch yaw"></span>ψₐ <span class="swatch pitch"></span>ϑₐ'
    };
    if (state.transformation === "airBank") return {
        labels: ["&gamma;<sub>a</sub>"],
        note: "Air coordinate system OX1aY1aZ1a → velocity coordinate system OXaYaZa.",
        legend: '<span class="swatch roll"></span>γₐ'
    };
    if (state.transformation === "airVelocity") return {
        labels: ["&psi;<sub>a</sub>", "&#x03D1;<sub>a</sub>", "&gamma;<sub>a</sub>"],
        note: "Normal coordinate system → velocity coordinate system: ψₐ and ϑₐ form OX1aY1aZ1a; γₐ completes OXaYaZa.",
        legend: '<span class="swatch yaw"></span>ψₐ <span class="swatch pitch"></span>ϑₐ <span class="swatch roll"></span>γₐ'
    };
    if (state.transformation === "airBody") return {
        labels: ["&beta;", "&alpha;"],
        note: `Velocity coordinate system → body coordinate system: ${stageArcText(0)}, then ${stageArcText(1)}.`,
        legend: '<span class="swatch yaw"></span>β <span class="swatch pitch"></span>α'
    };
    if (state.mode === "euler") return {
        labels: ["&psi;", "&#x03D1;", "&phi;"],
        note: "Proper Euler · repeated axis · lock at ϑ = 0° or 180°.",
        legend: '<span class="swatch yaw"></span>ψ <span class="swatch pitch"></span>ϑ <span class="swatch roll"></span>φ'
    };
    return {
        labels: ["&psi; yaw", "&#x03D1; pitch", "&phi; roll"],
        note: "Krylov / Tait–Bryan · yaw, pitch, roll · lock at ϑ = ±90°.",
        legend: '<span class="swatch yaw"></span>ψ <span class="swatch pitch"></span>ϑ <span class="swatch roll"></span>φ'
    };
}

function transformationText() {
    if (state.transformation === "trajectory") return "reference → trajectory K";
    if (state.transformation === "airDirection") return "normal coordinate system → air coordinate system OX1aY1aZ1a";
    if (state.transformation === "airBank") return "air coordinate system OX1aY1aZ1a → velocity coordinate system OXaYaZa";
    if (state.transformation === "airVelocity") return "normal coordinate system → velocity coordinate system through OX1aY1aZ1a";
    if (state.transformation === "airBody") return "velocity coordinate system OXaYaZa → body coordinate system OXYZ";
    return "reference → body B attitude";
}

function updateTransformOptions() {
    const reference = state.convention === "ground" ? "OXgYgZg" : "OXnYnZn";
    const names = {
        attitude: `${reference} → OXYZ`,
        trajectory: `${reference} → OXkYkZk`,
        airDirection: `${reference} → OX1aY1aZ1a`,
        airBank: "OX1aY1aZ1a → OXaYaZa",
        airVelocity: `${reference} → OXaYaZa (via 1a)`,
        airBody: "OXaYaZa → OXYZ"
    };
    for (const option of ui.transformation.options)
        option.textContent = names[option.value];
}

function update() {
    const data = orientationData();
    const labels = frameLabels();
    const maxStep = maximumStep();
    const gimbal = gimbalInfo();

    updateTransformOptions();

    draw3d(data, labels, gimbal);
    drawCombined(data, labels, gimbal);
    drawSpherical(data, labels, gimbal);
    updateProjectionPresentation();
    updateDcmPanel();

    angleControls.forEach((control, index) => {
        control.output.textContent = `${Math.round(state.target[index])}°`;
        control.input.disabled = state.animating;
        control.row.hidden = index >= maxStep;
    });

    const anglePresentation = angleUi();
    [ui.yawLabel, ui.pitchLabel, ui.rollLabel].forEach((label, index) => {
        if (anglePresentation.labels[index]) label.innerHTML = anglePresentation.labels[index];
    });
    ui.angleNote.textContent = anglePresentation.note;
    ui.angleLegend.innerHTML = anglePresentation.legend;
    updateGimbalPanel(gimbal);

    const descriptions = [`${frameName(0)} · initial`];
    for (let stage = 0; stage < maxStep; stage++) {
        const position = stage + 1 === maxStep ? `final R${stage + 1}` : `after R${stage + 1}`;
        descriptions.push(`${frameName(stage + 1)} · ${position} · ${stageArcText(stage)}`);
    }
    ui.stage.textContent = descriptions[state.step];
    ui.sequence.textContent = `Sequence: ${activeAxes().map((_, stage) => stageArcText(stage)).join(", then ")}.`;
    ui.animate.textContent = usesNumberedLabels()
        ? `Animate ${FRAME_CODES.slice(0, maxStep + 1).join(" → ")}`
        : `Animate ${frameName(0)} → ${frameName(maxStep)}`;

    ui.note.textContent = usesNumberedLabels()
        ? `Numbered attitude labels: ${CONFIG[state.convention].numbers.join("–")} axes; S/T/K/P stages.`
        : "XYZ labels; primes mark intermediate axes.";

    ui.frameDescription.textContent = `${CONFIG[state.convention].shortName} Showing ${transformationText()}.`;

    ui.formula.textContent =
        `${sourceAxisLabels().join("/")} → ${targetAxisLabels().join("/")} · ` +
        activeAxes().map((_, stage) => stageArcText(stage)).join(" → ");
    ui.formula.title = "The selected frame is built by these successive right-handed rotations.";

    ui.previous.disabled = state.step === 0 || state.animating;
    ui.next.disabled = state.step === maxStep || state.animating;
    ui.convention.disabled = state.animating;
    ui.transformation.disabled = state.animating;
    ui.mode.disabled = state.animating || !isAttitudeTransformation();
    ui.mode.value = isAttitudeTransformation() ? state.mode : state.transformation;
    ui.labels.disabled = state.animating || !isAttitudeTransformation();
    ui.labels.value = isAttitudeTransformation() ? state.labels : "xyz";
    ui.animate.disabled = state.animating;
    ui.reset.disabled = state.animating;
}

function readAngles() {
    state.target = angleControls.map(control => Number(control.input.value));
    state.angleSets[state.transformation] = [...state.target];
    state.shown = [...state.target];
    state.step = maximumStep();
    update();
}

function animateAngle(stage, target, duration = 550) {
    return new Promise(resolve => {
        const started = performance.now();
        function frame(now) {
            const t = Math.min(1, (now - started) / duration);
            state.shown[stage] = target * t * t * (3 - 2 * t);
            state.step = stage + 1;
            update();
            if (t < 1) requestAnimationFrame(frame); else resolve();
        }
        requestAnimationFrame(frame);
    });
}

async function animateSequence() {
    if (state.animating) return;
    const maxStep = maximumStep();
    const targets = [...state.target];
    state.animating = true;
    state.shown = [0, 0, 0];
    state.step = 0;
    update();
    for (let stage = 0; stage < maxStep; stage++) await animateAngle(stage, targets[stage]);
    state.shown = targets;
    state.step = maxStep;
    state.animating = false;
    update();
}

function reset() {
    for (const [name, angles] of Object.entries(DEFAULT_ANGLE_SETS))
        state.angleSets[name] = [...angles];
    state.target = [...state.angleSets[state.transformation]];
    configureAngles();
    state.step = maximumStep();
    resetCamera();
    update();
}

angleControls.forEach(control => control.input.addEventListener("input", readAngles));

ui.labels.addEventListener("change", event => {
    state.labels = event.target.value;
    update();
});

ui.convention.addEventListener("change", event => {
    state.convention = event.target.value;
    state.step = maximumStep();
    setAircraftConvention();
    resetCamera();
    update();
});

ui.transformation.addEventListener("change", event => {
    state.transformation = event.target.value;
    state.target = [...state.angleSets[state.transformation]];
    configureAngles();
    state.step = maximumStep();
    update();
});

ui.mode.addEventListener("change", event => {
    state.mode = event.target.value;
    configureAngles();
    state.step = maximumStep();
    update();
});

ui.previous.addEventListener("click", () => {
    state.shown = [...state.target];
    state.step = Math.max(0, state.step - 1);
    update();
});

ui.next.addEventListener("click", () => {
    state.shown = [...state.target];
    state.step = Math.min(maximumStep(), state.step + 1);
    update();
});

ui.animate.addEventListener("click", animateSequence);
ui.reset.addEventListener("click", reset);
ui.gimbalFirst.addEventListener("click",()=>setGimbalAngle(gimbalInfo().lockAngles[0]));
ui.gimbalSecond.addEventListener("click",()=>setGimbalAngle(gimbalInfo().lockAngles[1]));
ui.dcmToggle.addEventListener("click",()=>{
    dcmVisible=!dcmVisible;
    ui.dcmPanel.hidden=!dcmVisible;
    ui.dcmToggle.textContent=dcmVisible
        ?"Hide direction cosine matrices"
        :"Show direction cosine matrices";
    ui.dcmToggle.setAttribute("aria-expanded",String(dcmVisible));
    updateDcmPanel();
});
ui.dcmDisplay.addEventListener("change",updateDcmPanel);

resetCamera();
setAircraftConvention();
configureAngles();
const query=new URLSearchParams(location.search);
const requestedMode=query.get("mode");
if(["krylov","euler"].includes(requestedMode)){
    state.mode=requestedMode;
    ui.mode.value=requestedMode;
    configureAngles();
}
const requestedStep=query.get("step");
if(requestedStep!==null)
    state.step=clamp(Number(requestedStep)||0,0,maximumStep());
const requestedGimbal=query.get("gimbal");
if(gimbalInfo().enabled && ["first","second"].includes(requestedGimbal)){
    const lock=gimbalInfo().lockAngles[requestedGimbal==="second"?1:0];
    state.target[1]=lock;
    state.shown=[...state.target];
    state.angleSets.attitude=[...state.target];
    angleControls[1].input.value=String(lock);
}
const requestedDcm=query.get("dcm");
if(["symbolic","numeric"].includes(requestedDcm)){
    dcmVisible=true;
    ui.dcmDisplay.value=requestedDcm;
    ui.dcmPanel.hidden=false;
    ui.dcmToggle.textContent="Hide direction cosine matrices";
    ui.dcmToggle.setAttribute("aria-expanded","true");
}
resizeRenderer();
resizeProjection();
update();
