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
const AXIS_INDEX = {x: 0, y: 1, z: 2};

const CONFIG = Object.freeze({
    ned: {
        name: "NED aircraft — X forward, Y right, Z down",
        shortName: "NED aircraft: X forward, Y right, Z down · right-handed (X × Y = Z).",
        sequences: {krylov: ["z", "y", "x"], euler: ["z", "y", "z"]},
        numbers: [3, 2, 1],
        up: new THREE.Vector3(0, 0, -1),
        defaultAzimuth: -3 * Math.PI / 4,
        projection: [
            [-1 / Math.sqrt(2), 1 / Math.sqrt(6)],
            [1 / Math.sqrt(2), 1 / Math.sqrt(6)],
            [0, -2 / Math.sqrt(6)]
        ]
    },
    yup: {
        name: "Textbook Y-up — X forward, Y up, Z right",
        shortName: "Textbook frame: X forward, Y up, Z right · right-handed (X × Y = Z).",
        sequences: {krylov: ["y", "z", "x"], euler: ["y", "z", "y"]},
        numbers: [3, 1, 2],
        up: new THREE.Vector3(0, 1, 0),
        defaultAzimuth: Math.PI / 4,
        projection: [
            [1 / Math.sqrt(2), -1 / Math.sqrt(6)],
            [0, 2 / Math.sqrt(6)],
            [-1 / Math.sqrt(2), -1 / Math.sqrt(6)]
        ]
    }
});

const state = {
    target: [30, 20, 25],
    shown: [30, 20, 25],
    convention: "ned",
    mode: "krylov",
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
    const axes = CONFIG[state.convention].sequences[state.mode];

    for (let stage = 0; stage < 3; stage++) {
        const start = frames[stage];
        const angle = stage < state.step ? state.shown[stage] * D2R : 0;
        const fixedIndex = AXIS_INDEX[axes[stage]];
        const end = start.clone().multiply(rotationMatrix(axes[stage], angle));

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

    return CONFIG[state.convention].numbers.map(axis => `${axis}${suffix}`);
}

function frameLabels() {
    const labels = FRAME_CODES.map((_, frame) => [...plainLabels(frame)]);
    const axes = CONFIG[state.convention].sequences[state.mode];

    for (let stage = 0; stage < state.step; stage++) {
        const fixed = AXIS_INDEX[axes[stage]];
        labels[stage][fixed] += `, ${labels[stage + 1][fixed]}`;
        labels[stage + 1][fixed] = null;
    }

    return labels;
}

function currentFrameLabel(labels, axis) {
    return labels[state.step][axis] ||
        (state.step > 0 ? labels[state.step - 1][axis] : null);
}

function stageArcText(stage) {
    const axis = CONFIG[state.convention].sequences[state.mode][stage];
    return `${STAGE_ANGLES[stage]} about +${plainLabels(stage)[AXIS_INDEX[axis]]}`;
}
