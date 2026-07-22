"use strict";

const angleControls = ["yaw", "pitch", "roll"].map(name => ({
    input: $(`${name}`),
    output: $(`${name}-value`)
}));

const ui = {
    convention: $("frame-mode"),
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
    rollLabel: $("roll-label")
};

function update() {
    const data = orientationData();
    const labels = frameLabels();

    draw3d(data, labels);
    drawCombined(data, labels);

    angleControls.forEach((control, index) => {
        control.output.textContent = `${Math.round(state.target[index])}°`;
        control.input.disabled = state.animating;
    });

    const descriptions = [
        "S · initial",
        `T · after R1 · ${stageArcText(0)}`,
        `K · after R2 · ${stageArcText(1)}`,
        `P · final R3 · ${stageArcText(2)}`
    ];

    ui.stage.textContent = descriptions[state.step];
    ui.sequence.textContent =
        `Sequence: ${[0, 1, 2].map(stageArcText).join(", then ")}.`;

    ui.note.textContent = state.labels === "xyz"
        ? "XYZ mode uses Xg/Yg/Zg, primes for intermediate frames, and final X/Y/Z. It does not add S/T/K/P to axis labels."
        : `Numbered mode uses ${CONFIG[state.convention].numbers.join("–")} for X–Y–Z and S/T/K/P subscripts for successive frames.`;

    ui.frameDescription.textContent = CONFIG[state.convention].shortName;
    ui.angleNote.textContent = state.mode === "euler"
        ? "Classical Euler: ϑ ranges from 0° to 180°; φ is the final spin."
        : "Krylov / Tait–Bryan: ϑ ranges from −90° to +90°.";
    ui.rollLabel.innerHTML = state.mode === "euler" ? "&phi; spin" : "&phi; roll";

    const axes = CONFIG[state.convention].sequences[state.mode];
    ui.formula.innerHTML =
        `M = ${axes.map((axis, index) => `R<sub>${axis}</sub>(${STAGE_ANGLES[index]})`).join(" · ")}` +
        ` &nbsp; x<sub>g</sub> = M · x<sub>body</sub>`;

    ui.previous.disabled = state.step === 0 || state.animating;
    ui.next.disabled = state.step === 3 || state.animating;
    ui.labels.disabled = state.animating;
    ui.convention.disabled = state.animating;
    ui.mode.disabled = state.animating;
    ui.animate.disabled = state.animating;
    ui.reset.disabled = state.animating;
}

function readAngles() {
    state.target = angleControls.map(control => Number(control.input.value));
    state.shown = [...state.target];
    state.step = 3;
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

            if (t < 1) requestAnimationFrame(frame);
                else resolve();
        }

        requestAnimationFrame(frame);
    });
}

async function animateSequence() {
    if (state.animating) return;

    state.animating = true;
    const targets = [...state.target];
    state.shown = [0, 0, 0];
    state.step = 0;
    update();

    for (let stage = 0; stage < 3; stage++) {
        await animateAngle(stage, targets[stage]);
    }

    state.shown = targets;
    state.step = 3;
    state.animating = false;
    update();
}

function reset() {
    state.target = [30, 20, 25];
    state.shown = [...state.target];
    state.step = 3;

    angleControls.forEach((control, index) => {
        control.input.value = state.target[index];
    });

    resetCamera();
    update();
}

angleControls.forEach(control =>
    control.input.addEventListener("input", readAngles)
);

ui.labels.addEventListener("change", event => {
    state.labels = event.target.value;
    update();
});

ui.convention.addEventListener("change", event => {
    state.convention = event.target.value;
    state.step = 3;
    setAircraftConvention();
    resetCamera();
    update();
});

ui.mode.addEventListener("change", event => {
    state.mode = event.target.value;
    const euler = state.mode === "euler";
    angleControls[1].input.min = euler ? 0 : -90;
    angleControls[1].input.max = euler ? 180 : 90;
    state.target[1] = clamp(state.target[1], Number(angleControls[1].input.min), Number(angleControls[1].input.max));
    state.shown = [...state.target];
    angleControls[1].input.value = state.target[1];
    state.step = 3;
    update();
});

ui.previous.addEventListener("click", () => {
    state.shown = [...state.target];
    state.step = Math.max(0, state.step - 1);
    update();
});

ui.next.addEventListener("click", () => {
    state.shown = [...state.target];
    state.step = Math.min(3, state.step + 1);
    update();
});

ui.animate.addEventListener("click", animateSequence);
ui.reset.addEventListener("click", reset);

resetCamera();
setAircraftConvention();
resizeRenderer();
resizeProjection();
update();
