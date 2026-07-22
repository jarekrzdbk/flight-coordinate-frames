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
    angleLegend: $("angle-legend")
};

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
    return {
        labels: ["&psi; yaw", "&#x03D1; pitch", state.mode === "euler" ? "&phi; spin" : "&phi; roll"],
        note: state.mode === "euler"
            ? "Classical Euler: ϑ ranges from 0° to 180°; φ is the final spin."
            : "Krylov / Tait–Bryan: ϑ ranges from −90° to +90°.",
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

    updateTransformOptions();

    draw3d(data, labels);
    drawCombined(data, labels);

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

resetCamera();
setAircraftConvention();
configureAngles();
resizeRenderer();
resizeProjection();
update();
