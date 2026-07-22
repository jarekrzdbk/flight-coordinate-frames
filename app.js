"use strict";

const angleControls = ["yaw", "pitch", "roll"].map(name => ({
    input: $(`${name}`),
    output: $(`${name}-value`)
}));

const ui = {
    labels: $("label-mode"),
    previous: $("previous"),
    next: $("next"),
    animate: $("animate"),
    reset: $("reset"),
    stage: $("stage-label"),
    sequence: $("sequence-text"),
    note: $("label-note"),
    formula: $("formula")
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
        : "Numbered mode uses 3–2–1 for X–Y–Z and S/T/K/P subscripts for successive frames.";

    const [psi, theta, phi] = STAGE_ANGLES;
    ui.formula.innerHTML =
        `M = R<sub>z</sub>(${psi}) · R<sub>y</sub>(${theta}) · ` +
            `R<sub>x</sub>(${phi}) &nbsp; x<sub>g</sub> = M · x<sub>body</sub>`;

    ui.previous.disabled = state.step === 0 || state.animating;
    ui.next.disabled = state.step === 3 || state.animating;
    ui.labels.disabled = state.animating;
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
    state.labels = "xyz";
    state.step = 3;

    angleControls.forEach((control, index) => {
        control.input.value = state.target[index];
    });

    ui.labels.value = state.labels;
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
resizeRenderer();
resizeProjection();
update();
