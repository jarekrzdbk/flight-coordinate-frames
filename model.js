"use strict";

const D2R = Math.PI / 180;
const EPS = 1e-7;

const SYMBOL = Object.freeze({
    psi: "\u03C8",
    theta: "\u03D1",
    phi: "\u03C6",
    prime: "\u2032",
    doublePrime: "\u2033",
    subS: "\u209B",
    subT: "\u209C",
    subK: "\u2096",
    subP: "\u209A"
});

const COLORS = Object.freeze({
    psi: "#c96a10",
    theta: "#7a1fa2",
    phi: "#0e7c7b",
    x: "#c62828",
    y: "#2e7d32",
    z: "#1a4fd6",
    ink: "#1b2430",
    grey: "#8a9096"
});

const STAGE_ANGLES = [SYMBOL.psi, SYMBOL.theta, SYMBOL.phi];
const STAGE_COLORS = [COLORS.psi, COLORS.theta, COLORS.phi];
const FRAME_CODES = ["S", "T", "K", "P"];
const AXES = ["z", "y", "x"];
const FIXED_AXIS = [2, 1, 0];
const NUMBERED_AXES = [3, 2, 1];

const PROJECTION = [
    [-1 / Math.sqrt(2),  1 / Math.sqrt(6)],
    [ 1 / Math.sqrt(2),  1 / Math.sqrt(6)],
    [ 0,                 -2 / Math.sqrt(6)]
];

const state = {
    target: [30, 20, 25],
    shown: [30, 20, 25],
    labels: "xyz",
    step: 3,
    animating: false
};

const $ = id => document.getElementById(id);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const identity = () => new THREE.Matrix4().identity();
const matrixColumn = (matrix, index) =>
    new THREE.Vector3().setFromMatrixColumn(matrix, index);

function axisVector(axis) {
    if (axis === "x") return new THREE.Vector3(1, 0, 0);
    if (axis === "y") return new THREE.Vector3(0, 1, 0);
    return new THREE.Vector3(0, 0, 1);
}

function rotationMatrix(axis, angle) {
    const matrix = new THREE.Matrix4();
    if (axis === "x") return matrix.makeRotationX(angle);
    if (axis === "y") return matrix.makeRotationY(angle);
    return matrix.makeRotationZ(angle);
}

function orientationData() {
    const frames = [identity()];
    const stages = [];

    for (let stage = 0; stage < 3; stage++) {
        const start = frames[stage];
        const angle = stage < state.step ? state.shown[stage] * D2R : 0;
        const fixedIndex = FIXED_AXIS[stage];
        const end = start.clone().multiply(rotationMatrix(AXES[stage], angle));

        frames.push(end);
        stages.push({
            start,
            end,
            angle,
            fixedIndex,
            axisWorld: matrixColumn(start, fixedIndex).normalize(),
            moved: Math.abs(angle) < EPS
                ? []
                : [0, 1, 2].filter(axis => axis !== fixedIndex)
        });
    }

    return { frames, stages };
}

function plainLabels(frame) {
    if (state.labels === "xyz") {
        return [
            ["Xg", "Yg", "Zg"],
            [`X${SYMBOL.prime}`, `Y${SYMBOL.prime}`, `Z${SYMBOL.prime}`],
            [`X${SYMBOL.doublePrime}`, `Y${SYMBOL.doublePrime}`, `Z${SYMBOL.doublePrime}`],
            ["X", "Y", "Z"]
        ][frame];
    }

    const suffix = [
        SYMBOL.subS,
        SYMBOL.subT,
        SYMBOL.subK,
        SYMBOL.subP
    ][frame];

    return NUMBERED_AXES.map(axis => `${axis}${suffix}`);
}

function frameLabels() {
    const labels = FRAME_CODES.map((_, frame) => [...plainLabels(frame)]);

    for (let stage = 0; stage < state.step; stage++) {
        const fixed = FIXED_AXIS[stage];
        labels[stage][fixed] += `, ${labels[stage + 1][fixed]}`;
        labels[stage + 1][fixed] = null;
    }

    return labels;
}

function stageArcText(stage) {
    return `${STAGE_ANGLES[stage]} about +${plainLabels(stage)[FIXED_AXIS[stage]]}`;
}
